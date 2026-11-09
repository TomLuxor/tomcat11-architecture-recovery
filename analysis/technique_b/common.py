"""Shared helpers for Technique B (clustering). Standard library only.

Inputs (analysis/output/, written by analysis/export_graph.js, never changed here):
  graph_nodes.csv           id,package
  graph_edges.csv           source,target          (DEPENDS_ON, directed)
  graph_invokes.csv         source,target          (INVOKES pairs, directed)
  documented_relations.csv  view,id,from,to,kind,message,interface_from,interface_to,
                            implementation_from,implementation_to
Outputs written by the run scripts (merged per algorithm and configuration):
  clustering_assignments.csv  algorithm,config,run,seed,id,cluster
  clustering_runs.csv         algorithm,config,run,seed,clusters,runtime_s,note
"""

from __future__ import annotations

import csv
from pathlib import Path

ASSIGNMENT_FIELDS = ["algorithm", "config", "run", "seed", "id", "cluster"]
RUN_FIELDS = ["algorithm", "config", "run", "seed", "clusters", "runtime_s", "note"]
ASSIGNMENTS_FILE = "clustering_assignments.csv"
RUNS_FILE = "clustering_runs.csv"


def read_csv(path: Path | str) -> list[dict[str, str]]:
    with Path(path).open(newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def read_nodes(path: Path | str) -> tuple[list[str], dict[str, str]]:
    """Return (ids in file order, {id: package})."""
    rows = read_csv(path)
    ids = [row["id"].strip() for row in rows]
    if not ids:
        raise ValueError(f"{path}: no nodes")
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path}: duplicate id")
    return ids, {row["id"].strip(): row["package"].strip() for row in rows}


def read_pairs(path: Path | str, node_ids) -> tuple[list[tuple[str, str]], int]:
    """Return (distinct directed (source, target) pairs in file order, skipped rows).

    Self-pairs and pairs with an unknown node are skipped and counted.
    """
    known = set(node_ids)
    seen: set[tuple[str, str]] = set()
    pairs: list[tuple[str, str]] = []
    skipped = 0
    for row in read_csv(path):
        pair = (row["source"].strip(), row["target"].strip())
        if pair[0] == pair[1] or pair[0] not in known or pair[1] not in known:
            skipped += 1
            continue
        if pair not in seen:
            seen.add(pair)
            pairs.append(pair)
    return pairs, skipped


def write_csv(path: Path | str, fields: list[str], rows: list[dict[str, object]]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def merge_rows(path: Path | str, fields: list[str], new_rows: list[dict[str, object]]) -> None:
    """Add new_rows to a CSV; rows of the same (algorithm, config) are replaced.

    Re-running one configuration therefore never duplicates it and never
    deletes the other configurations.
    """
    path = Path(path)
    replaced = {(str(row["algorithm"]), str(row["config"])) for row in new_rows}
    kept = [row for row in read_csv(path) if (row["algorithm"], row["config"]) not in replaced] \
        if path.exists() else []
    combined = kept + [{key: row.get(key, "") for key in fields} for row in new_rows]
    combined.sort(key=lambda row: (row["algorithm"], row["config"], int(row["run"])))
    write_csv(path, fields, combined)


def read_assignments(path: Path | str) -> dict[tuple[str, str, int], dict[str, str]]:
    """Return {(algorithm, config, run): {node id: cluster}}."""
    result: dict[tuple[str, str, int], dict[str, str]] = {}
    for row in read_csv(path):
        key = (row["algorithm"], row["config"], int(row["run"]))
        result.setdefault(key, {})[row["id"]] = row["cluster"]
    return result


def read_seeds(path: Path | str) -> dict[tuple[str, str, int], str]:
    return {(row["algorithm"], row["config"], int(row["run"])): row["seed"] for row in read_csv(path)}
