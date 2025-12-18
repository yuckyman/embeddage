"""
deterministic secret word selection based on date.

uses sha256 hash of date string to pick a stable vocab index.
same date → same word, no matter where/when you run the builder.
"""

import hashlib
import json
from pathlib import Path
import re


def secret_for_date(
    date_str: str,
    vocab_size: int,
    vocab: list[str],
    min_length: int = 3,
    alpha_only: bool = True,
    freqs: dict[str, int] | None = None,
    min_freq: int = 0,
) -> int:
    """
    deterministically pick a secret word index for a given date.
    
    args:
        date_str: date in YYYY-MM-DD format
        vocab_size: total vocabulary size V
        vocab: list of words (for filtering bad candidates)
        min_length: minimum word length to accept
        alpha_only: if True, skip words with non-alpha chars
        freqs: optional mapping word -> frequency (for rarity filtering)
        min_freq: minimum frequency required to be eligible as secret
    
    returns:
        secret_id in [0, vocab_size)
    """
    # validate date format
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        raise ValueError(f"date must be YYYY-MM-DD, got: {date_str}")
    
    # hash the date
    h = hashlib.sha256(date_str.encode("utf-8")).digest()
    
    # interpret first 8 bytes as little-endian uint64
    seed_int = int.from_bytes(h[:8], byteorder="little")
    
    # derive initial candidate
    secret_id = seed_int % vocab_size
    
    # skip "bad" tokens: too short, contains non-alpha, etc.
    attempts = 0
    max_attempts = vocab_size  # safety valve
    
    while attempts < max_attempts:
        word = vocab[secret_id]
        
        # check validity
        is_valid = True
        
        if len(word) < min_length:
            is_valid = False
        elif alpha_only and not word.isalpha():
            is_valid = False
        elif freqs is not None and freqs.get(word, 0) < min_freq:
            # too rare to be a fun secret
            is_valid = False
        
        if is_valid:
            return secret_id
        
        # bump to next candidate
        secret_id = (secret_id + 1) % vocab_size
        attempts += 1
    
    # shouldn't happen with a reasonable vocab, but just in case
    raise RuntimeError(f"couldn't find valid secret word after {max_attempts} attempts")


def hash_secret(word: str, salt: str = "") -> str:
    """
    create a hash of the secret word for client-side verification.
    
    the client can hash their guess and compare to meta.secret_hash
    to verify a win without revealing the answer in the data files.
    
    args:
        word: the secret word
        salt: optional salt (could be date-based)
    
    returns:
        hex-encoded sha256 hash
    """
    payload = f"{word}{salt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()

