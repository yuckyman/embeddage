"""helpers for using wordfreq to score vocab words.

we use this to build a nicer pool of secret-candidate words, based on
zipf frequencies from the `wordfreq` library.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

from wordfreq import zipf_frequency


@dataclass
class ScoredWord:
  word: str
  zipf: float


def score_vocab(
  vocab: Iterable[str],
  *,
  lang: str = "en",
  wordlist: str = "small",
  min_zipf: float = 3.0,
) -> list[ScoredWord]:
  """score each vocab word with its zipf frequency.

  only keeps words with zipf >= min_zipf.
  """
  scored: list[ScoredWord] = []
  for w in vocab:
    z = float(zipf_frequency(w, lang, wordlist=wordlist))
    if z >= min_zipf:
      scored.append(ScoredWord(word=w, zipf=z))
  return scored

