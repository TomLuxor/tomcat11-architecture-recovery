// Mapping coverage: share of the in-scope types (as in source_model_size.cypher) that the mapping reaches.
MATCH (:Artifact)-[:CONTAINS]->(t:Type)
WHERE any(p IN $inScope WHERE t.fqn STARTS WITH p) AND NOT t:Module AND NOT t.fqn ENDS WITH '.package-info'
RETURN count(t) AS inScope, count(CASE WHEN t.fqn IN $fqns THEN 1 END) AS reached
