#!/usr/bin/env python3
"""
one-time preprocessing: convert GloVe .txt → words.json + embeddings_normed.npy

usage:
    python scripts/preprocess_glove.py path/to/glove.twitter.27B.50d.txt

this creates:
    - data/words.json (vocab list)
    - data/embeddings_normed.npy (normalized embeddings)

you only need to run this once. the daily builder uses these preprocessed files.
"""

import argparse
import sys
from pathlib import Path

# add parent dir to path so we can import builder
sys.path.insert(0, str(Path(__file__).parent.parent))

from builder.config import DEFAULT_CONFIG
from builder.embeddings import preprocess_glove


def main():
    parser = argparse.ArgumentParser(
        description="preprocess GloVe embeddings into fast-loadable format"
    )
    parser.add_argument(
        "glove_path",
        type=Path,
        help="path to glove.twitter.27B.50d.txt"
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_CONFIG.data_dir,
        help=f"output directory (default: {DEFAULT_CONFIG.data_dir})"
    )
    parser.add_argument(
        "--dim",
        type=int,
        default=DEFAULT_CONFIG.embed_dim,
        help=f"embedding dimension (default: {DEFAULT_CONFIG.embed_dim})"
    )
    parser.add_argument(
        "--min-length",
        type=int,
        default=3,
        help="minimum word length (default: 3)"
    )
    parser.add_argument(
        "--english-dict",
        type=Path,
        default=Path("data/dictionary/words_dictionary.json"),
        help="path to words_dictionary.json for english filtering (default: data/dictionary/words_dictionary.json)"
    )
    parser.add_argument(
        "--no-filter",
        action="store_true",
        help="disable vocabulary filtering (keep all words)"
    )
    parser.add_argument(
        "--obscene-list",
        type=Path,
        default=None,
        help="optional path to newline-separated obscene/slur words to filter out "
             "(default: data/obscene_words.txt if present)"
    )

    args = parser.parse_args()

    if not args.glove_path.exists():
        print(f"error: file not found: {args.glove_path}")
        sys.exit(1)

    output_vocab = args.output_dir / DEFAULT_CONFIG.vocab_file
    output_embeddings = args.output_dir / DEFAULT_CONFIG.embeddings_file

    # if no explicit obscene list path is provided, we let preprocess_glove()
    # fall back to its internal default (data/obscene_words.txt).
    obscene_list_path = args.obscene_list

    vocab_size = preprocess_glove(
        glove_path=args.glove_path,
        output_vocab_path=output_vocab,
        output_embeddings_path=output_embeddings,
        expected_dim=args.dim,
        min_word_length=args.min_length,
        filter_vocab=not args.no_filter,
        english_dict_path=args.english_dict,
        obscene_words_path=obscene_list_path,
    )

    print("\npreprocessing complete!")
    print(f"  vocab: {output_vocab} ({vocab_size:,} words)")
    print(f"  embeddings: {output_embeddings}")


if __name__ == "__main__":
    main()

