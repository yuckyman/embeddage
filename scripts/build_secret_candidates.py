#!/usr/bin/env python3
"""build a list of reasonable secret-candidate words using wordfreq.

usage:
    python scripts/build_secret_candidates.py

outputs:
    data/secret_candidates.json with structure:
      {
        "lang": "en",
        "wordlist": "small",
        "min_zipf": 3.0,
        "words": ["..."],
        "zipf": [3.42, ...]
      }

we can later use this list to restrict daily secrets to common-ish words.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# add parent dir to path so we can import builder
sys.path.insert(0, str(Path(__file__).parent.parent))

from builder.config import DEFAULT_CONFIG
from builder.embeddings import load_vocab
from builder.wordfreq_utils import score_vocab
from builder.filters import load_obscene_words


def main() -> None:
  vocab = load_vocab(DEFAULT_CONFIG)
  print(f"loaded vocab: {len(vocab):,} words")

  # optional blacklist / obscene list – ensures none of these become secrets
  blacklist = load_obscene_words()
  if blacklist:
    print(f"loaded blacklist for secret candidates ({len(blacklist):,} entries)")

  print("scoring with wordfreq (en, small, min_zipf=3.0)...")
  scored = score_vocab(vocab, lang="en", wordlist="small", min_zipf=3.0)

  if blacklist:
    before = len(scored)
    scored = [s for s in scored if s.word not in blacklist]
    removed = before - len(scored)
    print(f"  removed {removed:,} blacklisted words from candidates")

  # simple stats
  if scored:
    zs = [s.zipf for s in scored]
    print(f"  candidates: {len(scored):,}")
    print(f"  zipf range: {min(zs):.2f} – {max(zs):.2f}")
  else:
    print("  no candidates found (min_zipf too high?)")

  out_path = Path("data/secret_candidates.json")
  out_path.parent.mkdir(parents=True, exist_ok=True)

  payload = {
    "lang": "en",
    "wordlist": "small",
    "min_zipf": 3.0,
    "words": [s.word for s in scored],
    "zipf": [s.zipf for s in scored],
  }

  with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f)

  print(f"wrote {len(scored):,} candidates to {out_path}")


if __name__ == "__main__":
  main()

