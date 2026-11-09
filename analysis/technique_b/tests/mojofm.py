"""MoJo and MoJoFM for partitions given as dict node -> cluster.

mno(P, Q)  = minimum number of Move and Join operations that turn P into Q
             (Move = one object to another existing or a new cluster,
              Join = merge two clusters; Tzerpos & Holt 1999).
MoJoFM(P, Q) = (1 - mno(P, Q) / max over all P' of mno(P', Q)) * 100  (Wen & Tzerpos 2004).

Computation: every cluster of P keeps its best-overlapping target cluster, so
  Moves = n - sum(best overlap per P-cluster)
  Joins = (number of P-clusters) - (maximum matching between P-clusters and
          their best-overlapping target clusters)
Only best overlaps may enter the matching (using every overlap gives wrong
distances: the first draft of this check did exactly that).

Validated against an exhaustive search over all pairs of partitions of up to 7
objects (769,129 pairs for n = 7) in tests/test_mojofm.py (n <= 5 there, for speed).
"""
from __future__ import annotations
import sys
from collections import defaultdict


def _max_matching(adjacency: list[list[int]]) -> int:
    sys.setrecursionlimit(max(sys.getrecursionlimit(), 20000))
    match_of_right: dict[int, int] = {}

    def augment(left: int, seen: set[int]) -> bool:
        for right in adjacency[left]:
            if right in seen:
                continue
            seen.add(right)
            if right not in match_of_right or augment(match_of_right[right], seen):
                match_of_right[right] = left
                return True
        return False

    return sum(augment(left, set()) for left in range(len(adjacency)))


def mno(source: dict[str, str], target: dict[str, str]) -> int:
    """Minimum number of Move and Join operations that turn `source` into `target`."""
    if source.keys() != target.keys():
        raise ValueError("partitions must contain exactly the same objects")
    overlap: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for node, cluster in source.items():
        overlap[cluster][target[node]] += 1
    moves = 0
    adjacency = []
    target_index: dict[str, int] = {}
    for cluster, counts in overlap.items():
        best = max(counts.values())
        moves += sum(counts.values()) - best
        adjacency.append([target_index.setdefault(t, len(target_index))
                          for t, c in counts.items() if c == best])
    joins = len(overlap) - _max_matching(adjacency)
    return moves + joins


def max_mno(target: dict[str, str]) -> int:
    """max over all partitions P of mno(P, target) (Wen & Tzerpos)."""
    sizes = sorted(len(group) for group in _groups(target).values())
    groups = 0
    for size in sizes:
        if groups < size:
            groups += 1
    return len(target) - groups


def _groups(partition):
    groups = defaultdict(set)
    for node, cluster in partition.items():
        groups[cluster].add(node)
    return groups


def mojofm(source: dict[str, str], target: dict[str, str]) -> float:
    """MoJoFM in percent; 100 means identical."""
    maximum = max_mno(target)
    if maximum == 0:
        return 100.0
    return 100.0 * (1.0 - mno(source, target) / maximum)
