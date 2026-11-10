# Analysis

Scripts and data for the case study. The report cites the results; this folder makes them reproducible.

## Input

The scripts read a checkout of Apache Tomcat at tag `11.0.27` (commit `52f3b364e5`, 2026-10-06). Keep the checkout outside this repository:

```
git clone --filter=blob:none --no-checkout https://github.com/apache/tomcat.git tomcat
git -C tomcat checkout 11.0.27
```

Nothing from the checkout is built or executed; the scripts only read files and `git log`.

The source model (step 4) is scanned from the binary release instead, whose JARs report `Apache Tomcat/11.0.27`, built 2026-10-06:

```
# in a new, empty directory outside this repository, e.g. ../tomcat-dist
https://archive.apache.org/dist/tomcat/tomcat-11/v11.0.27/bin/apache-tomcat-11.0.27.tar.gz (+ .sha512)
sha512sum -c apache-tomcat-11.0.27.tar.gz.sha512 && tar xzf apache-tomcat-11.0.27.tar.gz
```

Tools: jQAssistant CLI 2.9.1 (`jqassistant-commandline-neo4jv5`) with embedded Neo4j 5.26.20, OpenJDK 25.0.4.1, Node 22. The combined run (2026-11-10) used a new scan with Microsoft Build of OpenJDK 17.0.19 and Node 20.17; on that scan, `reflexion.js` with `mapping.csv` reproduces the step 5 outputs byte for byte.

## Steps and outputs

| Step | Script | Output (`output/`) | Status |
|---|---|---|---|
| 2 Repository analysis | `repo_stats.js` | `module_sizes.csv`: Java files, lines and code lines per module | done |
| 2 Repository analysis | `doc_history.js` | `doc_history.csv`: commits to the architecture documentation up to the tag | done |
| 2 Repository analysis | `doc_coverage.js <tomcat-checkout> analysis/output/mapping.csv` | `doc_coverage.csv`: code lines per module in the files and packages of the 67 mapped participants (with `mapping_draft.csv`, the 56 name-matched ones) | done |
| 2 Repository analysis | `overview_stability.js` | `overview_checks.csv`: each statement of the overview's component descriptions checked against the code in yearly snapshots of the main line; `overview_activity.csv`: commits per year to the overview, the files of the six components, and `java/` (needs a full clone). The paper reports only the check at 11.0.27, since multi-commit analysis is out of its scope | done |
| 3 Intended model | (from `overview.xml`, by hand) | `structural_model.csv`: documented containment relations | done |
| 3 Intended model | `parse_diagrams.js` | `participants.csv`, `messages.csv` from the 11 PlantUML diagrams | done |
| 3 Intended model | `draft_mapping.js` | `mapping_draft.csv`: proposed interface- and implementation-level type per participant | done (reviewed, see below) |
| 4 Source model | `scan.sh` | jQAssistant store in `jqassistant/store/` (not versioned) | done |
| 4 Source model | `queries/source_model_size.cypher` | `source_model.csv`: in-scope types, `DEPENDS_ON` type pairs, `INVOKES` method pairs | done |
| 4 Mapping | `compare_reviews.js`, `resolve_mapping.js` | `mapping.csv`: final mapping rules (from `review/`) | done |
| 5 Technique A | `reflexion.js` | `reflexion_containment.csv`, `reflexion_messages.csv`, `reflexion_summary.csv`, `divergences.csv`, `mapping_coverage.csv` | done |
| 6 Technique A | `divergence_kinds.js` | `divergence_kinds.csv`: kind and layer direction per divergence | done |
| B input | `export_graph.js` | `graph_nodes.csv` (top-level types, package), `graph_edges.csv` (`DEPENDS_ON`, nested types merged), `graph_invokes.csv`, `documented_relations.csv` (ends per level) | done |
| B clustering | `technique_b/run_acdc.py`, `technique_b/run_leiden.py` | `clustering_assignments.csv`, `clustering_runs.csv`: ACDC (ARCADE Core 1.2.0) on the unshuffled input and with `--shuffle-input`, Leiden with γ = 0.5, 1, 2; ten runs each | done |
| B scoring | `technique_b/score_clusterings.py` | `clustering_scores.csv`, `clustering_relations.csv`, `clustering_layers.csv`, `clustering_mojofm.csv`, `clustering_summary.csv` | done |
| 7 RQ3 | `rq3_sheet.js` | `rq3_groups.csv`, `rq3_categories.csv`; `review/rq3_facts.md`, `review/rq3_rules.csv` | done (agreement: `review/rq3_agreement.md`) |
| 8 RQ3 | `rq3_static.js` | `rq3_static.csv`, `rq3_static_summary.csv`: which absent messages a static analysis that follows the type hierarchy could resolve (needs the jQAssistant server) | done |
| 9 RQ2 | `component_clusters.js` | `clustering_components.csv`: over how many clusters each clustering distributes the six documented components, per level | done |
| 9 RQ2 | `random_baseline.js` | `clustering_random_baseline.csv`: chance level of the layer and component measures, from 1,000 seeded random partitions per run with the same cluster sizes; checks its observed values against `clustering_layers.csv` and `clustering_components.csv`. `against_edges_layered` counts the dependencies against the layer order between two layered types; the script also prints the types outside the layers at which the others end | done |
| RQ1 combined | `combine_mapping.js`, `reflexion.js` | `mapping_combined.csv`: each participant mapped to its interface and its implementation at once; `reflexion.js analysis/output/mapping_combined.csv analysis/output/combined` writes the same five files as step 5 to `combined/` (96 of 135 mapped messages converge). Run it before steps 7 and 8, which take the messages that stay absent with it | done (2026-11-10) |

