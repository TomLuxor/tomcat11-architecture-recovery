# Agreement on the 18 open mapping rows

Reviewers: Paul (`mapping_paul.csv`), Demetre (`mapping_demetre.csv`). Both decided independently using the facts in `mapping_instructions.md`. Both used an AI assistant, as recorded in `../effort_log.csv`.

```
node analysis/compare_reviews.js analysis/review/mapping_paul.csv analysis/review/mapping_demetre.csv participant type
Agreement: 12 of 18 rows (66.7 %)
```

**Agreed (12):** all 11 boxes with several candidate types or an evident type (`BasicAuthenticator`, `Host`, `Wrapper`, `Request`, `CoyoteRequest`, `Response`, `CoyoteResponse`, `InputBuffer`, `SocketProcessor`, `Global Naming Resources`, `SCI`) and `Child` (`none`).

**Disagreed (6):** `Filter A`, `Filter B`, `Selector`, `ServerSocket`, `SocketChannel`, `UtilityExecutor`. All six are boxes that are not Tomcat code (filters of the web application, JDK classes). Paul did not map them; Demetre mapped them to `jakarta.servlet.Filter` and the JDK types. For `SocketChannel`, Demetre's file names `java.nio.channels.ServerSocketChannel` with the reason of the `ServerSocket` row, presumably a copy slip (the candidate was `java.nio.channels.SocketChannel`).

**Resolution (2026-11-06, Paul, with Demetre's consent):** all six are `none`. The source model contains the Tomcat release JARs without third-party libraries (paper, Section 4.4), so the JDK types are not part of it, and the filters belong to the web application, not to Tomcat. Their messages count as absent because of the mapping, which the paper reports separately (Section 4.7).

The settled decisions are in `mapping_resolved.csv`; `output/mapping.csv` is built from it with `resolve_mapping.js`.
