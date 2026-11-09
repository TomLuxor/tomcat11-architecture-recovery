#!/usr/bin/env python3
"""Score all clusterings of Technique B and write the result tables.

Usage (repo root), after run_leiden.py and run_acdc.py:
  py -3.13 analysis/technique_b/score_clusterings.py

Inputs : analysis/output/graph_nodes.csv, graph_edges.csv, graph_invokes.csv,
         documented_relations.csv, clustering_assignments.csv, clustering_runs.csv
Outputs (analysis/output/):
  clustering_scores.csv     per algorithm, configuration, run, level, view: clusters (and connected_clusters:
                            clusters with at least one node that has an edge), recovered,
                            hidden, absent, unmapped, outside, same_type, recall, hidden_share
  clustering_relations.csv  status of every documented relation per run and level
  clustering_layers.csv     layer check per run
  clustering_mojofm.csv     MoJoFM between runs of a configuration (stability) and of every
                            run against the package baseline
  clustering_summary.csv    mean / min / max over the runs of every measure

The package baseline (every package of graph_nodes.csv is one cluster) is scored like a run.
Recall always has all documented relations of the view in the denominator; read it together
with the number of clusters and the hidden share.
"""

from __future__ import annotations

import argparse
import statistics
from collections import defaultdict
from pathlib import Path

from common import (ASSIGNMENTS_FILE, RUNS_FILE, read_assignments, read_csv, read_nodes,
                    read_pairs, read_seeds, write_csv)
from mojofm import mojofm
from scoring import (STATUSES, cluster_pairs, connected_cluster_count, count_statuses, layer_measures,
                     layer_of_package, score_relations)

