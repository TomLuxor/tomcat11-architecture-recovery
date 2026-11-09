// Containment check: type-level DEPENDS_ON between two different mapped types. Both ends must be types
// contained in a scanned JAR, so that edges to placeholders are not counted twice.
MATCH (:Artifact)-[:CONTAINS]->(a:Type)-[:DEPENDS_ON]->(b:Type)<-[:CONTAINS]-(:Artifact)
WHERE a.fqn IN $fqns AND b.fqn IN $fqns AND a <> b
RETURN DISTINCT a.fqn AS from, b.fqn AS to
