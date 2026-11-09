"""Tests for scoring.py and the ACDC flattening in run_acdc.py."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_acdc import flatten_innermost, parse_contain  # noqa: E402
from scoring import (classify_relation, connected_cluster_count, count_statuses,  # noqa: E402
                     layer_measures, layer_of_package)

NODES = {"a", "b", "c", "d"}
CLUSTER = {"a": "1", "b": "1", "c": "2", "d": "3"}
PAIRS = {("1", "2")}   # an edge from a node of cluster 1 to a node of cluster 2


def relation(from_cell, to_cell, level="interface"):
    return {f"{level}_from": from_cell, f"{level}_to": to_cell}


def status(from_cell, to_cell):
    return classify_relation(relation(from_cell, to_cell), "interface", CLUSTER, NODES, PAIRS)


class Classify(unittest.TestCase):
    def test_unmapped_first(self):
        self.assertEqual(status("", "c"), "unmapped")
        self.assertEqual(status("x", ""), "unmapped")      # unmapped wins over outside

    def test_outside(self):
        self.assertEqual(status("jakarta.Servlet", "c"), "outside")

    def test_same_type(self):
        self.assertEqual(status("a", "a"), "same-type")

    def test_hidden(self):
        self.assertEqual(status("a", "b"), "hidden")

    def test_recovered_needs_a_directed_cluster_edge(self):
        self.assertEqual(status("a", "c"), "recovered")
        self.assertEqual(status("c", "a"), "absent")       # reverse direction has no edge
        self.assertEqual(status("a", "d"), "absent")

    def test_several_ids(self):
        self.assertEqual(status("a | x", "c"), "recovered")     # x is not a node: dropped
        self.assertEqual(status("a | b", "c"), "recovered")
        self.assertEqual(status("a | c", "b"), "hidden")        # (a,b) hidden: hidden is checked first
        self.assertEqual(status("a | a", "a"), "same-type")

    def test_counts_and_recall(self):
        counts = count_statuses(["recovered", "hidden", "absent", "unmapped"])
        self.assertEqual(counts["recall"], 0.25)
        self.assertEqual(counts["relations"], 4)
        self.assertEqual(counts["hidden_share"], 0.25)


class Layers(unittest.TestCase):
    def test_prefixes(self):
        self.assertEqual(layer_of_package("org.apache.tomcat.util.net.openssl"), 1)
        self.assertEqual(layer_of_package("org.apache.tomcat.util.net"), 1)
        self.assertEqual(layer_of_package("org.apache.coyote.http11"), 2)
        self.assertEqual(layer_of_package("org.apache.catalina"), 3)
        self.assertIsNone(layer_of_package("org.apache.tomcat.util.buf"))
        self.assertIsNone(layer_of_package("org.apache.catalinax"))

    def test_measures(self):
        layers = {"n1": 1, "n2": 1, "c1": 2, "k1": 3, "k2": 3, "u": None}
        cluster = {"n1": "A", "n2": "A", "c1": "B", "k1": "B", "k2": "C", "u": "A"}
        # A: layer 1 (2 of 2), B: layers 2 and 3 -> no dominant layer (1 of 2), C: layer 3
        edges = [("n1", "k2"), ("k2", "n1"), ("c1", "n1"), ("n1", "n2"), ("u", "k2")]
        result = layer_measures(cluster, layers, edges)
        self.assertEqual(result["layered_types"], 5)
        self.assertEqual(result["dominated_clusters"], 2)          # A and C
        self.assertAlmostEqual(result["own_layer_share"], 3 / 5)    # n1, n2 in A; k2 in C
        # edges run between clusters, so u (no layer, but in cluster A) counts as well:
        self.assertEqual(result["against_edges"], 2)               # n1 -> k2 and u -> k2 (A: layer 1, C: layer 3)
        self.assertEqual(result["compared_edges"], 3)              # n1->k2, k2->n1, u->k2 (u's cluster A)


class ConnectedClusters(unittest.TestCase):
    def test_isolated_singletons_are_not_counted(self):
        cluster = {"a": "1", "b": "1", "c": "2", "iso1": "3", "iso2": "4"}
        self.assertEqual(connected_cluster_count(cluster, [("a", "c")]), 2)
        self.assertEqual(connected_cluster_count(cluster, []), 0)

    def test_cluster_with_one_connected_node_counts(self):
        cluster = {"a": "1", "iso": "1", "c": "2"}      # a package-like cluster holding an isolated node
        self.assertEqual(connected_cluster_count(cluster, [("a", "c")]), 2)


class AcdcFlatten(unittest.TestCase):
    def test_innermost_subsystem(self):
        text = ("contain top.ss inner.ss\ncontain top.ss x\ncontain inner.ss x\n"
                "contain inner.ss y\ncontain top.ss z\n")
        assignment, unclustered = flatten_innermost(parse_contain(text), ["x", "y", "z", "w"])
        self.assertEqual(assignment["x"], "inner.ss")      # listed in both: the inner one wins
        self.assertEqual(assignment["y"], "inner.ss")
        self.assertEqual(assignment["z"], "top.ss")
        self.assertTrue(assignment["w"].startswith("unclustered_"))
        self.assertEqual(unclustered, 1)


if __name__ == "__main__":
    unittest.main()
