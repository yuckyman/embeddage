#!/usr/bin/env python3
"""
build daily artifacts for embeddage.

usage:
    python scripts/build_day.py --date 2024-12-18
    python scripts/build_day.py --date 2024-12-18 --output-root docs/

generates:
    - {output}/data/{date}.meta.json
    - {output}/data/{date}.local_ids.json
    - {output}/data/{date}.rank.bin
    - {output}/data/{date}.local_xyz.bin
"""

import argparse
import json
import sys
import hashlib
from datetime import datetime
from pathlib import Path

# add parent dir to path so we can import builder
sys.path.insert(0, str(Path(__file__).parent.parent))

from builder import (
    Config,
    load_embeddings,
    load_vocab,
    secret_for_date,
    compute_rankings,
    project_to_3d,
    write_daily_artifacts,
)
from builder.filters import load_obscene_words


def get_today_ny() -> str:
    """get today's date in America/New_York timezone."""
    try:
        from zoneinfo import ZoneInfo
        ny = ZoneInfo("America/New_York")
        return datetime.now(ny).strftime("%Y-%m-%d")
    except ImportError:
        # fallback for python < 3.9
        print("warning: zoneinfo not available, using UTC")
        return datetime.utcnow().strftime("%Y-%m-%d")


def main():
    parser = argparse.ArgumentParser(
        description="generate daily embeddage artifacts"
    )
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="target date YYYY-MM-DD (default: today in NY timezone)"
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("docs"),
        help="output root directory (default: docs/)"
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="preprocessed data directory (default: data/)"
    )
    parser.add_argument(
        "-k",
        type=int,
        default=512,
        help="number of neighbors in local cluster (default: 512)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="print extra info"
    )
    
    args = parser.parse_args()
    
    # resolve date
    date_str = args.date or get_today_ny()
    print(f"building artifacts for: {date_str}")
    
    # set up config
    config = Config(k=args.k)
    if args.data_dir:
        config.data_dir = args.data_dir
    
    # output goes to {output-root}/data/
    output_dir = args.output_root / "data"
    
    # check preprocessed data exists
    if not config.vocab_path.exists():
        print(f"error: vocab not found at {config.vocab_path}")
        print("run scripts/preprocess_glove.py first!")
        sys.exit(1)
    
    if not config.embeddings_path.exists():
        print(f"error: embeddings not found at {config.embeddings_path}")
        print("run scripts/preprocess_glove.py first!")
        sys.exit(1)
    
    # load data
    print("loading vocab...")
    vocab = load_vocab(config)
    V = len(vocab)
    print(f"  vocab size: {V:,}")
    print("loading embeddings...")
    embeddings = load_embeddings(config, mmap=True)
    print(f"  shape: {embeddings.shape}")
    
    # pick secret word
    print("selecting secret word...")

    # optional blacklist: words that must never be secrets
    blacklist = load_obscene_words()
    if blacklist:
        print(f"loaded blacklist for secret selection ({len(blacklist):,} entries)")

    # try to use precomputed wordfreq-based secret candidate pool if available
    secret_candidates_path = Path("data/secret_candidates.json")
    secret_id: int

    if secret_candidates_path.exists():
        print(f"  using secret_candidates from {secret_candidates_path}...")
        with open(secret_candidates_path, "r", encoding="utf-8") as f:
            cand_data = json.load(f)
        cand_words = cand_data.get("words", [])

        # map vocab word -> id
        word_to_id = {w: i for i, w in enumerate(vocab)}

        if blacklist:
            cand_words = [w for w in cand_words if w not in blacklist]

        candidate_ids = [word_to_id[w] for w in cand_words if w in word_to_id]

        if candidate_ids:
            # deterministic pick: hash date, index into candidate_ids
            h = hashlib.sha256(date_str.encode("utf-8")).digest()
            seed_int = int.from_bytes(h[:8], byteorder="little")
            secret_id = candidate_ids[seed_int % len(candidate_ids)]
            secret_word = vocab[secret_id]
            print(f"  picked from {len(candidate_ids):,} candidates")
        else:
            print("  warning: secret_candidates.json had no usable entries, falling back to full vocab")
            secret_id = secret_for_date(date_str, V, vocab)
            secret_word = vocab[secret_id]
    else:
        # fallback: original deterministic selection over full vocab
        secret_id = secret_for_date(date_str, V, vocab)
        secret_word = vocab[secret_id]
    
    if args.verbose:
        print(f"  secret: '{secret_word}' (id={secret_id})")
    else:
        print(f"  secret selected (id={secret_id})")
    
    # compute rankings
    print("computing rankings...")
    result = compute_rankings(embeddings, secret_id, k=config.k)
    print(f"  rank[secret] = {result.rank[secret_id]} (should be 1)")
    
    if args.verbose:
        print(f"  top 5 neighbors:")
        for i in range(min(5, len(result.local_ids))):
            idx = result.local_ids[i]
            print(f"    {i+1}. '{vocab[idx]}' (score={result.local_scores[i]:.4f})")
    
    # project to 3D
    print("projecting to 3D...")
    coords = project_to_3d(embeddings, result.local_ids)
    print(f"  coords shape: {coords.shape}")
    
    # write artifacts
    print(f"writing artifacts to {output_dir}...")
    paths = write_daily_artifacts(
        date_str=date_str,
        secret_id=secret_id,
        secret_word=secret_word,
        vocab_size=V,
        rank=result.rank,
        local_ids=result.local_ids,
        coords=coords,
        config=config,
        output_dir=output_dir
    )
    
    print("\nartifacts written:")
    for name, path in paths.items():
        size = path.stat().st_size
        print(f"  {name}: {path} ({size:,} bytes)")
    
    print("\ndone!")


if __name__ == "__main__":
    main()

