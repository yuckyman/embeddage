#!/usr/bin/env python3
"""
display top N words for a given date's secret word.
"""

import argparse
import json
import struct
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="display top words for a date")
    parser.add_argument("--date", type=str, required=True, help="target date YYYY-MM-DD")
    parser.add_argument("--top", type=int, default=50, help="number of top words to show")
    parser.add_argument("--output-root", type=Path, default=Path("docs"), help="output root")
    parser.add_argument("--data-dir", type=Path, default=Path("data"), help="data directory")
    
    args = parser.parse_args()
    
    output_dir = args.output_root / "data"
    
    # load meta
    meta_path = output_dir / f"{args.date}.meta.json"
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    
    vocab_size = meta["vocab_size"]
    secret_word = meta.get("secret_word", "?")
    secret_id = meta.get("secret_id")
    
    print(f"date: {args.date}")
    print(f"secret word: {secret_word}")
    if secret_id is not None:
        print(f"secret id: {secret_id}")
    print(f"vocab size: {vocab_size:,}")
    print()
    
    # load words
    print("loading words...")
    words_path = args.data_dir / "words.json"
    with open(words_path, "r", encoding="utf-8") as f:
        words = json.load(f)
    print(f"  loaded {len(words):,} words")
    
    # load rank
    print("loading rankings...")
    rank_path = output_dir / f"{args.date}.rank.bin"
    with open(rank_path, "rb") as f:
        data = f.read()
    
    expected_size = 4 * vocab_size
    if len(data) != expected_size:
        raise ValueError(f"rank.bin size mismatch: {len(data)} != {expected_size}")
    
    # unpack as little-endian uint32
    rank = struct.unpack(f"<{vocab_size}I", data)
    print(f"  loaded {len(rank):,} ranks")
    
    # create (word, rank) pairs and sort by rank
    pairs = [(words[i], rank[i]) for i in range(len(words))]
    pairs.sort(key=lambda x: x[1])
    
    # display top N
    print(f"\ntop {args.top} words:")
    print("-" * 50)
    for i, (word, r) in enumerate(pairs[:args.top], 1):
        print(f"{i:3d}. {word:20s} (rank {r:,})")


if __name__ == "__main__":
    main()



