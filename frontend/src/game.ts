/**
 * game.ts — guess processing, scoring, and color mapping
 * 
 * handles:
 * - normalizing user input
 * - looking up rank and computing percentile
 * - applying sigmoid shaping for visual contrast
 * - mapping score to color gradient
 * - generating deterministic halo positions for outsiders
 */

import type { Artifacts, Guess, GuessKind } from "./types.ts";

/**
 * normalize a guess: lowercase, trim, strip trailing punctuation
 */
export function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"]+$/, ""); // strip trailing punctuation
}

/**
 * convert rank to percentile [0,1] where 1 = best (rank 1)
 */
export function rankToPercentile(rank: number, vocabSize: number): number {
  // rank 1 → percentile 1.0
  // rank V → percentile 0.0
  return 1 - (rank - 1) / (vocabSize - 1);
}

/**
 * apply sigmoid shaping to percentile for visual contrast
 * 
 * raw percentile is too linear — mid-range guesses look too similar.
 * sigmoid makes the "hot zone" (high percentile) pop more.
 * 
 * s(p) = 1 / (1 + e^(-a*(p-b)))
 * 
 * a controls steepness, b controls midpoint
 */
export function shapeScore(percentile: number, a = 12, b = 0.5): number {
  return 1 / (1 + Math.exp(-a * (percentile - b)));
}

/**
 * color palette: cold (far) → hot (close)
 */
const COLD = { r: 51, g: 51, b: 51 };     // dark gray (#333)
const HOT = { r: 255, g: 102, b: 0 };     // orange (#ff6600)
const OUTER = { r: 34, g: 34, b: 34 };    // near-black (#222)

/**
 * interpolate between cold and hot based on score [0,1]
 */
export function scoreToColor(score: number): { r: number; g: number; b: number } {
  const t = Math.max(0, Math.min(1, score));
  return {
    r: Math.round(COLD.r + t * (HOT.r - COLD.r)),
    g: Math.round(COLD.g + t * (HOT.g - COLD.g)),
    b: Math.round(COLD.b + t * (HOT.b - COLD.b)),
  };
}

/**
 * simple string hash for deterministic outsider positions
 */
function hashString(str: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return h >>> 0; // ensure unsigned
}

/**
 * generate deterministic halo position for an outsider guess
 * 
 * places the point on a sphere of radius R_out, using the hash
 * of (date + word) for consistent positioning.
 */
export function outsiderPosition(
  date: string,
  normalized: string,
  radius = 2.5
): { x: number; y: number; z: number } {
  const key = `${date}:${normalized}`;
  const hash = hashString(key);
  
  // extract two values from hash for spherical coords
  const u = ((hash & 0xffff) / 0xffff); // [0,1]
  const v = (((hash >> 16) & 0xffff) / 0xffff); // [0,1]
  
  // convert to spherical: theta [0, 2π], phi [0, π]
  const theta = u * 2 * Math.PI;
  const phi = Math.acos(2 * v - 1); // uniform distribution on sphere
  
  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi),
  };
}

/**
 * find word ID using lemmatization fallback
 * 
 * tries exact match first, then lemmatized match if available
 */
function findWordId(
  normalized: string,
  wordToId: Map<string, number>,
  lemmas?: {
    wordToLemma: Map<string, string>;
    lemmaToWords: Map<string, string[]>;
  }
): number | null {
  // try exact match first
  const exactId = wordToId.get(normalized);
  if (exactId !== undefined) return exactId;
  
  // try lemmatization fallback
  if (lemmas) {
    // get lemma for the input word
    const lemma = lemmas.wordToLemma.get(normalized);
    if (lemma) {
      // find all words with this lemma
      const wordsWithLemma = lemmas.lemmaToWords.get(lemma);
      if (wordsWithLemma) {
        // try to find the first word that exists in vocabulary
        for (const word of wordsWithLemma) {
          const id = wordToId.get(word);
          if (id !== undefined) return id;
        }
      }
    }
  }
  
  return null;
}

/**
 * process a user guess and return full Guess object
 */
export function processGuess(
  input: string,
  artifacts: Artifacts,
  wordToId: Map<string, number>
): Guess {
  const normalized = normalizeGuess(input);
  const id = findWordId(normalized, wordToId, artifacts.lemmas);
  
  // out of vocabulary
  if (id === null) {
    return {
      word: input,
      normalized,
      id: null,
      rank: null,
      percentile: null,
      score: null,
      color: OUTER,
      kind: "outer",
      xyz: outsiderPosition(artifacts.meta.date, normalized),
      createdAt: Date.now(),
    };
  }
  
  const rank = artifacts.rank[id];
  const percentile = rankToPercentile(rank, artifacts.meta.vocab_size);
  const score = shapeScore(percentile);
  const color = scoreToColor(score);
  
  // check if in local cluster
  const localIndex = artifacts.localIndexById.get(id);
  const isLocal = localIndex !== undefined;
  
  let xyz: { x: number; y: number; z: number } | null = null;
  let kind: GuessKind = "outer";
  
  const secretId = artifacts.meta.secret_id;

  if (secretId !== undefined && id === secretId) {
    // winning word: place at exact center of the semantic globe
    xyz = { x: 0, y: 0, z: 0 };
    kind = "local";
  } else if (isLocal) {
    const i = localIndex * 3;
    xyz = {
      x: artifacts.xyz[i],
      y: artifacts.xyz[i + 1],
      z: artifacts.xyz[i + 2],
    };
    kind = "local";
  } else {
    // outsider with known word — place in halo
    xyz = outsiderPosition(artifacts.meta.date, normalized);
    kind = "outer";
  }
  
  return {
    word: input,
    normalized,
    id,
    rank,
    percentile,
    score,
    color,
    kind,
    xyz,
    createdAt: Date.now(),
  };
}

/**
 * check if a guess is the secret word (rank === 1)
 */
export function isWinningGuess(guess: Guess): boolean {
  return guess.rank === 1;
}

/**
 * hash a word for client-side verification
 */
export async function hashWord(word: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(word + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * verify if a guess matches the secret hash
 */
export async function verifyWin(
  guess: Guess,
  secretHash: string,
  date: string
): Promise<boolean> {
  if (guess.rank !== 1) return false;
  const hash = await hashWord(guess.normalized, date);
  return hash === secretHash;
}

