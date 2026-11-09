#!/usr/bin/env python3
"""Run ACDC (ARCADE Core) on the Technique B graph: 10 runs.

Usage (repo root), jar path with forward slashes:
  py -3.13 analysis/technique_b/run_acdc.py --jar <path>/ARCADE_Core.jar

Inputs : analysis/output/graph_nodes.csv, graph_edges.csv
Work   : analysis/technique_b/work/acdc/  (input.rsf, acdc_output_runNN.rsf)
Outputs: analysis/output/clustering_assignments.csv, clustering_runs.csv

Step 1  writes input.rsf, one line `depends <source> <target>` per directed edge
        (edge direction is used by ACDC; no utility types are removed).
Step 2  runs   java -cp <jar> edu.usc.softarch.arcade.clustering.acdc.ACDC <input> <output>
        (class name taken from arcade_core scripts/run_clustering.py; use --cmd to
        change the whole command, with {input} and {output} as placeholders).
Step 3  reads the RSF result (`contain <cluster> <member>` lines). ACDC output is a
        nested decomposition: each type is assigned to the INNERMOST subsystem that
        contains it. Types that ACDC does not mention (nodes without edges) become one
        singleton cluster each; their number is stored in the note.

ACDC has no parameter. The paper asks for 10 runs per configuration; the original
algorithm is deterministic for a fixed input, so by default all 10 runs use the same
input and will give the same result (then say so in the paper). --shuffle-input
permutes the order of the input lines with the run's seed, which tests the
sensitivity to input order; whether that belongs in the study is the group's decision.
With --shuffle-input the runs are stored as configuration "shuffled", so the main ACDC
result (configuration "default") is kept; rows of the same configuration are replaced.

Record for tab:setup: the arcade_core commit (git -C <arcade_core> rev-parse HEAD) and
the version in its pom.xml, plus the Java version.
"""

from __future__ import annotations

import argparse
import random
import shlex
import subprocess
import time
from pathlib import Path

from common import (ASSIGNMENT_FIELDS, ASSIGNMENTS_FILE, RUN_FIELDS, RUNS_FILE,
                    merge_rows, read_nodes, read_pairs)

DEFAULT_CLASS = "edu.usc.softarch.arcade.clustering.acdc.ACDC"


def parse_contain(text: str) -> list[tuple[str, str]]:
    pairs = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0] == "contain":
            pairs.append((parts[1].strip('"'), parts[2].strip('"')))
    return pairs


def flatten_innermost(pairs: list[tuple[str, str]], node_ids: list[str]) -> tuple[dict[str, str], int]:
    """Assign every node to the innermost subsystem containing it.

    Returns ({node: cluster}, number of nodes ACDC did not mention).
    Nodes that are not mentioned get a singleton cluster `unclustered_<k>`.
    """
    nodes = set(node_ids)
    parent: dict[str, str] = {}          # subsystem -> enclosing subsystem
    containers: dict[str, list[str]] = {}  # node -> subsystems that list it
    for cluster, member in pairs:
        if member in nodes:
            containers.setdefault(member, []).append(cluster)
        else:
            parent.setdefault(member, cluster)

    def depth(cluster: str) -> int:
        count, seen = 0, {cluster}
        while cluster in parent and parent[cluster] not in seen:
            cluster = parent[cluster]
            seen.add(cluster)
            count += 1
        return count

    assignment = {node: max(clusters, key=depth) for node, clusters in containers.items()}
    unclustered = 0
    for node in node_ids:
        if node not in assignment:
            assignment[node] = f"unclustered_{unclustered}"
            unclustered += 1
    return assignment, unclustered


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--nodes", type=Path, default=Path("analysis/output/graph_nodes.csv"))
    parser.add_argument("--edges", type=Path, default=Path("analysis/output/graph_edges.csv"))
    parser.add_argument("--out", type=Path, default=Path("analysis/output"))
    parser.add_argument("--work", type=Path, default=Path("analysis/technique_b/work"))
    parser.add_argument("--jar", help="path to ARCADE_Core.jar (forward slashes)")
    parser.add_argument("--cmd", help="full command template with {input} and {output}")
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--first-seed", type=int, default=0)
    parser.add_argument("--shuffle-input", action="store_true")
    parser.add_argument("--config", help="configuration name stored with the runs "
                                         "(default: 'default', or 'shuffled' with --shuffle-input)")
    args = parser.parse_args()
    config = args.config or ("shuffled" if args.shuffle_input else "default")
    if not (args.jar or args.cmd):
        raise SystemExit("Give --jar <path to ARCADE_Core.jar> or --cmd <command template>.")
    template = args.cmd or f"java -cp {args.jar} {DEFAULT_CLASS} {{input}} {{output}}"

    ids, _ = read_nodes(args.nodes)
    pairs, skipped = read_pairs(args.edges, ids)
    lines = [f"depends {source} {target}\n" for source, target in pairs]
    work = args.work / ("acdc" if config == "default" else f"acdc_{config}")
    work.mkdir(parents=True, exist_ok=True)
    print(f"{len(lines)} depends lines ({skipped} rows skipped)")

    assignment_rows, run_rows = [], []
    for run in range(args.runs):
        seed = args.first_seed + run
        run_lines = list(lines)
        if args.shuffle_input:
            random.Random(seed).shuffle(run_lines)
        rsf_input, rsf_output = work / f"input_run{run:02d}.rsf", work / f"acdc_output_run{run:02d}.rsf"
        rsf_input.write_text("".join(run_lines), encoding="utf-8", newline="\n")

        # Split first, fill placeholders afterwards: Windows paths keep their backslashes.
        tokens = shlex.split(template.replace("\\", "/"))
        command = [t.format(input=str(rsf_input), output=str(rsf_output)) for t in tokens]
        start = time.perf_counter()
        result = subprocess.run(command, capture_output=True, text=True)
        elapsed = time.perf_counter() - start
        if result.returncode != 0 or not rsf_output.exists():
            raise SystemExit(f"ACDC failed in run {run} (exit {result.returncode}):\n{result.stderr or result.stdout}")

        contain = parse_contain(rsf_output.read_text(encoding="utf-8", errors="replace"))
        if not contain:
            raise SystemExit(f"No `contain` lines in {rsf_output}; check the ACDC output format.")
        assignment, unclustered = flatten_innermost(contain, ids)
        clusters = len(set(assignment.values()))
        run_rows.append({"algorithm": "acdc", "config": config, "run": run, "seed": seed,
                         "clusters": clusters, "runtime_s": f"{elapsed:.3f}",
                         "note": f"innermost;unclustered_singletons={unclustered};"
                                 f"shuffle_input={'yes' if args.shuffle_input else 'no'}"})
        assignment_rows += [{"algorithm": "acdc", "config": config, "run": run, "seed": seed,
                             "id": node, "cluster": cluster} for node, cluster in assignment.items()]
        print(f"run {run}: {clusters} clusters, {unclustered} unclustered nodes, {elapsed:.1f}s")

    merge_rows(args.out / ASSIGNMENTS_FILE, ASSIGNMENT_FIELDS, assignment_rows)
    merge_rows(args.out / RUNS_FILE, RUN_FIELDS, run_rows)
    print(f"written: {args.out / ASSIGNMENTS_FILE}, {args.out / RUNS_FILE}")


if __name__ == "__main__":
    main()