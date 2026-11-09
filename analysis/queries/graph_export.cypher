// Input graph of Technique B: the in-scope types (as in source_model_size.cypher), the DEPENDS_ON relationships
// between them (clustering input, scoring of containment relations) and the type pairs with an INVOKES between
// their methods (scoring of messages). Nested types are merged into their top-level type afterwards (lib/graph.js).
MATCH (:Artifact)-[:CONTAINS]->(t:Type)
WHERE any(p IN $inScope WHERE t.fqn STARTS WITH p) AND NOT t:Module AND NOT t.fqn ENDS WITH '.package-info'
WITH collect(t) AS types
CALL (types) {
  UNWIND types AS a
  MATCH (a)-[:DEPENDS_ON]->(b:Type) WHERE b IN types AND a <> b
  RETURN collect(DISTINCT [a.fqn, b.fqn]) AS dependencies
}
CALL (types) {
  UNWIND types AS a
  MATCH (a)-[:DECLARES]->(:Method)-[:INVOKES]->(:Method)<-[:DECLARES]-(b:Type) WHERE b IN types AND a <> b
  RETURN collect(DISTINCT [a.fqn, b.fqn]) AS invocations
}
RETURN [t IN types | t.fqn] AS types, dependencies, invocations
