// Message check: a method declared by one mapped type invokes a method declared by another mapped type.
// The invoked method is the one the compiler resolved, i.e. declared by the static type of the receiver.
// Methods of placeholder types only carry a signature, hence the name is taken from it if missing.
MATCH (:Artifact)-[:CONTAINS]->(a:Type)-[:DECLARES]->(:Method)-[:INVOKES]->(m:Method)<-[:DECLARES]-(b:Type)
WHERE a.fqn IN $fqns AND b.fqn IN $fqns AND a <> b AND (b)<-[:CONTAINS]-(:Artifact)
RETURN a.fqn AS from, b.fqn AS to,
       collect(DISTINCT coalesce(m.name, last(split(split(m.signature, '(')[0], ' ')))) AS methods
