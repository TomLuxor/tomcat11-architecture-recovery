"""Tests for mojofm.py: hand-computed cases and an exhaustive check for up to 5 objects.

Run from the repo root:  py -3.13 -m unittest discover -s analysis/technique_b/tests -v
"""

import itertools
import sys
import unittest
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mojofm import max_mno, mno, mojofm  # noqa: E402


def partition(*blocks):
    return {item: f"c{index}" for index, block in enumerate(blocks) for item in block}


def all_partitions(items):
    items = list(items)
    if not items:
        yield frozenset()
        return
    first, rest = items[0], items[1:]
    for p in all_partitions(rest):
        yield p | {frozenset([first])}
        for block in p:
            yield (p - {block}) | {block | {first}}


def neighbours(p):
    blocks = list(p)
    for a, b in itertools.combinations(blocks, 2):                  # Join
        yield (p - {a, b}) | {a | b}
    for a in blocks:                                               # Move
        for x in a:
            rest = a - {x}
            base = (p - {a}) | ({rest} if rest else set())
            for b in blocks:
                if b is not a:
                    yield (base - {b}) | {b | {x}}
            if rest:
                yield base | {frozenset([x])}


def distances_from(start):
    dist, queue = {start: 0}, deque([start])
    while queue:
        current = queue.popleft()
        for nxt in neighbours(current):
            nxt = frozenset(nxt)
            if nxt not in dist:
                dist[nxt] = dist[current] + 1
                queue.append(nxt)
    return dist


def as_map(p):
    return {x: f"c{i}" for i, block in enumerate(sorted(p, key=sorted)) for x in block}


class HandComputed(unittest.TestCase):
    def test_identical_partitions(self):
        p = partition("ab", "cd")
        self.assertEqual(mno(p, p), 0)
        self.assertEqual(mojofm(p, p), 100.0)

    def test_one_cluster_to_two_halves(self):
        source, target = partition("abcd"), partition("ab", "cd")
        self.assertEqual(mno(source, target), 2)       # move c and d into a new cluster
        self.assertEqual(max_mno(target), 2)
        self.assertEqual(mojofm(source, target), 0.0)

    def test_singletons_to_one_cluster(self):
        source, target = partition("a", "b", "c", "d"), partition("abcd")
        self.assertEqual(mno(source, target), 3)       # three joins
        self.assertEqual(max_mno(target), 3)
        self.assertEqual(mojofm(source, target), 0.0)

    def test_best_overlap_only(self):
        # A = {0,1,3},{2}  ->  B = {0,1,2},{3}: move 3 out, join {0,1} and {2}: 2 operations.
        # (Matching on every overlap instead of the best overlaps would give 1: wrong.)
        source, target = partition([0, 1, 3], [2]), partition([0, 1, 2], [3])
        self.assertEqual(mno(source, target), 2)

    def test_one_move(self):
        self.assertEqual(mno(partition("abc", "de"), partition("ab", "cde")), 1)

    def test_different_objects_rejected(self):
        with self.assertRaises(ValueError):
            mno(partition("ab"), partition("ac"))


class Exhaustive(unittest.TestCase):
    def test_all_pairs_up_to_five_objects(self):
        for n in range(1, 6):
            parts = list(all_partitions(range(n)))
            dist = {p: distances_from(p) for p in parts}
            for a in parts:
                for b in parts:
                    self.assertEqual(mno(as_map(a), as_map(b)), dist[a][b], (sorted(map(sorted, a)), sorted(map(sorted, b))))
            for b in parts:
                self.assertEqual(max_mno(as_map(b)), max(dist[a][b] for a in parts))


if __name__ == "__main__":
    unittest.main()
