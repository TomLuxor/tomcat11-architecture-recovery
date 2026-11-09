"""Scoring a clustering against the documented relations (pure functions).

Rules of the relation scoring in the appendix of the paper (clustering configurations).
For every documented relation and mapping level the status is the first that applies:

  unmapped   an end cell is empty
  outside    an end has no id that is a node of the graph (e.g. jakarta.servlet.*)
  same-type  both ends are the same node (no clustering can separate them)
  hidden     both ends lie in the same cluster
  recovered  the ends lie in different clusters AND some node of the source cluster has an
             edge to some node of the target cluster (graph_edges.csv for containment,
             graph_invokes.csv for messages)
  absent     otherwise

Several ids in one cell are separated by " | ". Interpretation used here (the paper does not
spell it out; check against Section 4.8): ids that are not nodes are dropped from an end that
also has node ids; the combinations of the remaining ids with different source and target are
evaluated; no such combination means same-type; the relation is hidden if ANY combination is
hidden, otherwise recovered if ANY combination is recovered.
"""

from __future__ import annotations

from collections import Counter, defaultdict

STATUSES = ["recovered", "hidden", "absent", "unmapped", "outside", "same-type"]
LAYER_PREFIXES = (("org.apache.tomcat.util.net", 1), ("org.apache.coyote", 2), ("org.apache.catalina", 3))


def split_ids(cell: str | None) -> list[str]:
    return [part.strip() for part in (cell or "").split("|") if part.strip()]


def cluster_pairs(edges, cluster_of: dict[str, str]) -> set[tuple[str, str]]:
    """Directed pairs of different clusters that have at least one edge between their nodes."""
    return {(cluster_of[s], cluster_of[t]) for s, t in edges if cluster_of[s] != cluster_of[t]}


def classify_relation(relation: dict[str, str], level: str, cluster_of: dict[str, str],
                      node_set, pairs_of_view: set[tuple[str, str]]) -> str:
    from_ids = split_ids(relation.get(f"{level}_from"))
    to_ids = split_ids(relation.get(f"{level}_to"))
    if not from_ids or not to_ids:
        return "unmapped"
    from_nodes = [i for i in from_ids if i in node_set]
    to_nodes = [i for i in to_ids if i in node_set]
    if not from_nodes or not to_nodes:
        return "outside"
    combinations = [(a, b) for a in from_nodes for b in to_nodes if a != b]
    if not combinations:
        return "same-type"
    if any(cluster_of[a] == cluster_of[b] for a, b in combinations):
        return "hidden"
    if any((cluster_of[a], cluster_of[b]) in pairs_of_view for a, b in combinations):
        return "recovered"
    return "absent"


def score_relations(relations, level: str, cluster_of: dict[str, str], node_set,
                    containment_pairs: set, message_pairs: set) -> list[tuple[str, str, str]]:
    """Return [(view, relation id, status)] for one clustering and one mapping level."""
    result = []
    for relation in relations:
        pairs = containment_pairs if relation["view"] == "containment" else message_pairs
        result.append((relation["view"], relation["id"],
                       classify_relation(relation, level, cluster_of, node_set, pairs)))
    return result


def count_statuses(statuses: list[str]) -> dict[str, float]:
    counts = Counter(statuses)
    total = len(statuses)
    row: dict[str, float] = {status: counts[status] for status in STATUSES}
    row["relations"] = total
    row["recall"] = counts["recovered"] / total if total else float("nan")
    row["hidden_share"] = counts["hidden"] / total if total else float("nan")
    return row


def layer_of_package(package: str) -> int | None:
    for prefix, layer in LAYER_PREFIXES:
        if package == prefix or package.startswith(prefix + "."):
            return layer
    return None


def layer_measures(cluster_of: dict[str, str], layer_of_node: dict[str, int | None], edges) -> dict[str, float]:
    """Layer check on the component level.

    A cluster is dominated by a layer if MORE THAN HALF of its layered types belong to it
    (otherwise it has no dominant layer). Layers: 1 = util.net (lowest), 2 = coyote, 3 = catalina.
      own_layer_share   share of layered types that lie in a cluster dominated by their own layer
      against_edges     edges between two different clusters, both with a dominant layer, that run
                        from a lower-layer cluster to a higher-layer cluster (against the order)
      compared_edges    edges between two different dominated clusters (denominator for context)
    """
    members: dict[str, Counter] = defaultdict(Counter)
    for node, layer in layer_of_node.items():
        if layer is not None:
            members[cluster_of[node]][layer] += 1
    dominant = {}
    for cluster, counter in members.items():
        layer, count = counter.most_common(1)[0]
        if count * 2 > sum(counter.values()):
            dominant[cluster] = layer
    layered = [node for node, layer in layer_of_node.items() if layer is not None]
    own = sum(1 for node in layered if dominant.get(cluster_of[node]) == layer_of_node[node])
    against = compared = 0
    for source, target in edges:
        cs, ct = cluster_of[source], cluster_of[target]
        if cs == ct or cs not in dominant or ct not in dominant:
            continue
        compared += 1
        if dominant[cs] < dominant[ct]:
            against += 1
    return {"layered_types": len(layered), "dominated_clusters": len(dominant),
            "own_layer_share": own / len(layered) if layered else float("nan"),
            "against_edges": against, "compared_edges": compared}
