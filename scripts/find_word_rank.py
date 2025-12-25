#!/usr/bin/env python3
"""
find the rank of a specific word for a given date.
"""

import argparse
import json
import struct
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="find word rank for a date")
    parser.add_argument("--date", type=str, required=True, help="target date YYYY-MM-DD")
    parser.add_argument("--word", type=str, required=True, help="word to find")
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
    
    # load words
    words_path = args.data_dir / "words.json"
    with open(words_path, "r", encoding="utf-8") as f:
        words = json.load(f)
    
    # find word index
    search_word = args.word.lower().strip()
    word_to_id = {w.lower(): i for i, w in enumerate(words)}
    
    if search_word not in word_to_id:
        print(f"'{args.word}' not found in vocabulary")
        sys.exit(1)
    
    word_id = word_to_id[search_word]
    actual_word = words[word_id]
    
    # load rank
    rank_path = output_dir / f"{args.date}.rank.bin"
    with open(rank_path, "rb") as f:
        data = f.read()
    
    expected_size = 4 * vocab_size
    if len(data) != expected_size:
        raise ValueError(f"rank.bin size mismatch: {len(data)} != {expected_size}")
    
    # unpack as little-endian uint32
    rank = struct.unpack(f"<{vocab_size}I", data)
    word_rank = rank[word_id]
    
    print(f"date: {args.date}")
    print(f"secret word: {secret_word}")
    print(f"search word: '{actual_word}' (id={word_id})")
    print(f"rank: {word_rank:,} (out of {vocab_size:,} words)")
    
    # calculate percentile
    percentile = (1 - (word_rank - 1) / (vocab_size - 1)) * 100
    print(f"percentile: {percentile:.2f}%")
    
    # show distance from secret
    if secret_word:
        secret_id = meta.get("secret_id")
        if secret_id is not None:
            secret_rank = rank[secret_id]
            print(f"\nsecret '{secret_word}' is rank {secret_rank}")
            if word_rank < secret_rank:
                print(f"'{actual_word}' is {secret_rank - word_rank} ranks BETTER than the secret (closer)")
            elif word_rank > secret_rank:
                print(f"'{actual_word}' is {word_rank - secret_rank} ranks WORSE than the secret (farther)")
            else:
                print(f"'{actual_word}' is the secret word!")


if __name__ == "__main__":
    import sys
    main()


