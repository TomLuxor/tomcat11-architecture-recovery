// RQ3: possible receivers of a call, as in class hierarchy analysis. $type is a type on which a source calls the
// documented method (field declaredBy of absence_facts.cypher). The call can reach an instance of every concrete
// in-scope class that is $type itself or one of its subtypes; interfaces, annotations and abstract classes have no
// instances. $type is matched by name, so that the real type and the placeholders of other JARs are both found.
MATCH (s:Type) WHERE s.fqn = $type
OPTIONAL MATCH (t:Type)-[:EXTENDS|IMPLEMENTS*0..8]->(s)
WHERE (t)<-[:CONTAINS]-(:Artifact) AND t.fqn STARTS WITH 'org.apache.'
  AND NOT t:Interface AND NOT t:Annotation AND NOT coalesce(t.abstract, false)
RETURN collect(DISTINCT t.fqn) AS receivers
