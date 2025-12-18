# embeddage

a word-guessing game with 3d visualization. guess the secret word — each guess shows how semantically close you are based on GloVe embeddings.

## quick start

### 1. preprocess GloVe embeddings (one-time)

download `glove.twitter.27B.zip` from [Stanford NLP](https://nlp.stanford.edu/projects/glove/) and extract the 50d file:

```bash
# install deps
pip install -r requirements.txt

# preprocess (creates data/words.json + data/embeddings_normed.npy)
python scripts/preprocess_glove.py path/to/glove.twitter.27B.50d.txt
```

### 2. build daily artifacts

```bash
# build for today (NY timezone)
python scripts/build_day.py

# build for specific date
python scripts/build_day.py --date 2024-12-25

# verbose mode (shows secret word for debugging)
python scripts/build_day.py --date 2024-12-25 -v
```

this creates under `docs/data/`:
- `YYYY-MM-DD.meta.json` — metadata
- `YYYY-MM-DD.local_ids.json` — top-k neighbor indices
- `YYYY-MM-DD.rank.bin` — full ranking (uint32 LE)
- `YYYY-MM-DD.local_xyz.bin` — 3d coordinates (float32 LE)

### 3. copy vocab to docs/

```bash
cp data/words.json docs/words.json
```

### 4. serve locally

```bash
cd docs && python -m http.server 8000
```

## project structure

```
embeddage/
├── builder/           # python modules
│   ├── config.py      # constants and paths
│   ├── embeddings.py  # load/preprocess GloVe
│   ├── word_of_day.py # deterministic secret selection
│   ├── rankings.py    # compute similarities + top-k
│   ├── projection.py  # PCA to 3d
│   └── artifacts.py   # write output files
├── scripts/
│   ├── preprocess_glove.py  # one-time preprocessing
│   └── build_day.py         # daily artifact generation
├── docs/              # frontend + data (served via github pages)
│   ├── data/          # generated daily artifacts
│   └── words.json     # vocab (copied from data/)
└── data/              # preprocessed embeddings (not committed)
```

## file formats

### rank.bin
binary file, no header. `V` little-endian uint32 values where `rank[i]` = position of word `i` (1 = closest to secret).

### local_xyz.bin  
binary file, no header. `k * 3` little-endian float32 values. coordinates are row-major: `[x0, y0, z0, x1, y1, z1, ...]`

## todo

- [ ] frontend (three.js visualization)
- [ ] github actions for daily builds
- [ ] custom domain setup


## cloudflare worker config

Set the KV namespace IDs used by the worker via environment variables before running `wrangler deploy` or `wrangler versions upload`:

- `PLAYERS_NAMESPACE_ID` / `PLAYERS_PREVIEW_ID`
- `LEADERBOARD_NAMESPACE_ID` / `LEADERBOARD_PREVIEW_ID`

Each should point to an existing Workers KV namespace (create via `wrangler kv namespace create <name>`). Without these values, deployment will fail with an invalid namespace error.
