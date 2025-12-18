"""
compute rankings and top-k neighborhood for a secret word.

this is the core embeddage logic: given a secret, rank all words
by cosine similarity and extract the closest neighbors.
"""

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray


@dataclass
class RankingResult:
    """results from compute_rankings."""
    
    # full rank array: rank[i] = position of word i (1 = closest to secret)
    rank: NDArray[np.uint32]
    
    # indices of top-k neighbors (excluding secret), sorted by similarity
    local_ids: NDArray[np.int64]
    
    # similarity scores for local_ids (for debugging)
    local_scores: NDArray[np.float32]
    
    # the secret word's index
    secret_id: int


def compute_rankings(
    embeddings: NDArray[np.float32],
    secret_id: int,
    k: int = 256
) -> RankingResult:
    """
    compute full rankings and top-k neighborhood.
    
    args:
        embeddings: normalized embeddings, shape (V, D)
        secret_id: index of the secret word
        k: number of neighbors to include in local cluster
    
    returns:
        RankingResult with rank array and local neighborhood
    """
    V = embeddings.shape[0]
    
    # get secret vector
    secret_vec = embeddings[secret_id]  # shape (D,)
    
    # compute cosine similarities (dot product since vectors are normalized)
    # this gives us scores in [-1, 1]
    scores: NDArray[np.float32] = embeddings @ secret_vec  # shape (V,)
    
    # --- top-k neighbors (excluding secret) ---
    
    # get k+1 highest scores (to account for secret itself)
    k_plus = k + 1
    top_indices = np.argpartition(scores, -k_plus)[-k_plus:]
    
    # remove secret from candidates
    top_indices = top_indices[top_indices != secret_id]
    
    # if we somehow got fewer than k (shouldn't happen), just take what we have
    top_indices = top_indices[:k]
    
    # sort by score descending
    sorted_order = np.argsort(scores[top_indices])[::-1]
    local_ids = top_indices[sorted_order]
    local_scores = scores[local_ids]
    
    # --- full ranking ---
    
    # argsort gives indices that would sort scores ascending,
    # we want descending (highest score = rank 1)
    order = np.argsort(scores)[::-1]
    
    # rank[i] = position of word i in the sorted order
    # rank 1 = most similar (should be the secret itself)
    rank = np.empty(V, dtype=np.uint32)
    rank[order] = np.arange(1, V + 1, dtype=np.uint32)
    
    return RankingResult(
        rank=rank,
        local_ids=local_ids,
        local_scores=local_scores,
        secret_id=secret_id
    )

