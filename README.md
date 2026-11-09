# Architecture Recovery of Apache Tomcat 11: Scripts and Data

Replication package for the paper *Architecture Recovery of Apache Tomcat 11* by Demetre Miminoshvili, Paul Thiesen, and Tom Unger (HAW Kiel, 2026).

The study compares two static architecture recovery techniques against the architecture documentation that the maintainers of Apache Tomcat publish, using release 11.0.27:

- **Technique A, mapping-based recovery:** reflexion models that check the documented containment relations and the messages of the eleven sequence diagrams. Each component is mapped once to its interface and once to its implementation class.
- **Technique B, clustering-based recovery:** ACDC and Leiden on the type dependency graph, compared with the documented layers and components.
- **RQ3:** the documented messages that the type-level check misses, classified by the mechanism that hides them and by what a static analysis that follows the type hierarchy could recover.

## Contents

| Path | What it holds |
|---|---|
| `analysis/*.js`, `analysis/lib/` | Node.js scripts: repository analysis, intended model, mapping, reflexion model, graph export, RQ3 |
| `analysis/queries/` | Cypher queries on the jQAssistant source model |
| `analysis/technique_b/` | Python scripts: ACDC and Leiden runs, scoring, MoJoFM, with tests in `tests/` |
| `analysis/output/` | All result tables that the paper reports |
| `analysis/review/` | The independent mapping and RQ3 reviews of two authors, their instructions, and the agreement |
| `analysis/test/` | Unit tests of the Node.js scripts |
| `analysis/README.md` | Every step with its script and output, the definitions, and the mapping conventions |

## Where the results of the paper come from

| Paper | Files in `analysis/output/` |
|---|---|
| Subject system (code size, documentation coverage and history) | `module_sizes.csv`, `doc_coverage.csv`, `doc_history.csv`, `overview_checks.csv`, `overview_activity.csv` |
| Intended model and mapping | `participants.csv`, `messages.csv`, `documented_relations.csv`, `mapping_draft.csv`, `mapping.csv` |
| RQ1, reflexion models | `reflexion_summary.csv`, `reflexion_containment.csv`, `reflexion_messages.csv`, `divergences.csv`, `divergence_kinds.csv` |
| RQ2, clusterings | `clustering_summary.csv`, `clustering_components.csv`, `clustering_layers.csv`, `clustering_mojofm.csv`, `clustering_runs.csv`, `clustering_assignments.csv` |
| RQ3, missed messages | `rq3_categories.csv`, `rq3_static.csv`, `rq3_static_summary.csv` |

## Reproducing the results

Tools and versions used:

| Purpose | Tool |
|---|---|
| Subject system | Apache Tomcat 11.0.27: source checkout at tag `11.0.27` (commit `52f3b364e5`) and binary release |
| Source model | jQAssistant CLI 2.9.1 (`jqassistant-commandline-neo4jv5`), embedded Neo4j 5.26.20, OpenJDK 25.0.4.1 |
| Scripts | Node.js 22, `neo4j-driver` 5.28.3 |
| ACDC | [ARCADE Core](https://github.com/usc-softarch/arcade_core) 1.2.0, Temurin OpenJDK 25.0.5 |
| Leiden | Python 3.13, `leidenalg` 0.12.0, `igraph` 1.0.0 (`analysis/technique_b/requirements.txt`) |

Neither Tomcat nor ARCADE Core is included. `analysis/README.md` describes how to get Tomcat, how to scan it with jQAssistant, and the order of the steps. All commands run from the root of this repository, for example:

```
npm install --prefix analysis
node analysis/parse_diagrams.js <tomcat-checkout> analysis/output
npm test --prefix analysis
```

The Technique B scripts list their usage in their headers (`analysis/technique_b/run_acdc.py`, `run_leiden.py`, `score_clusterings.py`).

## Licenses

- Code (scripts, queries, tests): MIT License, see `LICENSE`.
- Data (`analysis/output/`, `analysis/review/`): Creative Commons Attribution 4.0 International (CC BY 4.0), see `LICENSE-DATA.md`.
- The data contains type names, method names, and diagram contents of Apache Tomcat, which is licensed under the Apache License 2.0 by the Apache Software Foundation.

## Citation

Please cite the paper and this archive. The DOI of the archive is listed on its Zenodo page.
