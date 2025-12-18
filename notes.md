# embeddage build notes

## section 1 — python offline builder (artifacts for a single day)

### 1.1 project layout (python side) ✅

- [x] `builder/__init__.py`
- [x] `builder/config.py`
- [x] `builder/embeddings.py`
- [x] `builder/word_of_day.py`
- [x] `builder/rankings.py`
- [x] `builder/projection.py`
- [x] `builder/artifacts.py`
- [x] `scripts/build_day.py`
- [x] `scripts/preprocess_glove.py`
- [x] `requirements.txt`

**extras we added:**
- [x] `builder/filters.py` — vocab filtering (stopwords, non-ascii, repeated chars, internet junk)
- [x] `builder/wordfreq_utils.py` — zipf frequency scoring via `wordfreq` library
- [x] `scripts/setup_docs.py` — copies vocab to docs/
- [x] `scripts/build_secret_candidates.py` — builds nice secret word pool

### 1.2 preprocess GloVe → `words.json` + `embeddings_normed.npy` ✅

**original goal:** convert `glove.twitter.27B.50d.txt` → numpy + vocab.

**what we actually did:**
- [x] switched to `glove.2024.wikigiga.100d.txt` (newer, 100d, wiki+gigaword)
- [x] parse word + 100 floats per line
- [x] filter vocab:
  - [x] ascii alphabetic only
  - [x] length ≥ 3
  - [x] must be in `data/dictionary/words_dictionary.json`
  - [x] no stopwords
  - [x] no repeated chars (yesss, nooo)
  - [x] no internet garbage (lol, http, etc.)
- [x] normalize rows (L2 norm)
- [x] save `data/words.json` (~151k words) + `data/embeddings_normed.npy`

### 1.3 deterministic `secret_for_date` (NY timezone) ✅

- [x] `sha256(date_str)` → first 8 bytes → int
- [x] `secret_id = seed_int % candidate_pool_size`
- [x] skip bad tokens (non-alpha, too short)

**upgrade:** now draws from `data/secret_candidates.json` (~24.7k common-ish words with Zipf ≥ 3.0) instead of full 151k vocab.

### 1.4 daily ranking + top-k neighborhood ✅

- [x] load embeddings (mmap)
- [x] `scores = embeddings @ secret_vec` (cosine sim)
- [x] top-k via `argpartition`, drop secret, sort by score → `local_ids`
- [x] full ranking via `argsort` → `rank[i] = position of word i`

### 1.5 project local neighbors to stable 3d ✅

- [x] SVD on centered local vectors
- [x] take first 3 components
- [x] center at origin, scale to max radius ~1
- [x] stabilize axis signs using anchor point

---

## section 2 — writing artifacts exactly to spec

### 2.1 `meta.json` ✅

```jsonc
{
  "schema_version": 2,  // bumped from 1
  "date": "YYYY-MM-DD",
  "day_boundary_tz": "America/New_York",
  "k": 256,
  "vocab_size": V,
  "embed_dim": 100,  // was 50, now 100d
  "projection_method": "pca",
  "projection_params": {},
  "projection_seed": INT,
  "secret_hash": "sha256(word + date)",
  "secret_id": INT,      // NEW: for give-up reveal
  "secret_word": "word"  // NEW: for give-up reveal
}
```

### 2.2 `local_ids.json` ✅

- [x] JSON array of k integers

### 2.3 `rank.bin` (uint32 LE) ✅

- [x] raw `<u4`, size `4 * V` bytes
- [x] sanity check in builder

### 2.4 `local_xyz.bin` (float32 LE) ✅

- [x] raw `<f4`, flattened `(k, 3)`, size `12 * k` bytes
- [x] sanity check in builder

### 2.5 layout under `docs/` ✅

- [x] `docs/index.html`
- [x] `docs/assets/...` (vite bundle)
- [x] `docs/words.json`
- [x] `docs/data/YYYY-MM-DD.{meta.json,rank.bin,local_ids.json,local_xyz.bin}`

---

## section 3 — browser loader + helpers

### 3.1 loading vocab and today's artifacts ✅

- [x] `getTodayNY()` via `Intl.DateTimeFormat`
- [x] `fetchWords()` → caches vocab
- [x] `fetchArtifacts(date)` → meta, rank, localIds, xyz
- [x] build `Uint32Array` / `Float32Array`
- [x] sanity checks on lengths
- [x] `localIndexById` map for fast lookup

### 3.2 guess normalization + rank/percentile/color ✅

