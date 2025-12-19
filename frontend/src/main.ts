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
  RateLimitError,
  syncGameState,
  updateNickname,
} from "./api.ts";
import type {
  Artifacts,
  CollectiveGuessEntry,
  Guess,
  PlayMode,
  UnifiedCollectiveEntry,
} from "./types.ts";
import "./style.css";

async function main() {
  const appEl = document.getElementById("app")!;
  
  // split into two panels: 3d view and game UI
  appEl.innerHTML = `
    <div class="layout">
      <div class="ui-container"></div>
      <div class="scene-container"></div>
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
  let playerNickname: string | null = null;
  let bestRank: number | null = null;
  let finished = false;
  let syncTimer: number | null = null;
  let collectiveTimer: number | null = null;
  let playMode: PlayMode = "solo";

  // track guesses to prevent duplicates
  const guessedWords = new Set<string>();
  const guesses: Guess[] = [];
  let crowdGuesses: CollectiveGuessEntry[] = [];
  const collectiveRendered = new Set<string>();

  const applyNickname = (nickname: string | null) => {
    playerNickname = nickname;
    ui?.setPlayerName(nickname);
  };

  const ensureIdentity = async () => {
    try {
      const identity = await ensurePlayer();
      playerId = identity.playerId;
      if (identity.nickname !== undefined && identity.nickname !== null) {
        applyNickname(identity.nickname);
      }
    } catch (err) {
      console.warn("could not register player (api offline?)", err);
    }
  };

  const handleRateLimit = () => {
    const secretWord = artifacts?.meta.secret_word;
    if (secretWord) {
      ui.showRateLimitGameOver(secretWord);
      // also highlight the secret word in the scene if we have it
      if (artifacts && wordToId) {
        const secretId = artifacts.meta.secret_id;
        if (secretId !== undefined) {
          const secretGuess = processGuess(secretWord, artifacts, wordToId);
          scene.highlightWin(secretGuess);
        }
      }
    } else {
      ui.showError("rate limit reached — game over");
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
      if (res.nickname !== undefined) {
        applyNickname(res.nickname ?? null);
      }
      ui.setLeaderboard(res.leaderboard, playerId);
    } catch (err) {
      if (err instanceof RateLimitError) {
        handleRateLimit();
        return;
      }
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

  const mergeCollectiveGuesses = (): UnifiedCollectiveEntry[] => {
    const map = new Map<string, UnifiedCollectiveEntry>();

    crowdGuesses.forEach((entry) => {
      map.set(entry.normalized, { ...entry, isSelf: false });
    });

    guesses.forEach((guess) => {
      const normalized = guess.normalized;
      const bestRank = guess.rank ?? null;
      const bestScore = guess.score ?? null;
      const existing = map.get(normalized);

      if (existing) {
        const nextBestRank =
          existing.bestRank === null
            ? bestRank
            : bestRank === null
              ? existing.bestRank
              : Math.min(existing.bestRank, bestRank);
        const nextBestScore =
          existing.bestScore === null
            ? bestScore
            : bestScore === null
              ? existing.bestScore
              : Math.max(existing.bestScore, bestScore);

        map.set(normalized, {
          ...existing,
          isSelf: true,
          bestRank: nextBestRank,
          bestScore: nextBestScore,
          count: existing.count + (existing.isSelf ? 0 : 1),
          lastSeenAt: Math.max(existing.lastSeenAt, guess.createdAt),
        });
      } else {
        map.set(normalized, {
          word: guess.word,
          normalized,
          bestRank,
          bestScore,
          count: 1,
          lastSeenAt: guess.createdAt,
          isSelf: true,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      // sort by bestRank (ascending - lower rank is better, so best at top)
      const rankA = a.bestRank ?? Number.POSITIVE_INFINITY;
      const rankB = b.bestRank ?? Number.POSITIVE_INFINITY;
      if (rankA !== rankB) return rankA - rankB;
      // then by count (descending - more popular first)
      if (b.count !== a.count) return b.count - a.count;
      // finally by lastSeenAt (descending - most recent first)
      return b.lastSeenAt - a.lastSeenAt;
    });
  };

  const renderCollectiveStream = () => {
    if (playMode !== "collective") return;
    ui.setCollectiveGuesses(mergeCollectiveGuesses());
  };

  const refreshCollective = async () => {
    if (playMode !== "collective") return;
    try {
      crowdGuesses = await fetchCollectiveGuesses(date, 50);
      renderCollectiveStream();

      crowdGuesses.forEach((entry) => {
        const normalized = normalizeGuess(entry.word);
        if (guessedWords.has(normalized) || collectiveRendered.has(normalized)) return;

        const guess = processGuess(entry.word, artifacts, wordToId);
        scene.addGuess(guess);
        collectiveRendered.add(normalized);
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        handleRateLimit();
        stopCollectiveLoop();
        return;
      }
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
      renderCollectiveStream();
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
      if (err instanceof RateLimitError) {
        handleRateLimit();
        return;
      }
      console.warn("failed to load leaderboard", err);
      ui.showLeaderboardError("leaderboard unavailable");
    }
  };

  const maybeAutoRefreshLeaderboard = () => {
    if (guesses.length > 0 && guesses.length % 5 === 0) {
      void refreshLeaderboard();
    }
  };

  const saveNickname = async (name: string | null) => {
    if (!playerId) {
      await ensureIdentity();
      if (!playerId) {
        ui.showNameStatus("try again in a bit", true);
        return;
      }
    }

    try {
      const profile = await updateNickname(playerId, name);
      applyNickname(profile.nickname ?? null);
      ui.showNameStatus(profile.nickname ? "saved" : "cleared to anon");
      void refreshLeaderboard();
    } catch (err) {
      if (err instanceof RateLimitError) {
        handleRateLimit();
        return;
      }
      console.warn("failed to save nickname", err);
      ui.showNameStatus("couldn't save name", true);
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
      if (err instanceof RateLimitError) {
        handleRateLimit();
        return;
      }
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

        renderCollectiveStream();

        void publishCrowdGuess(guess);
        if (isWin) {
          scene.highlightWin(guess);
          console.log("🎉 winner!");
        }

        scheduleSync(isWin);
        maybeAutoRefreshLeaderboard();
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

        renderCollectiveStream();

        void publishCrowdGuess(guess);

        if (isWin) {
          scene.highlightWin(guess);
          console.log("🎉 winner (random)!");
          finished = true;
        }

        scheduleSync(isWin);
        maybeAutoRefreshLeaderboard();
      },
      onRefreshLeaderboard: () => void refreshLeaderboard(),
      onModeChange: (mode) => {
        setMode(mode);
      },
      onUpdateName: (name) => {
        void saveNickname(name);
      },
    });

    ui.setPlayerName(playerNickname);

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
