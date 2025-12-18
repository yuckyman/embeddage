/**
 * ui.ts — dom manipulation for guess input and results list
 * 
 * handles:
 * - input form submission
 * - rendering guess list with rank/percentile/color
 * - win state celebration
 * - error/loading states
 */

import type { Guess, LeaderboardEntry, PlayMode, UnifiedCollectiveEntry } from "./types.ts";

export type UICallbacks = {
  onGuess: (word: string) => void;
  onRandomWord?: () => void;
  onRefreshLeaderboard?: () => void;
  onModeChange?: (mode: PlayMode) => void;
  onUpdateName?: (name: string | null) => void;
};

export class GameUI {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private form: HTMLFormElement;
  private guessList: HTMLElement;
  private guessPanel: HTMLElement;
  private statusEl: HTMLElement;
  private guessCountEl: HTMLElement;
  private randomBtn: HTMLButtonElement;
  private modeToggleBtn: HTMLButtonElement;
  private modeSolo: HTMLInputElement;
  private modeCollective: HTMLInputElement;
  private collectiveList: HTMLElement;
  private collectiveCopy: HTMLElement;
  private collectiveJoinBtn: HTMLButtonElement;
  private nameForm: HTMLFormElement;
  private nameInput: HTMLInputElement;
  private nameStatus: HTMLElement;
  private leaderboardEntries: HTMLElement;
  private leaderboardStatus: HTMLElement;
  private leaderboardRefresh: HTMLButtonElement;

  private guessCount = 0;
  private won = false;
  private mode: PlayMode = "solo";
  
