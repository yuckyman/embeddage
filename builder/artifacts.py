"""
write daily artifacts to disk.

generates all the files the browser needs:
- meta.json: metadata and validation info
- local_ids.json: indices of k nearest neighbors
- rank.bin: binary file with full ranking (uint32 LE)
- local_xyz.bin: binary file with 3D coordinates (float32 LE)
"""

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from .config import Config
from .word_of_day import hash_secret


def write_daily_artifacts(
    date_str: str,
    secret_id: int,
    secret_word: str,
    vocab_size: int,
    rank: NDArray[np.uint32],
    local_ids: NDArray[np.int64],
    coords: NDArray[np.float32],
    config: Config,
    output_dir: Path | None = None
) -> dict[str, Path]:
    """
    write all daily artifacts to disk.
    
    args:
        date_str: YYYY-MM-DD
        secret_id: index of secret word
        secret_word: the actual secret (for hashing)
        vocab_size: V
        rank: full ranking array, shape (V,)
        local_ids: neighbor indices, shape (k,)
        coords: 3D coordinates, shape (k, 3)
        config: builder config
        output_dir: override output directory (default: config.output_dir)
    
    returns:
        dict mapping artifact name to file path
    """
    out = output_dir or config.output_dir
    out.mkdir(parents=True, exist_ok=True)
    
    k = len(local_ids)
    paths: dict[str, Path] = {}
    
    # --- meta.json ---
    meta = {
        "schema_version": config.schema_version,
        "date": date_str,
        "day_boundary_tz": config.day_boundary_tz,
        "k": k,
        "vocab_size": vocab_size,
        "embed_dim": config.embed_dim,
        "projection_method": config.projection_method,
        "projection_params": {},
        "projection_seed": _seed_from_date(date_str),
        "secret_hash": hash_secret(secret_word, salt=date_str),
        # new in schema v2: reveal support
        "secret_id": int(secret_id),
        "secret_word": secret_word,
    }
    
    meta_path = out / f"{date_str}.meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    paths["meta"] = meta_path
    
    # --- local_ids.json ---
    local_ids_path = out / f"{date_str}.local_ids.json"
    with open(local_ids_path, "w", encoding="utf-8") as f:
        json.dump([int(x) for x in local_ids], f)
    paths["local_ids"] = local_ids_path
    
    # --- rank.bin (uint32 little-endian, no header) ---
    rank_path = out / f"{date_str}.rank.bin"
    rank_le = rank.astype("<u4")  # ensure little-endian uint32
    rank_le.tofile(rank_path)
    paths["rank"] = rank_path
    
    # sanity check
    expected_size = 4 * vocab_size
    actual_size = rank_path.stat().st_size
    assert actual_size == expected_size, f"rank.bin size mismatch: {actual_size} != {expected_size}"
    
    # --- local_xyz.bin (float32 little-endian, no header) ---
    xyz_path = out / f"{date_str}.local_xyz.bin"
    coords_flat = coords.astype("<f4")  # ensure little-endian float32
    coords_flat.tofile(xyz_path)
    paths["local_xyz"] = xyz_path
    
    # sanity check
    expected_size = 12 * k  # 3 floats × 4 bytes × k points
    actual_size = xyz_path.stat().st_size
    assert actual_size == expected_size, f"local_xyz.bin size mismatch: {actual_size} != {expected_size}"
    
    return paths


def _seed_from_date(date_str: str) -> int:
    """derive a stable integer seed from date."""
    import hashlib
    h = hashlib.sha256(date_str.encode("utf-8")).digest()
    return int.from_bytes(h[8:12], byteorder="little")