Agreement of two reviews: `compare_reviews.js <a.csv> <b.csv> <key> <field>` prints the share of agreeing rows and, for a single field, Cohen's kappa (RQ3 classification, rules vs. Demetre: 47 of 48, κ = 0.97).

Run all from the repository root, e.g. `node analysis/parse_diagrams.js <tomcat-checkout> analysis/output`. Steps 4 to 7 need `npm install --prefix analysis` once and the jQAssistant server (below). Tests: `npm test --prefix analysis`.

**Scan:** `JQA_HOME=<jqassistant-cli> analysis/scan.sh <tomcat-distribution>` resets the store, scans the JARs listed in `scope.json` and runs `java-classpath:Resolve`. Then `jqassistant server` in `analysis/jqassistant` opens the graph at `http://localhost:7474` (Bolt on port 7687, no authentication). `bin/bootstrap.jar` is not scanned because its 12 classes are byte-identical copies of classes in `catalina.jar` and `tomcat-util.jar`.

**Placeholder types:** every scanned JAR gets its own placeholder node for each type it only references. Without `java-classpath:Resolve`, relations between JARs (e.g. `CoyoteAdapter` → `org.apache.coyote.Request`) end at the placeholder. The resolution copies them to the real type with the property `resolved: true`. Queries therefore only use types that a scanned JAR `CONTAINS`. In-scope types are those with an `org.apache.` name, without `module-info` and `package-info` (package annotations without dependencies).

## Definitions

- **Code lines**: lines that are neither blank nor comments.
- **Message**: a call (`A -> B`) or object creation (`A -->> B **`) between two *different* participants. Self-calls and returns (`-->`, `return`) are counted separately and are not part of the intended model.

## Mapping review

`mapping_draft.csv` was produced by name matching against all type declarations in `java/`. Status per participant:

- `exact` (55): one type with that name. Still check it against the diagram context.
- `case-normalized` (1): `LockoutRealm` → `LockOutRealm`.
- `ambiguous` (7): several types share the name (e.g. `Request`, `Response`, `InputBuffer` exist in both `catalina.connector` and `coyote`). Decide from the diagram.
- `manual` (11): no type found, e.g. JDK classes (`Selector`, `ServerSocket`, `SocketChannel`), application code (`Filter A/B`), roles (`Child`, `SCI`), and `CoyoteRequest`/`CoyoteResponse`, `Global Naming Resources`, `UtilityExecutor`.

Plural labels such as `Service(s)` are mapped to the singular type. The interface-level column is filled only where a `org.apache.catalina` interface of that name exists.

**Procedure (paper, Section 4.5):** the 18 `ambiguous` and `manual` rows are decided by two authors independently, each in their own copy, before comparing. Record the number of disagreements and how each was resolved.

**Outcome:** of the 56 other rows, 45 were confirmed and 11 corrected (`decision = reviewed` in `output/mapping.csv`), e.g. `Protocol`, which the name matching had mapped to a TLS version enum. Conventions: the implementation level holds the standard implementation; for a generic role (Container, Realm, Valve) its common base class; an empty level falls back to the other one (`Cluster`, whose implementation is in the excluded `catalina-ha.jar`). Nested types are not merged into their declaring type. The two reviews of the 18 open rows (`review/mapping_paul.csv`, `review/mapping_demetre.csv`, facts in `review/mapping_instructions.md`) agree on 12; the six differences concern boxes that are not Tomcat code and were settled as unmapped (`review/mapping_agreement.md`, `review/mapping_resolved.csv`).

## Technique A and RQ3

- `reflexion.js [mapping.csv] [output-dir]` classifies each documented relation per level as `convergence`, `absence`, `unmapped` or `same-type` (`lib/reflexion.js`). A message counts as found if any method of the source type invokes any method declared by the target type (type-pair level); `*_method_seen` records whether the documented method is among them. `recall` = C / (C + A + unmapped), `recall_mapped` = C / (C + A). Divergences of the structural view are counted among its six components only.
- `divergence_kinds.js` gives each divergence one kind by a fixed rule (`lib/divergence_kinds.js`): inheritance, creation, request-model, accessor, other; plus its direction in the layers (`up` would run against the layered style).
- `rq3_sheet.js <author>` selects the messages absent at both levels (`lib/rq3.js`, 48), writes the facts per message (`review/rq3_facts.md`, query `queries/absence_facts.cypher`), the classification by the codebook rules (`review/rq3_rules.csv`, codebook `review/rq3_instructions.md`) and an empty sheet per author. `rq3_categories.csv` counts only the 39 of them that stay absent with the combined mapping (`output/combined/reflexion_messages.csv`), and `rq3_groups.csv` gives both numbers. Compare with `node analysis/compare_reviews.js analysis/review/rq3_rules.csv analysis/review/rq3_<author>.csv id category`.
- `rq3_static.js` takes these 39 messages and asks what a static analysis that follows the type hierarchy could recover. For every type on which the source calls the documented method (the target or a supertype of it), `queries/possible_receivers.cypher` lists the concrete in-scope classes that can receive the call. `resolveStatically` in `lib/rq3.js` then assigns `unique` (a creation, or a called type with one possible receiver), `ambiguous` (several possible receivers, so configuration or run time decides), `no-static-call` or `diagram-error`. The mechanism per message comes from `review/rq3_rules.csv`.
