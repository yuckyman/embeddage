"""
configuration constants for the embeddage builder.

all the magic numbers live here so they're easy to tweak.
"""

from dataclasses import dataclass
from pathlib import Path


@dataclass
class Config:
    """builder configuration — tweak these as needed."""
    
    # embedding dimensions (matches glove.2024.wikigiga.100d)
    embed_dim: int = 100
    
    # number of nearest neighbors to include in local cluster
    k: int = 256
    
    # timezone for day boundaries
    day_boundary_tz: str = "America/New_York"
    
    # schema version for meta.json (bump if format changes)
    # v2 adds secret_word + secret_id fields
    schema_version: int = 2
    
    # projection method identifier
    projection_method: str = "pca"
    
    # paths (relative to project root by default)
    data_dir: Path = Path("data")
    output_dir: Path = Path("docs/data")
    
    # filenames for preprocessed data
    vocab_file: str = "words.json"
    embeddings_file: str = "embeddings_normed.npy"
    
    def __post_init__(self):
        """ensure paths are Path objects."""
        self.data_dir = Path(self.data_dir)
        self.output_dir = Path(self.output_dir)
    
    @property
    def vocab_path(self) -> Path:
        return self.data_dir / self.vocab_file
    
    @property
    def embeddings_path(self) -> Path:
        return self.data_dir / self.embeddings_file


# default config instance
DEFAULT_CONFIG = Config()

