#!/usr/bin/env python3
"""Run Leiden on the Technique B graph: 10 runs per configuration.

Usage (repo root):
  py -3.13 analysis/technique_b/run_leiden.py
  py -3.13 analysis/technique_b/run_leiden.py --resolutions 1        # main configuration only

Inputs : analysis/output/graph_nodes.csv, graph_edges.csv
Outputs: analysis/output/clustering_assignments.csv, clustering_runs.csv
         (rows of the same algorithm + configuration are replaced, others kept)

Fixed by the paper (Section 4, Technique B, and the appendix on the clustering input):
  * graph treated as undirected and unweighted (a pair of nodes with an edge in
    one or both directions is one edge), all 881 nodes are vertices, isolated
    nodes become singleton clusters,
  * modularity with resolution gamma: main configuration gamma = 1, sensitivity
    check gamma = 0.5 and 2; gamma is never chosen by comparing with the
    documentation,
  * 10 runs per configuration, one seed each (recorded in clustering_runs.csv).
Own choice (state it in the paper): n_iterations = -1, i.e. iterate until a
partition does not improve any more.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from common import (ASSIGNMENT_FIELDS, ASSIGNMENTS_FILE, RUN_FIELDS, RUNS_FILE,
                    merge_rows, read_nodes, read_pairs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--nodes", type=Path, default=Path("analysis/output/graph_nodes.csv"))
    parser.add_argument("--edges", type=Path, default=Path("analysis/output/graph_edges.csv"))
    parser.add_argument("--out", type=Path, default=Path("analysis/output"))
    parser.add_argument("--resolutions", type=float, nargs="+", default=[1.0, 0.5, 2.0])
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--first-seed", type=int, default=0)
    parser.add_argument("--n-iterations", type=int, default=-1)
    args = parser.parse_args()

    try:
        import igraph
        import leidenalg
    except ImportError as error:
        raise SystemExit("Missing packages: run `py -3.13 -m pip install -r analysis/technique_b/requirements.txt`") from error

    ids, _ = read_nodes(args.nodes)
    pairs, skipped = read_pairs(args.edges, ids)
    index = {node: i for i, node in enumerate(ids)}
    undirected = sorted({tuple(sorted((index[s], index[t]))) for s, t in pairs})
    graph = igraph.Graph(n=len(ids), edges=undirected, directed=False)
    print(f"graph: {graph.vcount()} vertices, {graph.ecount()} undirected edges "
          f"(from {len(pairs)} directed; {skipped} rows skipped)")
    from importlib.metadata import PackageNotFoundError, version
    try:
        print(f"igraph {version('igraph')}, leidenalg {version('leidenalg')} (record both for tab:setup)")
    except PackageNotFoundError:
        print("igraph / leidenalg versions not found (record them for tab:setup)")

    assignment_rows, run_rows = [], []
    for resolution in args.resolutions:
        config = f"gamma{resolution:g}"
        sizes = []
        for run in range(args.runs):
            seed = args.first_seed + run
            start = time.perf_counter()
            partition = leidenalg.find_partition(
                graph, leidenalg.RBConfigurationVertexPartition,
                n_iterations=args.n_iterations, seed=seed, resolution_parameter=resolution)
            elapsed = time.perf_counter() - start
            sizes.append(len(partition))
            run_rows.append({"algorithm": "leiden", "config": config, "run": run, "seed": seed,
                             "clusters": len(partition), "runtime_s": f"{elapsed:.3f}",
                             "note": f"modularity;undirected;unweighted;n_iterations={args.n_iterations}"})
            assignment_rows += [{"algorithm": "leiden", "config": config, "run": run, "seed": seed,
                                 "id": ids[i], "cluster": f"c{cluster}"}
                                for i, cluster in enumerate(partition.membership)]
        print(f"{config}: {args.runs} runs, clusters min {min(sizes)} max {max(sizes)}")

    merge_rows(args.out / ASSIGNMENTS_FILE, ASSIGNMENT_FIELDS, assignment_rows)
    merge_rows(args.out / RUNS_FILE, RUN_FIELDS, run_rows)
    print(f"written: {args.out / ASSIGNMENTS_FILE}, {args.out / RUNS_FILE}")


if __name__ == "__main__":
    main()
