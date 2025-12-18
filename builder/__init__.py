"""
semantle daily artifact builder

generates precomputed rankings, projections, and metadata
for a word-guessing game based on GloVe embeddings.
"""

from .config import Config
from .embeddings import load_embeddings, load_vocab
from .word_of_day import secret_for_date
from .rankings import compute_rankings
from .projection import project_to_3d
from .artifacts import write_daily_artifacts

__all__ = [
    "Config",
    "load_embeddings",
    "load_vocab", 
    "secret_for_date",
    "compute_rankings",
    "project_to_3d",
    "write_daily_artifacts",
]

