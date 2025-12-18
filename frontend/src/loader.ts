/**
 * loader.ts — fetch and parse daily artifacts
 * 
 * handles:
 * - resolving "today" in NY timezone
 * - fetching words.json (once)
 * - fetching daily meta, rank, local_ids, xyz
 * - building typed arrays and lookup maps
 */

import type { Meta, Artifacts } from "./types.ts";

/**
 * get today's date string in America/New_York timezone
 */
export function getTodayNY(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date()); // "YYYY-MM-DD"
}

/**
 * fetch vocab list (cached after first load)
 */
let cachedWords: string[] | null = null;

export async function fetchWords(): Promise<string[]> {
  if (cachedWords) return cachedWords;
  
  const res = await fetch("./words.json");
  if (!res.ok) throw new Error(`failed to fetch words.json: ${res.status}`);
  
  cachedWords = await res.json();
  return cachedWords!;
}

/**
 * build word → id lookup map
 */
export function buildWordToId(words: string[]): Map<string, number> {
  return new Map(words.map((w, i) => [w, i]));
}

/**
 * fetch all artifacts for a given date
 */
export async function fetchArtifacts(date: string): Promise<Artifacts> {
  const base = `./data/${date}`;
  
  // fetch all in parallel
  const [words, metaRes, rankRes, localIdsRes, xyzRes] = await Promise.all([
    fetchWords(),
    fetch(`${base}.meta.json`),
    fetch(`${base}.rank.bin`),
    fetch(`${base}.local_ids.json`),
    fetch(`${base}.local_xyz.bin`),
  ]);
  
  // check responses
  if (!metaRes.ok) throw new Error(`meta.json: ${metaRes.status}`);
  if (!rankRes.ok) throw new Error(`rank.bin: ${rankRes.status}`);
  if (!localIdsRes.ok) throw new Error(`local_ids.json: ${localIdsRes.status}`);
  if (!xyzRes.ok) throw new Error(`local_xyz.bin: ${xyzRes.status}`);
  
  // parse
  const meta: Meta = await metaRes.json();
  const localIds: number[] = await localIdsRes.json();
  
  const rankBuffer = await rankRes.arrayBuffer();
  const rank = new Uint32Array(rankBuffer);
  
  const xyzBuffer = await xyzRes.arrayBuffer();
  const xyz = new Float32Array(xyzBuffer);
  
  // sanity checks
  if (rank.length !== meta.vocab_size) {
    throw new Error(`rank size mismatch: ${rank.length} vs ${meta.vocab_size}`);
  }
  if (xyz.length !== 3 * meta.k) {
    throw new Error(`xyz size mismatch: ${xyz.length} vs ${3 * meta.k}`);
  }
  if (localIds.length !== meta.k) {
    throw new Error(`localIds size mismatch: ${localIds.length} vs ${meta.k}`);
  }
  
  // build local index lookup: vocab id → index in localIds array
  const localIndexById = new Map<number, number>();
  localIds.forEach((id, i) => localIndexById.set(id, i));
  
  return {
    meta,
    words,
    rank,
    localIds,
    localIndexById,
    xyz,
  };
}

