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
import type { Artifacts, Guess } from "./types.ts";
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
  
  // track guesses to prevent duplicates
  const guessedWords = new Set<string>();
  const guesses: Guess[] = [];
  
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
        
        // check for win
        const isWin = isWinningGuess(guess);
        
        // update UI and scene
        ui.addGuess(guess, isWin);
        scene.addGuess(guess);
        
        if (isWin) {
          scene.highlightWin(guess);
          console.log("🎉 winner!");
        }
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

        const isWin = isWinningGuess(guess);
        ui.addGuess(guess, isWin);
        scene.addGuess(guess);

        if (isWin) {
          scene.highlightWin(guess);
          console.log("🎉 winner (random)!");
        }
      },
    });
    
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
