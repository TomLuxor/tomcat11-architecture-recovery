// Size of the source model (Results, Section 6.1). In scope: types contained in a scanned JAR (not the
// placeholders a JAR creates for types it only references, nor module-info or package-info) whose fully qualified name starts
// with a prefix in $inScope (analysis/scope.json).
MATCH (:Artifact)-[:CONTAINS]->(t:Type)
WHERE any(p IN $inScope WHERE t.fqn STARTS WITH p) AND NOT t:Module AND NOT t.fqn ENDS WITH '.package-info'
WITH collect(t) AS types
CALL (types) {
  UNWIND types AS a
  MATCH (a)-[:DEPENDS_ON]->(b:Type) WHERE b IN types AND a <> b
  RETURN count(DISTINCT [a, b]) AS dependsOn
}
CALL (types) {
  UNWIND types AS a
  MATCH (a)-[:DECLARES]->(m1:Method)-[:INVOKES]->(m2:Method)<-[:DECLARES]-(b:Type) WHERE b IN types
  RETURN count(DISTINCT [m1, m2]) AS invokes
}
RETURN size(types) AS types, size([t IN types WHERE NOT t.fqn CONTAINS '$']) AS topLevelTypes, dependsOn, invokes