LEVELS = ("interface", "implementation")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    out_dir = Path("analysis/output")
    parser.add_argument("--nodes", type=Path, default=out_dir / "graph_nodes.csv")
    parser.add_argument("--edges", type=Path, default=out_dir / "graph_edges.csv")
    parser.add_argument("--invokes", type=Path, default=out_dir / "graph_invokes.csv")
    parser.add_argument("--relations", type=Path, default=out_dir / "documented_relations.csv")
    parser.add_argument("--dir", type=Path, default=out_dir, help="directory of the clustering_* files")
    args = parser.parse_args()

    ids, packages = read_nodes(args.nodes)
    node_set = set(ids)
    edges, _ = read_pairs(args.edges, ids)
    invokes, _ = read_pairs(args.invokes, ids)
    relations = read_csv(args.relations)
    layer_of_node = {node: layer_of_package(packages[node]) for node in ids}

    clusterings = read_assignments(args.dir / ASSIGNMENTS_FILE)
    seeds = read_seeds(args.dir / RUNS_FILE)
    baseline = dict(packages)
    clusterings[("packages", "packages", 0)] = baseline
    seeds[("packages", "packages", 0)] = ""
    for key, partition in clusterings.items():
        if set(partition) != node_set:
            raise SystemExit(f"{key}: the clustering does not cover exactly the nodes of {args.nodes}")

    score_rows, relation_rows, layer_rows, mojo_rows = [], [], [], []
    for key in sorted(clusterings):
        algorithm, config, run = key
        cluster_of = clusterings[key]
        clusters = len(set(cluster_of.values()))
        connected_clusters = connected_cluster_count(cluster_of, edges)
        containment_pairs = cluster_pairs(edges, cluster_of)
        message_pairs = cluster_pairs(invokes, cluster_of)
        for level in LEVELS:
            statuses = score_relations(relations, level, cluster_of, node_set,
                                       containment_pairs, message_pairs)
            by_view = defaultdict(list)
            for view, relation_id, status in statuses:
                by_view[view].append(status)
                relation_rows.append({"algorithm": algorithm, "config": config, "run": run,
                                      "level": level, "view": view, "id": relation_id, "status": status})
            for view, view_statuses in by_view.items():
                counts = count_statuses(view_statuses)
                score_rows.append({"algorithm": algorithm, "config": config, "run": run,
                                   "seed": seeds[key], "level": level, "view": view, "clusters": clusters,
                                   "connected_clusters": connected_clusters,
                                   "relations": counts["relations"], "recovered": counts["recovered"],
                                   "hidden": counts["hidden"], "absent": counts["absent"],
                                   "unmapped": counts["unmapped"], "outside": counts["outside"],
                                   "same_type": counts["same-type"],
                                   "recall": f"{counts['recall']:.6f}",
                                   "hidden_share": f"{counts['hidden_share']:.6f}"})
        layers = layer_measures(cluster_of, layer_of_node, edges)
        layer_rows.append({"algorithm": algorithm, "config": config, "run": run, "clusters": clusters,
                           **{k: (f"{v:.6f}" if isinstance(v, float) else v) for k, v in layers.items()}})
        if algorithm != "packages":
            mojo_rows.append({"kind": "baseline", "algorithm": algorithm, "config": config,
                              "run_a": run, "run_b": "packages",
                              "mojofm": f"{mojofm(cluster_of, baseline):.4f}"})

    groups = defaultdict(list)
    for algorithm, config, run in clusterings:
        if algorithm != "packages":
            groups[(algorithm, config)].append(run)
    for (algorithm, config), runs in sorted(groups.items()):
        for a in sorted(runs):
            for b in sorted(runs):
                if a != b:
                    mojo_rows.append({"kind": "stability", "algorithm": algorithm, "config": config,
                                      "run_a": a, "run_b": b,
                                      "mojofm": f"{mojofm(clusterings[(algorithm, config, a)], clusterings[(algorithm, config, b)]):.4f}"})

    score_fields = ["algorithm", "config", "run", "seed", "level", "view", "clusters", "connected_clusters", "relations",
                    "recovered", "hidden", "absent", "unmapped", "outside", "same_type", "recall", "hidden_share"]
    write_csv(args.dir / "clustering_scores.csv", score_fields, score_rows)
    write_csv(args.dir / "clustering_relations.csv",
              ["algorithm", "config", "run", "level", "view", "id", "status"], relation_rows)
    write_csv(args.dir / "clustering_layers.csv",
              ["algorithm", "config", "run", "clusters", "layered_types", "dominated_clusters",
               "own_layer_share", "against_edges", "compared_edges"], layer_rows)
    write_csv(args.dir / "clustering_mojofm.csv",
              ["kind", "algorithm", "config", "run_a", "run_b", "mojofm"], mojo_rows)

    # Summary: mean / min / max over the runs of a configuration.
    values = defaultdict(list)
    for row in score_rows:
        for measure in ("clusters", "connected_clusters", "recovered", "hidden", "absent", "unmapped", "outside",
                        "same_type", "recall", "hidden_share"):
            values[(row["algorithm"], row["config"], row["level"], row["view"], measure)].append(float(row[measure]))
    for row in layer_rows:
        for measure in ("own_layer_share", "against_edges", "dominated_clusters"):
            values[(row["algorithm"], row["config"], "", "layers", measure)].append(float(row[measure]))
    for row in mojo_rows:
        values[(row["algorithm"], row["config"], "", row["kind"], "mojofm")].append(float(row["mojofm"]))
    summary_rows = []
    for (algorithm, config, level, view, measure), items in sorted(values.items()):
        summary_rows.append({"algorithm": algorithm, "config": config, "level": level, "view": view,
                             "measure": measure, "runs": len(items), "mean": f"{statistics.mean(items):.4f}",
                             "min": f"{min(items):.4f}", "max": f"{max(items):.4f}"})
    write_csv(args.dir / "clustering_summary.csv",
              ["algorithm", "config", "level", "view", "measure", "runs", "mean", "min", "max"], summary_rows)

    # Compact overview in the terminal.
    lookup = {(r["algorithm"], r["config"], r["level"], r["view"], r["measure"]): r for r in summary_rows}
    print(f"{len(clusterings)} clusterings scored, {len(relations)} documented relations, levels: {', '.join(LEVELS)}")
    print(f"{'algorithm':<10}{'config':<10}{'runs':>4} {'clusters':>9}{'conn.cl.':>9}  "
          + "".join(f"{'recall msgs ' + level[:4]:>26}" for level in LEVELS) + f"{'hidden msgs impl':>20}{'MoJoFM pkg':>12}")
    for (algorithm, config) in sorted({(k[0], k[1]) for k in clusterings}):
        def get(level, view, measure, field="mean"):
            row = lookup.get((algorithm, config, level, view, measure))
            return row[field] if row else "-"
        runs = len([k for k in clusterings if k[:2] == (algorithm, config)])
        recall = "".join(f"{get(level, 'messages', 'recall') + ' [' + get(level, 'messages', 'recall', 'min') + '-' + get(level, 'messages', 'recall', 'max') + ']':>26}" for level in LEVELS)
        mojo = get("", "baseline", "mojofm") if algorithm != "packages" else "-"
        print(f"{algorithm:<10}{config:<10}{runs:>4} {get('implementation', 'messages', 'clusters'):>9}{get('implementation', 'messages', 'connected_clusters'):>9}  {recall}"
              f"{get('implementation', 'messages', 'hidden_share'):>20}{mojo:>12}")
    print(f"written: clustering_scores / _relations / _layers / _mojofm / _summary .csv in {args.dir}")


if __name__ == "__main__":
    main()