  constructor(container: HTMLElement, callbacks: UICallbacks) {
    this.container = container;
    
    // build the UI structure
    this.container.innerHTML = `
      <div class="game-header">
        <h1>embeddage</h1>
        <p class="subtitle">guess today's word! lower # is better</p>
      </div>

      <div class="mode-toggle" role="group" aria-label="play mode">
        <div class="mode-switches">
          <label>
            <input type="radio" name="play-mode" value="solo" checked />
            solo
          </label>
          <label>
            <input type="radio" name="play-mode" value="collective" />
            with everyone
          </label>
        </div>
        <button type="button" class="mode-toggle-btn">with everyone</button>
        <span class="mode-hint">opt into sharing & seeing community guesses</span>
      </div>

      <div class="identity-card">
        <div class="identity-title">your name</div>
        <form class="name-form">
          <input
            type="text"
            class="name-input"
            placeholder="anon"
            maxlength="64"
            inputmode="text"
            autocomplete="off"
          />
          <button type="submit" class="name-save">save</button>
        </form>
        <div class="name-status"></div>
        <div class="name-hint">shown on the leaderboard and shared guesses</div>
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

      <div class="panels">
        <div class="guess-panel">
          <div class="panel-title">your guesses</div>
          <div class="guess-list"></div>
        </div>

        <div class="collective-panel">
          <div class="panel-title">everyone's guesses</div>
          <div class="collective-stats">
            <div class="collective-copy">join to see the crowd</div>
            <button type="button" class="collective-join">play with everyone</button>
          </div>
          <div class="collective-list"></div>
        </div>

        <div class="leaderboard">
          <div class="leaderboard-header">
            <div class="leaderboard-title">today's leaderboard</div>
            <button class="leaderboard-refresh" type="button">refresh</button>
          </div>
          <div class="leaderboard-status">loading...</div>
          <div class="leaderboard-entries"></div>
        </div>
      </div>
    `;

    this.form = this.container.querySelector(".guess-form")!;
    this.input = this.container.querySelector(".guess-input")!;
    this.guessPanel = this.container.querySelector(".guess-panel")!;
    this.guessList = this.container.querySelector(".guess-list")!;
    this.statusEl = this.container.querySelector(".status")!;
    this.guessCountEl = this.container.querySelector(".guess-count")!;
    this.randomBtn = this.container.querySelector(".random-btn") as HTMLButtonElement;
    this.collectiveList = this.container.querySelector(".collective-list")!;
    this.collectiveCopy = this.container.querySelector(".collective-copy")!;
    this.modeSolo = this.container.querySelector(
      'input[name="play-mode"][value="solo"]',
    ) as HTMLInputElement;
    this.modeCollective = this.container.querySelector(
      'input[name="play-mode"][value="collective"]',
    ) as HTMLInputElement;
    this.modeToggleBtn = this.container.querySelector(".mode-toggle-btn") as HTMLButtonElement;
    this.collectiveJoinBtn = this.container.querySelector(".collective-join") as HTMLButtonElement;
    this.nameForm = this.container.querySelector(".name-form") as HTMLFormElement;
    this.nameInput = this.container.querySelector(".name-input") as HTMLInputElement;
    this.nameStatus = this.container.querySelector(".name-status")!;
    this.leaderboardEntries = this.container.querySelector(".leaderboard-entries")!;
    this.leaderboardStatus = this.container.querySelector(".leaderboard-status")!;
    this.leaderboardRefresh = this.container.querySelector(
      ".leaderboard-refresh",
    ) as HTMLButtonElement;

    this.disableDoubleTapZoom([
      this.randomBtn,
      this.modeToggleBtn,
      this.collectiveJoinBtn,
      this.leaderboardRefresh,
      this.nameForm,
    ]);
    
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

    this.leaderboardRefresh.addEventListener("click", () => {
      callbacks.onRefreshLeaderboard?.();
    });
    this.modeSolo.addEventListener("change", () => {
      if (this.modeSolo.checked) this.setMode("solo", callbacks.onModeChange);
    });
    this.modeCollective.addEventListener("change", () => {
      if (this.modeCollective.checked) this.setMode("collective", callbacks.onModeChange);
    });
    this.modeToggleBtn.addEventListener("click", () => {
      const next = this.mode === "solo" ? "collective" : "solo";
      this.setMode(next, callbacks.onModeChange);
    });
    this.collectiveJoinBtn.addEventListener("click", () => {
      this.setMode("collective", callbacks.onModeChange);
    });
    this.nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = this.nameInput.value.trim();
      callbacks.onUpdateName?.(name.length ? name : null);
      this.showNameStatus("saving...");
    });
    this.nameInput.addEventListener("input", () => {
      this.clearNameStatus();
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

  setPlayerName(name: string | null) {
    this.nameInput.value = name ?? "";
    this.nameInput.placeholder = name ?? "anon";
  }

  showNameStatus(message: string, isError = false) {
    this.nameStatus.textContent = message;
    this.nameStatus.classList.toggle("error", isError);
  }

  clearNameStatus() {
    this.nameStatus.textContent = "";
    this.nameStatus.classList.remove("error");
  }

  setMode(mode: PlayMode, notify?: (mode: PlayMode) => void) {
    this.mode = mode;
    this.modeSolo.checked = mode === "solo";
    this.modeCollective.checked = mode === "collective";

    this.container.classList.toggle("mode-collective", mode === "collective");
    this.container.classList.toggle("mode-solo", mode === "solo");
    this.guessPanel.classList.toggle("collapsed", mode === "collective");

    this.modeToggleBtn.textContent = mode === "collective" ? "back to solo" : "with everyone";
    this.collectiveJoinBtn.textContent =
      mode === "collective" ? "live with everyone" : "play with everyone";
    this.collectiveJoinBtn.disabled = mode === "collective";

    if (mode === "collective") {
      this.collectiveCopy.textContent = "live crowd guesses updating";
    } else {
      this.collectiveCopy.textContent = "join to see the crowd";
      this.collectiveList.innerHTML = "";
    }

    notify?.(mode);
  }

  setCollectiveGuesses(entries: UnifiedCollectiveEntry[]) {
    if (this.mode !== "collective") return;
    if (!entries.length) {
      this.collectiveList.innerHTML = "<div class=\"collective-empty\">no crowd guesses yet</div>";
      return;
    }

    this.collectiveList.innerHTML = "";
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "collective-row";
      row.innerHTML = `
        <div class="collective-word">${escapeHtml(entry.word)}</div>
        <div class="collective-meta">
          ${entry.isSelf ? '<span class="pill pill-self">you</span>' : ""}
          <span class="pill">${entry.count}×</span>
          ${entry.bestRank ? `<span class="pill">best #${entry.bestRank.toLocaleString()}</span>` : ""}
        </div>
      `;
      this.collectiveList.appendChild(row);
    });
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

  showLeaderboardLoading(message = "loading leaderboard...") {
    this.leaderboardStatus.textContent = message;
    this.leaderboardStatus.classList.remove("error");
    this.leaderboardEntries.innerHTML = "";
  }

  showLeaderboardError(message: string) {
    this.leaderboardStatus.textContent = message;
    this.leaderboardStatus.classList.add("error");
    this.leaderboardEntries.innerHTML = "";
  }

  setLeaderboard(entries: LeaderboardEntry[], highlightPlayerId?: string) {
    if (!entries.length) {
      this.showLeaderboardError("no entries yet");
      return;
    }

    this.leaderboardStatus.textContent = `top ${entries.length}`;
    this.leaderboardStatus.classList.remove("error");
    this.leaderboardEntries.innerHTML = "";

    entries.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row";
      if (highlightPlayerId && entry.playerId === highlightPlayerId) {
        row.classList.add("self");
      }

      const rankText = `#${idx + 1}`;
      const name = entry.nickname?.trim() || "anon";
      const status = entry.finished ? "finished" : "hunting";
      const best = entry.bestRank ? `best #${entry.bestRank.toLocaleString()}` : "no rank yet";
      const guesses = `${entry.guessCount} guess${entry.guessCount === 1 ? "" : "es"}`;

      row.innerHTML = `
        <div class="lb-rank">${rankText}</div>
        <div class="lb-body">
          <div class="lb-name">${escapeHtml(name)}</div>
          <div class="lb-meta">${status} · ${best} · ${guesses}</div>
        </div>
      `;

      this.leaderboardEntries.appendChild(row);
    });
  }

  private disableDoubleTapZoom(targets: HTMLElement[]) {
    targets.forEach((target) => {
      let lastTouch = 0;
      target.addEventListener(
        "touchend",
        (event) => {
          const now = Date.now();
          if (now - lastTouch < 350) {
            event.preventDefault();
          }
          lastTouch = now;
        },
        { passive: false },
      );
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

