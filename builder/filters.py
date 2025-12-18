"""
vocabulary filters for cleaner gameplay.

filters out:
- short words (< 3 chars)
- non-english words (via local dictionary, if available)
- stopwords (the, a, is, etc.)
- words with non-alpha characters
- misspellings / internet slang (repeated chars like "yesss", "nooo")
- single letters and common garbage
"""

import json
import re
from pathlib import Path
from typing import Iterable, Set

# common english stopwords (feel free to expand)
STOPWORDS = frozenset([
    # articles
    "a", "an", "the",
    # pronouns
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself", "she", "her", "hers", "herself",
    "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
    "what", "which", "who", "whom", "this", "that", "these", "those",
    # verbs (common)
    "am", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having", "do", "does", "did", "doing",
    "would", "should", "could", "ought", "might", "must", "shall", "will", "can",
    # prepositions
    "at", "by", "for", "from", "in", "into", "of", "off", "on", "onto",
    "out", "over", "to", "under", "up", "with", "about", "against",
    "between", "through", "during", "before", "after", "above", "below",
    # conjunctions
    "and", "but", "if", "or", "because", "as", "until", "while",
    "although", "though", "unless", "since", "so", "than",
    # other common
    "no", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "also", "now", "here", "there", "when", "where", "why", "how",
    "all", "each", "every", "both", "few", "more", "most", "other", "some",
    "such", "any", "many", "much", "then", "once", "ever", "never",
    # contractions without apostrophe (glove might have these)
    "dont", "wont", "cant", "isnt", "arent", "wasnt", "werent",
    "hasnt", "havent", "hadnt", "doesnt", "didnt", "wouldnt",
    "shouldnt", "couldnt", "mustnt", "lets", "thats", "whos", "whats",
    "heres", "theres", "wheres", "whens", "whys", "hows", "im", "ive",
    "youre", "youve", "youll", "youd", "hes", "shes", "its", "weve",
    "theyre", "theyve", "theyll", "theyd", "ill", "wed", "id",
])

# regex for repeated characters (3+ of same char)
REPEATED_CHARS = re.compile(r"(.)\1{2,}")

# regex for words that are mostly numbers or have digits
HAS_DIGITS = re.compile(r"\d")

# common url/internet fragments to filter
INTERNET_GARBAGE = frozenset([
    "http", "https", "www", "com", "org", "net", "html", "htm", "php",
    "jpg", "png", "gif", "pdf", "url", "href", "src", "img", "div",
    "lol", "lmao", "rofl", "omg", "wtf", "btw", "idk", "imo", "tbh",
    "af", "irl", "fomo", "yolo", "smh", "fml", "tfw", "mfw",
])


def load_obscene_words(path: Path | None = None) -> Set[str]:
    """load a newline-separated obscene / blacklist word list.

    priority:
      1. explicit path if provided
      2. `data/obscene_words.txt` if present
      3. `data/blacklist.txt` if present

    each non-empty, non-comment line is treated as a word to filter.
    """
    candidates: list[Path] = []

    if path is not None:
        candidates.append(path)
    else:
        candidates.append(Path("data/obscene_words.txt"))
        candidates.append(Path("data/blacklist.txt"))

    words: Set[str] = set()
    for p in candidates:
        if not p.exists():
            continue
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                raw = line.strip().lower()
                if not raw or raw.startswith("#"):
                    continue
                if raw.isascii():
                    words.add(raw)

    return words


def load_english_dictionary(path: Path) -> Set[str]:
  """load a local english wordlist (words_dictionary.json-style).

  expects a JSON object { word: frequency_or_1, ... }.
  returns a set of lowercase words.
  """
  with open(path, "r", encoding="utf-8") as f:
      data = json.load(f)
  # keys are words
  return {str(k).lower() for k in data.keys()}


def is_valid_word(
    word: str,
    *,
    min_length: int = 3,
    english_words: Set[str] | None = None,
    obscene_words: Set[str] | None = None,
) -> bool:
    """check if a word passes all filters.

    returns True if word should be kept, False if filtered out.
    """
    # too short
    if len(word) < min_length:
        return False

    # must be ASCII alphabetic only (force english-ish)
    if not word.isalpha() or not word.isascii():
        return False

    w = word.lower()

    # restrict to english dictionary if provided
    if english_words is not None and w not in english_words:
        return False

    # skip stopwords
    if w in STOPWORDS:
        return False

    # skip internet garbage
    if w in INTERNET_GARBAGE:
        return False

    # explicit obscene/slur blocklist
    if obscene_words is not None and w in obscene_words:
        return False

    # skip words with 3+ repeated characters (likely misspellings/slang)
    if REPEATED_CHARS.search(w):
        return False

    return True


def filter_vocab(
    words: list[str],
    vectors: list[list[float]],
    *,
    min_length: int = 3,
    english_words: Set[str] | None = None,
    obscene_words: Set[str] | None = None,
    verbose: bool = True,
) -> tuple[list[str], list[list[float]], dict[str, int]]:
    """filter vocabulary and corresponding vectors.

    returns:
        filtered_words: cleaned word list
        filtered_vectors: corresponding vectors
        stats: dict with filtering statistics
    """
    filtered_words: list[str] = []
    filtered_vectors: list[list[float]] = []

    stats = {
        "total": len(words),
        "kept": 0,
        "too_short": 0,
        "non_alpha_or_non_ascii": 0,
        "not_in_dict": 0,
        "stopword": 0,
        "repeated_chars": 0,
        "internet_garbage": 0,
        "obscene": 0,
    }

    for word, vec in zip(words, vectors):
        w = word.lower()

        # length
        if len(w) < min_length:
            stats["too_short"] += 1
            continue

        # must be ascii alpha
        if not w.isalpha() or not w.isascii():
            stats["non_alpha_or_non_ascii"] += 1
            continue

        # english dictionary gate
        if english_words is not None and w not in english_words:
            stats["not_in_dict"] += 1
            continue

        if w in STOPWORDS:
            stats["stopword"] += 1
            continue

        if w in INTERNET_GARBAGE:
            stats["internet_garbage"] += 1
            continue

        if obscene_words is not None and w in obscene_words:
            stats["obscene"] += 1
            continue

        if REPEATED_CHARS.search(w):
            stats["repeated_chars"] += 1
            continue

        # passed all filters
        filtered_words.append(w)
        filtered_vectors.append(vec)
        stats["kept"] += 1

    if verbose:
        print("  filtering stats:")
        print(f"    total input:             {stats['total']:,}")
        print(f"    kept:                    {stats['kept']:,}")
        print(f"    too short (<{min_length}):       {stats['too_short']:,}")
        print(f"    non-alpha / non-ascii:   {stats['non_alpha_or_non_ascii']:,}")
        if english_words is not None:
            print(f"    not in english dict:     {stats['not_in_dict']:,}")
        print(f"    stopwords:               {stats['stopword']:,}")
        print(f"    repeated chars:          {stats['repeated_chars']:,}")
        print(f"    internet garbage:        {stats['internet_garbage']:,}")
        if obscene_words is not None:
            print(f"    obscene (blocklist):     {stats['obscene']:,}")

    return filtered_words, filtered_vectors, stats

