/**
 * main.ts — wire everything together
 * 
 * - load artifacts for today
 * - set up 3d scene
 * - set up UI
 * - handle guesses
 */

import { getTodayNY, fetchArtifacts, buildWordToId } from "./loader.ts";
import { processGuess, isWinningGuess, normalizeGuess } from "./game.ts";
import { SemanticScene } from "./scene.ts";
import { GameUI } from "./ui.ts";
import {
  ensurePlayer,
  fetchCollectiveGuesses,
  fetchLeaderboard,
  publishCollectiveGuess,
  syncGameState,
} from "./api.ts";
import type { Artifacts, Guess, PlayMode } from "./types.ts";
import "./style.css";

async function main() {
  const appEl = document.getElementById("app")!;
  
  // split into two panels: 3d view and game UI
  appEl.innerHTML = `
    <div class="layout">
      <div class="scene-container"></div>
      <div class="ui-container"></div>
    </div>
  `;
  
  const sceneContainer = appEl.querySelector(".scene-container") as HTMLElement;
  const uiContainer = appEl.querySelector(".ui-container") as HTMLElement;
  
  // placeholder UI while loading
  uiContainer.innerHTML = `<div class="loading-screen">loading today's puzzle...</div>`;
  
  // determine today's date
  const date = getTodayNY();
  console.log(`loading puzzle for: ${date}`);

  let artifacts: Artifacts;
  let wordToId: Map<string, number>;
  let scene: SemanticScene;
  let ui: GameUI;
  let playerId: string | null = null;
  let bestRank: number | null = null;
  let finished = false;
  let syncTimer: number | null = null;
  let collectiveTimer: number | null = null;
  let playMode: PlayMode = "solo";

  // track guesses to prevent duplicates
  const guessedWords = new Set<string>();
  const guesses: Guess[] = [];
  const collectiveRendered = new Set<string>();

  const ensureIdentity = async () => {
    try {
      const identity = await ensurePlayer();
      playerId = identity.playerId;
    } catch (err) {
      console.warn("could not register player (api offline?)", err);
    }
  };

  const pushGameState = async () => {
    if (!playerId) {
      await ensureIdentity();
      if (!playerId) return;
    }

    try {
      const res = await syncGameState(playerId, {
        date,
        bestRank,
        guessCount: guesses.length,
        finished,
      });
      playerId = res.player_id;
      ui.setLeaderboard(res.leaderboard, playerId);
    } catch (err) {
      console.warn("failed to sync game state", err);
    }
  };

  const scheduleSync = (immediate = false) => {
    if (immediate) {
      void pushGameState();
      return;
    }

    if (syncTimer) {
      window.clearTimeout(syncTimer);
    }
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      void pushGameState();
    }, 800);
  };

  const stopCollectiveLoop = () => {
    if (collectiveTimer) {
      window.clearTimeout(collectiveTimer);
      collectiveTimer = null;
    }
  };

  const refreshCollective = async () => {
    if (playMode !== "collective") return;
    try {
      const crowd = await fetchCollectiveGuesses(date, 50);
      ui.setCollectiveGuesses(crowd);

      crowd.forEach((entry) => {
        const normalized = normalizeGuess(entry.word);
        if (guessedWords.has(normalized) || collectiveRendered.has(normalized)) return;

        const guess = processGuess(entry.word, artifacts, wordToId);
        scene.addGuess(guess);
        collectiveRendered.add(normalized);
      });
    } catch (err) {
      console.warn("failed to refresh collective guesses", err);
    } finally {
      stopCollectiveLoop();
      collectiveTimer = window.setTimeout(refreshCollective, 3000);
    }
  };

  const setMode = (mode: PlayMode) => {
    playMode = mode;
    ui.setMode(mode);
    if (mode === "collective") {
      void refreshCollective();
    } else {
      stopCollectiveLoop();
      collectiveRendered.clear();
    }
  };

  const refreshLeaderboard = async () => {
    ui.showLeaderboardLoading();
    try {
      const leaderboard = await fetchLeaderboard(date, 25);
      ui.setLeaderboard(leaderboard, playerId ?? undefined);
    } catch (err) {
      console.warn("failed to load leaderboard", err);
      ui.showLeaderboardError("leaderboard unavailable");
    }
  };

  await ensureIdentity();

  const publishCrowdGuess = async (guess: Guess) => {
    if (playMode !== "collective") return;
    if (!playerId) {
      await ensureIdentity();
      if (!playerId) return;
    }

    try {
      await publishCollectiveGuess(playerId, {
        date,
        word: guess.word,
        rank: guess.rank,
        score: guess.score,
      });
    } catch (err) {
      console.warn("failed to publish collective guess", err);
    }
  };

  try {
    // load artifacts
    artifacts = await fetchArtifacts(date);
    wordToId = buildWordToId(artifacts.words);
    
    console.log(`loaded: ${artifacts.meta.vocab_size.toLocaleString()} words, k=${artifacts.meta.k}`);
    
    // set up 3d scene
    scene = new SemanticScene(sceneContainer);
    
    // set up UI
    ui = new GameUI(uiContainer, {
      onGuess: (word: string) => {
        const normalized = normalizeGuess(word);
        
        // check for duplicate
        if (guessedWords.has(normalized)) {
          ui.showDuplicate(word);
          return;
        }
        guessedWords.add(normalized);
        
        // process guess
        const guess = processGuess(word, artifacts, wordToId);
        guesses.push(guess);

        if (guess.rank !== null) {
          bestRank = bestRank === null ? guess.rank : Math.min(bestRank, guess.rank);
        }

        // check for win
        const isWin = isWinningGuess(guess);
        if (isWin) {
          finished = true;
        }

        // update UI and scene
        ui.addGuess(guess, isWin);
        scene.addGuess(guess);

        void publishCrowdGuess(guess);

        if (isWin) {
          scene.highlightWin(guess);
          console.log("🎉 winner!");
        }

        scheduleSync(isWin);
      },
      onRandomWord: () => {
        const maxAttempts = 20;
        let attempt = 0;
        let word: string | null = null;

        while (attempt < maxAttempts) {
          const idx = Math.floor(Math.random() * artifacts.words.length);
          const candidate = artifacts.words[idx];
          const normalized = normalizeGuess(candidate);
          if (!guessedWords.has(normalized)) {
            word = candidate;
            break;
          }
          attempt++;
        }

        if (!word) {
          // fallback: nothing new to guess
          return;
        }

        // delegate to the normal guess path
        const normalized = normalizeGuess(word);
        if (guessedWords.has(normalized)) return;
        guessedWords.add(normalized);

        const guess = processGuess(word, artifacts, wordToId);
        guesses.push(guess);

        if (guess.rank !== null) {
          bestRank = bestRank === null ? guess.rank : Math.min(bestRank, guess.rank);
        }

        const isWin = isWinningGuess(guess);
        ui.addGuess(guess, isWin);
        scene.addGuess(guess);

        void publishCrowdGuess(guess);

        if (isWin) {
          scene.highlightWin(guess);
          console.log("🎉 winner (random)!");
          finished = true;
        }

        scheduleSync(isWin);
      },
      onRefreshLeaderboard: () => void refreshLeaderboard(),
      onModeChange: (mode) => {
        setMode(mode);
      },
    });

    setMode(playMode);

    void refreshLeaderboard();

  } catch (err) {
    console.error("failed to load puzzle:", err);
    uiContainer.innerHTML = `
      <div class="error-screen">
        <h2>couldn't load today's puzzle</h2>
        <p>${err instanceof Error ? err.message : "unknown error"}</p>
        <p>try refreshing, or check back later!</p>
      </div>
    `;
  }
}

main();
