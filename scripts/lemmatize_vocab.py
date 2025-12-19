#!/usr/bin/env python3
"""
lemmatize the entire vocabulary using spaCy.

this creates a full lemma mapping for all words in the vocabulary.
run this after preprocess_glove.py has created data/words.json.

usage:
    python scripts/lemmatize_vocab.py
    
output:
    - data/lemmas.json (word_to_lemma and lemma_to_words mappings)
"""

import json
import sys
from pathlib import Path

# add parent dir to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from builder.config import DEFAULT_CONFIG
from builder.lemmatization import create_lemma_mapping, Lemmatizer


def main():
    vocab_path = DEFAULT_CONFIG.vocab_path
    
    if not vocab_path.exists():
        print(f"error: vocab not found at {vocab_path}")
        print("run scripts/preprocess_glove.py first!")
        sys.exit(1)
    
    print(f"loading vocabulary from {vocab_path}...")
    with open(vocab_path, "r", encoding="utf-8") as f:
        words = json.load(f)
    
    print(f"loaded {len(words):,} words")
    print()
    
    # check if spaCy is available
    try:
        import spacy
    except ImportError:
        print("error: spaCy not installed")
        print("install it with: pip install spacy")
        print("then download the model: python -m spacy download en_core_web_sm")
        sys.exit(1)
    
    # check if model is available
    try:
        lemmatizer = Lemmatizer()
    except RuntimeError as e:
        print(f"error: {e}")
        print("download the model with: python -m spacy download en_core_web_sm")
        sys.exit(1)
    
    # create lemma mapping
    print("creating lemma mapping (this may take a while)...")
    lemma_map = create_lemma_mapping(words, verbose=True)
    
    # create reverse mapping: lemma -> list of words
    print("\nbuilding reverse mapping (lemma -> words)...")
    lemma_to_words: dict[str, list[str]] = {}
    for word, lemma in lemma_map.items():
        if lemma not in lemma_to_words:
            lemma_to_words[lemma] = []
        if word not in lemma_to_words[lemma]:
            lemma_to_words[lemma].append(word)
    
    # ensure base forms are included
    for lemma in lemma_to_words.keys():
        if lemma in words and lemma not in lemma_to_words[lemma]:
            lemma_to_words[lemma].append(lemma)
    
    # save both mappings
    lemma_data = {
        "word_to_lemma": lemma_map,
        "lemma_to_words": lemma_to_words
    }
    
    output_path = DEFAULT_CONFIG.data_dir / "lemmas.json"
    print(f"\nsaving lemma mapping to {output_path}...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(lemma_data, f, indent=2)
    
    # stats
    unique_lemmas = len(lemma_to_words)
    compression_ratio = len(words) / unique_lemmas if unique_lemmas > 0 else 1.0
    
    print(f"\n✓ lemma mapping complete!")
    print(f"  {len(words):,} words → {unique_lemmas:,} unique lemmas")
    print(f"  compression ratio: {compression_ratio:.2f}x")
    print(f"  saved to {output_path}")
    
    # show some examples
    print(f"\nexamples:")
    example_count = 0
    for lemma, words_list in lemma_to_words.items():
        if len(words_list) > 1:  # only show lemmas with multiple word forms
            print(f"  {lemma}: {words_list[:5]}")  # show first 5
            example_count += 1
            if example_count >= 10:
                break


if __name__ == "__main__":
    main()

