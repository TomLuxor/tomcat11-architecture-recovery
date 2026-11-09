// Mapping check: which mapped types are contained in a scanned JAR (placeholders do not count).
UNWIND $fqns AS fqn
OPTIONAL MATCH (:Artifact)-[:CONTAINS]->(t:Type {fqn: fqn})
RETURN fqn, t IS NOT NULL AS found
