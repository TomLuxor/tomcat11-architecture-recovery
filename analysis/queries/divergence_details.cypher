// Divergence description: for each type pair [a, b], the methods of b that a invokes and whether a extends or
// implements b (directly or indirectly).
UNWIND $pairs AS p
MATCH (a:Type {fqn: p[0]})<-[:CONTAINS]-(:Artifact)
MATCH (b:Type {fqn: p[1]})<-[:CONTAINS]-(:Artifact)
OPTIONAL MATCH (a)-[:DECLARES]->(:Method)-[:INVOKES]->(m:Method)<-[:DECLARES]-(b)
RETURN p[0] + ' -> ' + p[1] AS pair,
       [n IN collect(DISTINCT coalesce(m.name, last(split(split(m.signature, '(')[0], ' ')))) WHERE n IS NOT NULL] AS methods,
       exists((a)-[:EXTENDS|IMPLEMENTS*1..6]->(b)) AS inherits
