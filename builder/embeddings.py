"""
embeddings loader — handles normalized GloVe vectors.

the heavy lifting (parsing raw .txt) happens in scripts/preprocess_glove.py.
this module just loads the preprocessed .npy + vocab.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from numpy.typing import NDArray

from .config import Config, DEFAULT_CONFIG


def load_vocab(config: Config = DEFAULT_CONFIG) -> list[str]:
    """
    load vocabulary list from words.json.
    
    returns list where index i → word string.
    """
    with open(config.vocab_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_embeddings(
    config: Config = DEFAULT_CONFIG,
    mmap: bool = True
) -> NDArray[np.float32]:
    """
    load normalized embeddings from .npy file.
    
    args:
        config: builder config with paths
        mmap: if True, memory-map the file (faster for large vocab)
    
    returns:
        array of shape (V, embed_dim) with L2-normalized rows
    """
    mode = "r" if mmap else None
    return np.load(config.embeddings_path, mmap_mode=mode)


def build_word_to_id(vocab: list[str]) -> dict[str, int]:
    """
    create reverse lookup: word → vocab index.
    
    useful for debugging / checking specific words.
    """
    return {word: i for i, word in enumerate(vocab)}


def preprocess_glove(
    glove_path: Path,
    output_vocab_path: Path,
    output_embeddings_path: Path,
    expected_dim: int = 50,
    min_word_length: int = 3,
    filter_vocab: bool = True,
    english_dict_path: Optional[Path] = None,
    obscene_words_path: Optional[Path] = None,
    lemmatize: bool = True,
    lemma_output_path: Optional[Path] = None,
) -> int:
    """
    one-time preprocessing: raw GloVe .txt → words.json + embeddings_normed.npy
    
    args:
        glove_path: path to glove.twitter.27B.50d.txt
        output_vocab_path: where to write words.json
        output_embeddings_path: where to write embeddings_normed.npy
        expected_dim: embedding dimension to validate
        min_word_length: minimum word length (default 3)
        filter_vocab: if True, apply stopword/misspelling filters
        english_dict_path: optional path to words_dictionary.json
        lemmatize: if True, create lemma mapping (default: True)
        lemma_output_path: where to write lemma mapping JSON (default: vocab_dir/lemmas.json)
    
    returns:
        vocab size V
    """
    from .filters import (
        filter_vocab as apply_filters,
        load_english_dictionary,
        load_obscene_words,
    )

    words: list[str] = []
    vectors: list[list[float]] = []

    print(f"reading {glove_path}...")
    with open(glove_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            parts = line.rstrip().split(" ")

            # first part is the word, rest are floats
            word = parts[0]

            # some lines might have issues, skip them
            if len(parts) != expected_dim + 1:
                print(f"  skipping line {line_num}: expected {expected_dim + 1} parts, got {len(parts)}")
                continue

            try:
                vec = [float(x) for x in parts[1:]]
            except ValueError as e:
                print(f"  skipping line {line_num}: {e}")
                continue

            words.append(word)
            vectors.append(vec)

            if line_num % 100_000 == 0:
                print(f"  processed {line_num:,} lines...")

    raw_count = len(words)
    print(f"loaded {raw_count:,} words (raw)")

    english_words = None
    obscene_words = None
    if filter_vocab and english_dict_path is not None and english_dict_path.exists():
        print(f"loading english dictionary from {english_dict_path}...")
        english_words = load_english_dictionary(english_dict_path)
        print(f"  english word count: {len(english_words):,}")

    if filter_vocab:
        # optional: obscene / slur blocklist
        obscene_words = load_obscene_words(obscene_words_path)
        if obscene_words:
            print(f"loaded obscene-word blocklist ({len(obscene_words):,} entries)")

    # apply vocabulary filters
    if filter_vocab:
        print("filtering vocabulary...")
        words, vectors, _stats = apply_filters(
            words,
            vectors,
            min_length=min_word_length,
            english_words=english_words,
            obscene_words=obscene_words,
            verbose=True,
        )

    V = len(words)
    print(f"final vocab size: {V:,}")

    # convert to numpy
    print("converting to numpy array...")
    embeddings = np.array(vectors, dtype=np.float32)
    assert embeddings.shape == (V, expected_dim), f"shape mismatch: {embeddings.shape}"

    # normalize rows (L2 norm)
    print("normalizing vectors...")
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)

    # avoid division by zero (shouldn't happen with GloVe, but just in case)
    norms = np.maximum(norms, 1e-8)
    embeddings_normed = embeddings / norms

    # save outputs
    print(f"saving vocab to {output_vocab_path}...")
    output_vocab_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_vocab_path, "w", encoding="utf-8") as f:
        json.dump(words, f)

    print(f"saving embeddings to {output_embeddings_path}...")
    output_embeddings_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(output_embeddings_path, embeddings_normed)

    # lemmatization: create word -> lemma mapping and lemma -> words mapping
    if lemmatize:
        try:
            from .lemmatization import create_lemma_mapping, Lemmatizer
        except ImportError:
            print("warning: spaCy not available, skipping lemmatization")
            print("  install spaCy with: pip install spacy && python -m spacy download en_core_web_sm")
            print("  or run preprocessing with lemmatize=False")
            lemmatize = False
        
        if lemmatize:
            if lemma_output_path is None:
                lemma_output_path = output_vocab_path.parent / "lemmas.json"
            
            print(f"creating lemma mapping...")
            try:
                lemma_map = create_lemma_mapping(words, verbose=True)
                
                # also create reverse mapping: lemma -> list of words
                lemma_to_words: Dict[str, List[str]] = {}
                for word, lemma in lemma_map.items():
                    if lemma not in lemma_to_words:
                        lemma_to_words[lemma] = []
                    lemma_to_words[lemma].append(word)
                
                # save both mappings
                lemma_data = {
                    "word_to_lemma": lemma_map,
                    "lemma_to_words": lemma_to_words
                }
                
                print(f"saving lemma mapping to {lemma_output_path}...")
                lemma_output_path.parent.mkdir(parents=True, exist_ok=True)
                with open(lemma_output_path, "w", encoding="utf-8") as f:
                    json.dump(lemma_data, f, indent=2)
                
                print(f"  saved {len(lemma_map):,} word->lemma mappings")
                print(f"  {len(lemma_to_words):,} unique lemmas")
            except RuntimeError as e:
                print(f"error during lemmatization: {e}")
                print("  skipping lemmatization (lemmas.json will not be created)")

    print(f"done! vocab size: {V:,}")
    return V