- [x] `normalizeGuess()` — lowercase, trim, strip punctuation
- [x] `rankToPercentile()` — `1 - (r-1)/(V-1)`
- [x] `shapeScore()` — sigmoid (a=12, b=0.5)
- [x] `scoreToColor()` — gray (#333) → orange (#ff6600)

### 3.3 in-cluster vs outsider handling ✅

- [x] in-cluster: pull xyz from local_xyz, color by score
- [x] outsider: deterministic halo position via FNV hash
- [x] **secret word special case:** if guess matches `meta.secret_id`, place at origin (0,0,0)

---

## section 4 — 3d visualization rules (three.js)

### 4.1 scene + camera ✅

- [x] `Scene`, `PerspectiveCamera`, `WebGLRenderer`
- [x] `OrbitControls`
- [x] **brutalist update:** pure black bg, no antialiasing, pixel ratio 1

### 4.2 buffers for guesses ✅

- [x] `localPoints` — position + color attributes, vertex colors
- [x] `outerPoints` — gray, separate geometry
- [x] `trailLine` — connects local guesses

### 4.3 deterministic halo positions for outsiders ✅

- [x] `outsiderPosition(date, normalized)` → FNV hash → spherical coords at radius 2.5

### 4.4 brutalist 3d redesign ✅

- [x] wireframe cube instead of sphere
- [x] subtle axis lines through center
- [x] fixed-size points (no size attenuation)
- [x] win marker = wireframe cube at origin

---

## section 5 — github pages + custom domain wiring

### 5.1 `docs/` layout ✅

- [x] vite configured to output to `../docs`
- [x] `publicDir` set to `../docs` so data files work in dev

### 5.2 deployment workflow ⏳

- [x] `scripts/preprocess_glove.py` — one-time
- [x] `scripts/build_day.py --date ...` — daily
- [x] `npm run build` in `frontend/` → outputs to `docs/`
- [ ] github pages setup
- [ ] CNAME / custom domain
- [ ] CI automation

---

## extras we added beyond original plan

### vocab quality

- [x] **english-only filtering** via `words_dictionary.json` crossref
- [x] **wordfreq integration** — `pip install wordfreq`
- [x] **secret candidates pool** — `data/secret_candidates.json` with ~24.7k words having Zipf ≥ 3.0
- [x] secrets now drawn from this "nicer" pool, not full 151k vocab

### gameplay features

- [x] **give up button** — appears after 50 guesses, reveals secret word
- [x] **sorted guess list** — auto-sorts by semantic similarity (best at top)
- [x] **duplicate detection** — shows "already guessed" message
- [x] **win state** — disables input, shows celebration, highlights secret at origin

### gameplay + ui tweaks (2025-12-18)

- [x] **subtitle copy refresh** — now: “guess today's word! lower # is better”
- [x] **removed give up** — no more give-up button or reveal flow; puzzle is strictly “guess until you hit #1”
- [x] **fatter points + edges** — increased local/outer node sizes and thickened line/trail/marker geometry for better legibility
- [x] **guess list scrollbar hidden** — list still scrolls but scrollbar is visually removed (webkit + firefox)
- [x] **responsive layout split**  
  - desktop: 3d canvas on the left, 320px ui panel on the right  
  - mobile: ui stacked over a full-screen canvas background
- [x] **interaction model** — search bar is on top of the z-index stack; clicks/touches anywhere else (including under header/status/list) hit the three.js canvas, so dragging adjusts the view

### ui/ux

- [x] **brutalist redesign**
  - monospace font (SF Mono, Monaco, etc.)
  - pure black/white/orange palette
  - no rounded corners
  - all-caps labels with letter-spacing
  - tighter, grid-like layout
- [x] **removed percentages** — just show rank + color gradient
- [x] **color bar** — visual indicator of semantic proximity

---

## file structure (final)

```
embeddage/
├── builder/
│   ├── __init__.py
│   ├── config.py          # embed_dim=100, k=256, etc.
│   ├── embeddings.py      # preprocess_glove(), load_*()
│   ├── filters.py         # stopwords, ascii filter, etc.
│   ├── word_of_day.py     # secret_for_date(), hash_secret()
│   ├── rankings.py        # compute_rankings()
│   ├── projection.py      # project_to_3d()
│   ├── artifacts.py       # write_daily_artifacts()
│   └── wordfreq_utils.py  # zipf scoring
├── scripts/
│   ├── preprocess_glove.py
│   ├── build_day.py
│   ├── setup_docs.py
│   └── build_secret_candidates.py
├── frontend/
│   ├── src/
│   │   ├── types.ts       # Meta, Artifacts, Guess, etc.
│   │   ├── loader.ts      # fetchArtifacts(), getTodayNY()
│   │   ├── game.ts        # processGuess(), scoring, colors
│   │   ├── scene.ts       # SemanticScene (three.js)
│   │   ├── ui.ts          # GameUI class
│   │   ├── main.ts        # wires everything
│   │   └── style.css      # brutalist styles
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── data/
│   ├── glove/             # raw glove files (not committed)
│   ├── dictionary/
│   │   └── words_dictionary.json
│   ├── words.json         # filtered vocab
│   ├── embeddings_normed.npy
│   └── secret_candidates.json
├── docs/
│   ├── index.html
│   ├── assets/
│   ├── words.json
│   └── data/
│       └── YYYY-MM-DD.{meta,rank,local_ids,local_xyz}.*
├── requirements.txt
├── README.md
└── notes.md               # this file
```

---

## todo / future ideas

- [ ] lemmatization (friend/friends/friendly → same base)
- [ ] CI: auto-generate next 7 days of artifacts
- [ ] github pages + custom domain
- [ ] share results (copy to clipboard)
- [ ] streak tracking (localStorage)
- [ ] hint system (reveal top-k neighbor words progressively)
