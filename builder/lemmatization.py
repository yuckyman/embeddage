"""
lemmatization utilities for vocabulary processing.

uses LemmInflect for improved lemmatization accuracy, with spaCy for POS tagging.
LemmInflect provides better handling of:
- out-of-vocabulary words
- irregular verb forms (ran -> run, went -> go)
- plural nouns (mice -> mouse)

spaCy + LemmInflect are optional - only needed for preprocessing (generating lemmas.json).
The server/frontend use pre-generated lemmas.json and don't require these libraries.
"""

from typing import Dict, List, Optional

# check for spaCy availability
try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    SPACY_AVAILABLE = False

# check for LemmInflect availability
try:
    import lemminflect
    from lemminflect import getLemma, getAllLemmas, getAllLemmasOOV
    LEMMINFLECT_AVAILABLE = True
except ImportError:
    LEMMINFLECT_AVAILABLE = False


class Lemmatizer:
    """lemmatizer wrapper using LemmInflect for improved accuracy."""
    
    def __init__(self, model_name: str = "en_core_web_sm", disable: Optional[List[str]] = None):
        """
        initialize lemmatizer with spaCy for POS tagging and LemmInflect for lemmatization.
        
        args:
            model_name: spaCy model to use (default: en_core_web_sm)
            disable: pipeline components to disable for speed (default: ["parser", "ner"])
        """
        if not SPACY_AVAILABLE:
            raise RuntimeError(
                "spaCy is not installed. "
                "Install it with: pip install spacy && python -m spacy download en_core_web_sm"
            )
        
        if not LEMMINFLECT_AVAILABLE:
            raise RuntimeError(
                "LemmInflect is not installed. "
                "Install it with: pip install lemminflect"
            )
        
        if disable is None:
            disable = ["parser", "ner"]  # only need tokenizer + tagger
        
        try:
            self.nlp = spacy.load(model_name, disable=disable)
            # LemmInflect automatically extends spaCy tokens with _.lemma() method
        except OSError:
            raise RuntimeError(
                f"spaCy model '{model_name}' not found. "
                f"Install it with: python -m spacy download {model_name}"
            )
    
    def lemmatize_word(self, word: str) -> str:
        """
        lemmatize a single word using LemmInflect.
        
        args:
            word: input word
        
        returns:
            lemma (base form) of the word
        """
        doc = self.nlp(word)
        if len(doc) == 0:
            return word.lower()
        
        token = doc[0]
        # use LemmInflect's _.lemma() method which is more accurate than spaCy's
        try:
            lemma = token._.lemma()
            return lemma.lower() if lemma else token.lemma_.lower()
        except Exception:
            # fallback to spaCy's lemma if LemmInflect fails
            return token.lemma_.lower()
    
    def _get_best_lemma(self, word: str, pos: str) -> str:
        """
        get the best lemma for a word given its POS tag.
        uses LemmInflect's getAllLemmas with OOV fallback.
        
        args:
            word: the word to lemmatize
            pos: the POS tag (NOUN, VERB, ADJ, ADV, etc.)
        
        returns:
            the best lemma for the word
        """
        # map spaCy POS to LemmInflect UPOS
        upos = pos.upper()
        
        # try to get lemmas from LemmInflect
        lemmas = getAllLemmas(word, upos)
        
        if not lemmas:
            # try OOV fallback for unknown words
            lemmas = getAllLemmasOOV(word, upos)
        
        if lemmas:
            # getAllLemmas returns dict like {'NOUN': ('lemma1', 'lemma2'), 'VERB': (...)}
            # get the first lemma from any category
            for lemma_tuple in lemmas.values():
                if lemma_tuple:
                    return lemma_tuple[0].lower()
        
        # ultimate fallback: return word as-is
        return word.lower()
    
    def lemmatize_batch(self, words: List[str], batch_size: int = 1000) -> Dict[str, str]:
        """
        lemmatize a batch of words efficiently using LemmInflect.
        
        args:
            words: list of words to lemmatize
            batch_size: number of words to process at once
        
        returns:
            dict mapping word -> lemma
        """
        lemma_map: Dict[str, str] = {}
        
        # process in batches
        for i in range(0, len(words), batch_size):
            batch = words[i:i + batch_size]
            
            # process batch - each word becomes its own doc
            docs = list(self.nlp.pipe(batch, batch_size=batch_size))
            
            for word, doc in zip(batch, docs):
                if len(doc) > 0:
                    token = doc[0]
                    # use LemmInflect's enhanced lemma method
                    try:
                        lemma = token._.lemma()
                        lemma_map[word] = lemma.lower() if lemma else self._get_best_lemma(word, token.pos_)
                    except Exception:
                        # fallback: try direct LemmInflect lookup with POS
                        lemma_map[word] = self._get_best_lemma(word, token.pos_)
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
    create word -> lemma mapping for a vocabulary using LemmInflect.
    
    args:
        words: list of words to lemmatize
        model_name: spaCy model name (for POS tagging)
        batch_size: batch size for processing
        verbose: print progress
    
    returns:
        dict mapping word -> lemma
    
    note:
        requires spaCy and LemmInflect to be installed.
        these are optional for runtime/server, only needed for preprocessing.
    """
    if not SPACY_AVAILABLE:
        raise RuntimeError(
            "spaCy is not installed. "
            "Install it with: pip install spacy && python -m spacy download en_core_web_sm"
        )
    
    if not LEMMINFLECT_AVAILABLE:
        raise RuntimeError(
            "LemmInflect is not installed. "
            "Install it with: pip install lemminflect"
        )
    
    if verbose:
        print(f"initializing lemmatizer (model: {model_name}, using LemmInflect)...")
    
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




