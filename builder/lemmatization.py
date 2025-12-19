"""
lemmatization utilities for vocabulary processing.

uses spaCy for fast, accurate lemmatization with batch processing support.
"""

from typing import Dict, List, Optional
import spacy
from spacy.lang.en import English


class Lemmatizer:
    """lemmatizer wrapper for batch processing vocabulary."""
    
    def __init__(self, model_name: str = "en_core_web_sm", disable: Optional[List[str]] = None):
        """
        initialize spaCy lemmatizer.
        
        args:
            model_name: spaCy model to use (default: en_core_web_sm)
            disable: pipeline components to disable for speed (default: ["parser", "ner"])
        """
        if disable is None:
            disable = ["parser", "ner"]  # only need tokenizer + tagger + lemmatizer
        
        try:
            self.nlp = spacy.load(model_name, disable=disable)
        except OSError:
            raise RuntimeError(
                f"spaCy model '{model_name}' not found. "
                f"Install it with: python -m spacy download {model_name}"
            )
    
    def lemmatize_word(self, word: str) -> str:
        """
        lemmatize a single word.
        
        args:
            word: input word
        
        returns:
            lemma (base form) of the word
        """
        doc = self.nlp(word)
        if len(doc) == 0:
            return word.lower()
        return doc[0].lemma_.lower()
    
    def lemmatize_batch(self, words: List[str], batch_size: int = 1000) -> Dict[str, str]:
        """
        lemmatize a batch of words efficiently.
        
        args:
            words: list of words to lemmatize
            batch_size: number of words to process at once
        
        returns:
            dict mapping word -> lemma
        """
        lemma_map: Dict[str, str] = {}
        
        # process in batches - each word is a separate document
        # spaCy's pipe() handles this efficiently
        for i in range(0, len(words), batch_size):
            batch = words[i:i + batch_size]
            
            # process batch - each word becomes its own doc
            docs = list(self.nlp.pipe(batch, batch_size=batch_size))
            
            for word, doc in zip(batch, docs):
                if len(doc) > 0:
                    # get first token's lemma (word should be single token)
                    lemma_map[word] = doc[0].lemma_.lower()
                else:
                    # fallback: use word as-is if tokenization failed
                    lemma_map[word] = word.lower()
        
        return lemma_map
    
    def build_lemma_to_words(self, words: List[str], batch_size: int = 1000) -> Dict[str, List[str]]:
        """
        build reverse mapping: lemma -> list of words that map to it.
        
        useful for finding all word variations (e.g., "run" -> ["run", "runs", "running", "ran"])
        
        args:
            words: list of words
            batch_size: batch size for processing
        
        returns:
            dict mapping lemma -> list of words
        """
        lemma_map = self.lemmatize_batch(words, batch_size)
        lemma_to_words: Dict[str, List[str]] = {}
        
        for word, lemma in lemma_map.items():
            if lemma not in lemma_to_words:
                lemma_to_words[lemma] = []
            lemma_to_words[lemma].append(word)
        
        return lemma_to_words


def create_lemma_mapping(
    words: List[str],
    model_name: str = "en_core_web_sm",
    batch_size: int = 1000,
    verbose: bool = True
) -> Dict[str, str]:
    """
    create word -> lemma mapping for a vocabulary.
    
    args:
        words: list of words to lemmatize
        model_name: spaCy model name
        batch_size: batch size for processing
        verbose: print progress
    
    returns:
        dict mapping word -> lemma
    """
    if verbose:
        print(f"initializing lemmatizer (model: {model_name})...")
    
    lemmatizer = Lemmatizer(model_name=model_name)
    
    if verbose:
        print(f"lemmatizing {len(words):,} words...")
    
    lemma_map = lemmatizer.lemmatize_batch(words, batch_size=batch_size)
    
    if verbose:
        # show some stats
        unique_lemmas = len(set(lemma_map.values()))
        print(f"  {len(words):,} words → {unique_lemmas:,} unique lemmas")
        print(f"  compression ratio: {len(words) / unique_lemmas:.2f}x")
    
    return lemma_map

