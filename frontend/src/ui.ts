/**
 * ui.ts — dom manipulation for guess input and results list
 * 
 * handles:
 * - input form submission
 * - rendering guess list with rank/percentile/color
 * - win state celebration
 * - error/loading states
 */

import type { Guess } from "./types.ts";

export type UICallbacks = {
  onGuess: (word: string) => void;
  onRandomWord?: () => void;
};

export class GameUI {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private form: HTMLFormElement;
  private guessList: HTMLElement;
  private statusEl: HTMLElement;
  private guessCountEl: HTMLElement;
  private randomBtn: HTMLButtonElement;
  
  private guessCount = 0;
  private won = false;
  
  constructor(container: HTMLElement, callbacks: UICallbacks) {
    this.container = container;
    
    // build the UI structure
    this.container.innerHTML = `
      <div class="game-header">
        <h1>embeddage</h1>
        <p class="subtitle">guess today's word! lower # is better</p>
      </div>
      
      <form class="guess-form">
        <input 
          type="text" 
          class="guess-input" 
          placeholder="enter a word..."
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <button type="button" class="random-btn" title="random word">
          <span class="icon-die" aria-hidden="true"></span>
        </button>
        <button type="submit" class="guess-btn">guess</button>
      </form>
      
      <div class="status"></div>
      
      <div class="stats">
        <span class="guess-count">0 guesses</span>
      </div>
      
      <div class="guess-list"></div>
    `;
    
    this.form = this.container.querySelector(".guess-form")!;
    this.input = this.container.querySelector(".guess-input")!;
    this.guessList = this.container.querySelector(".guess-list")!;
    this.statusEl = this.container.querySelector(".status")!;
    this.guessCountEl = this.container.querySelector(".guess-count")!;
    this.randomBtn = this.container.querySelector(".random-btn") as HTMLButtonElement;
    
    // form submission
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const word = this.input.value.trim();
      if (word && !this.won) {
        callbacks.onGuess(word);
        this.input.value = "";
      }
    });

    // random word button — delegates to callback
    this.randomBtn.addEventListener("click", () => {
      if (this.won) return;
      callbacks.onRandomWord?.();
    });
    
    // focus input
    this.input.focus();
  }
  
  /**
   * add a guess to the list
   */
  addGuess(guess: Guess, isWin: boolean) {
    this.guessCount++;
    this.guessCountEl.textContent = `${this.guessCount} guess${this.guessCount === 1 ? "" : "es"}`;
    
    const item = document.createElement("div");
    item.className = `guess-item ${guess.kind} ${isWin ? "win" : ""}`;
    
    // color bar
    const colorStyle = `rgb(${guess.color.r}, ${guess.color.g}, ${guess.color.b})`;
    
    // score used for sorting by semantic similarity (descending)
    const sortScore = guess.score ?? -1;
    item.dataset.score = String(sortScore);

    if (guess.rank !== null) {
      item.innerHTML = `
        <div class="guess-color" style="background: ${colorStyle}"></div>
        <span class="guess-word">${escapeHtml(guess.word)}</span>
        <span class="guess-rank">#${guess.rank.toLocaleString()}</span>
      `;
    } else {
      // out of vocabulary
      item.innerHTML = `
        <div class="guess-color" style="background: ${colorStyle}"></div>
        <span class="guess-word">${escapeHtml(guess.word)}</span>
        <span class="guess-rank oov">not in vocab</span>
      `;
    }
    
    // insert into list sorted by semantic similarity (score desc)
    const children = Array.from(this.guessList.children) as HTMLElement[];
    let inserted = false;
    for (const child of children) {
      const childScore = parseFloat(child.dataset.score ?? "-1");
      if (sortScore > childScore) {
        this.guessList.insertBefore(item, child);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.guessList.appendChild(item);
    }

    if (isWin) {
      this.showWin(guess);
    }
  }
  
  /**
   * show winning state
   */
  private showWin(guess: Guess) {
    this.won = true;
    this.input.disabled = true;
    
    this.statusEl.innerHTML = `
      <div class="win-message">
        🎉 you got it! the word was <strong>${escapeHtml(guess.word)}</strong>
        <br>
        <span class="win-stats">solved in ${this.guessCount} guess${this.guessCount === 1 ? "" : "es"}</span>
      </div>
    `;
    this.statusEl.classList.add("win");
  }

  /**
   * show loading state
   */
  showLoading(message = "loading...") {
    this.statusEl.textContent = message;
    this.statusEl.classList.add("loading");
    this.input.disabled = true;
  }
  
  /**
   * hide loading state
   */
  hideLoading() {
    this.statusEl.textContent = "";
    this.statusEl.classList.remove("loading");
    this.input.disabled = false;
    this.input.focus();
  }
  
  /**
   * show error
   */
  showError(message: string) {
    this.statusEl.textContent = message;
    this.statusEl.classList.add("error");
  }
  
  /**
   * show duplicate guess feedback
   */
  showDuplicate(word: string) {
    this.statusEl.textContent = `you already guessed "${word}"`;
    this.statusEl.classList.add("duplicate");
    setTimeout(() => {
      this.statusEl.textContent = "";
      this.statusEl.classList.remove("duplicate");
    }, 2000);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

