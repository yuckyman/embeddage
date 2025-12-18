"""
project local neighborhood to stable 3D coordinates.

uses PCA to reduce from embed_dim → 3, with deterministic
orientation so the same day always produces the same layout.
"""

import numpy as np
from numpy.typing import NDArray


def project_to_3d(
    embeddings: NDArray[np.float32],
    local_ids: NDArray[np.int64],
    seed: int = 42
) -> NDArray[np.float32]:
    """
    project local neighborhood embeddings to 3D via PCA.
    
    args:
        embeddings: full embedding matrix, shape (V, D)
        local_ids: indices of k neighbors to project
        seed: random seed for reproducibility (not actually used in pure PCA,
              but kept for potential future use)
    
    returns:
        coordinates of shape (k, 3), centered and scaled to max radius ~1
    """
    k = len(local_ids)
    
    # extract local vectors
    local_vecs = embeddings[local_ids]  # shape (k, D)
    
    # --- PCA via SVD ---
    
    # center the data
    mean_vec = local_vecs.mean(axis=0)
    centered = local_vecs - mean_vec
    
    # SVD: X = U @ S @ Vt
    # U has shape (k, k), S has shape (min(k, D),), Vt has shape (D, D)
    # we only need first 3 components
    U, S, Vt = np.linalg.svd(centered, full_matrices=False)
    
    # project to 3D: take first 3 columns of U, scaled by singular values
    # this gives us the principal component scores
    coords = U[:, :3] * S[:3]  # shape (k, 3)
    
    # --- stabilize orientation ---
    
    # center at origin
    centroid = coords.mean(axis=0)
    coords = coords - centroid
    
    # scale so max radius ≈ 1
    norms = np.linalg.norm(coords, axis=1)
    max_norm = norms.max()
    if max_norm > 1e-8:
        coords = coords / max_norm
    
    # stabilize sign of each axis using the first point (closest neighbor)
    # this ensures consistent orientation across runs
    anchor = coords[0]  # closest neighbor to secret
    
    for j in range(3):
        # if the anchor's projection on this axis is negative, flip the axis
        if anchor[j] < 0:
            coords[:, j] *= -1
    
    # additional stabilization: ensure first non-zero coordinate of anchor is positive
    # (handles edge case where anchor[0] == 0)
    for j in range(3):
        col_sum = np.sum(coords[:, j])
        if abs(col_sum) > 1e-8:
            if col_sum < 0:
                coords[:, j] *= -1
            break
    
    return coords.astype(np.float32)


def projection_seed_for_date(date_str: str) -> int:
    """
    derive a deterministic seed from a date string.
    
    (currently not used since PCA is deterministic,
    but useful if we switch to t-SNE/UMAP later)
    """
    import hashlib
    h = hashlib.sha256(date_str.encode("utf-8")).digest()
    return int.from_bytes(h[8:12], byteorder="little")

