// RQ3 facts for one absent message. $from and $to are the mapped types of both ends (both levels), $name the
// documented method name in lower case ('<init>' for a creation, '' if the diagram names none).
// calls:      invocations of a method with that name made by a source type, one of its nested types or one of
//             its supertypes, with the type that declares the invoked method and whether that type is a target
//             type or a supertype of one (toTarget; JDK supertypes are not scanned, so e.g. Runnable is false)
// callers:    types that invoke a method with that name declared by a target type itself
// declaredBy: target types or their supertypes that declare a method with that name
// methods:    names of all methods of the target types and their supertypes (to spot misspelled names)
// reflective: reflective calls made by a source type or its nested types
WITH $from AS from, $to AS to, $name AS name
CALL (from, to, name) {
  MATCH (c:Type)-[:DECLARES]->(:Method)-[:INVOKES]->(m:Method)<-[:DECLARES]-(d:Type)
  WHERE (c)<-[:CONTAINS]-(:Artifact) AND toLower(coalesce(m.name, last(split(split(m.signature, '(')[0], ' ')))) = name
    AND d.fqn <> 'java.lang.Object'
    AND (any(f IN from WHERE c.fqn = f OR c.fqn STARTS WITH f + '$')
         OR exists { MATCH (s:Type)-[:EXTENDS*1..6]->(c) WHERE s.fqn IN from })
  WITH c, d, CASE WHEN c.fqn IN from THEN 'self'
                  WHEN any(f IN from WHERE c.fqn STARTS WITH f + '$') THEN 'nested' ELSE 'supertype' END AS by
  WITH c, d, by, d.fqn IN to OR exists { MATCH (t:Type)-[:EXTENDS|IMPLEMENTS*1..6]->(d) WHERE t.fqn IN to } AS toTarget
  RETURN collect(DISTINCT {caller: c.fqn, by: by, declaredBy: d.fqn, toTarget: toTarget}) AS calls
}
CALL (to, name) {
  OPTIONAL MATCH (c:Type)-[:DECLARES]->(:Method)-[:INVOKES]->(m:Method)<-[:DECLARES]-(t:Type)
  WHERE t.fqn IN to AND (t)<-[:CONTAINS]-(:Artifact) AND (c)<-[:CONTAINS]-(:Artifact)
    AND toLower(coalesce(m.name, '')) = name
  RETURN collect(DISTINCT c.fqn) AS callers
}
CALL (to, name) {
  OPTIONAL MATCH (t:Type)-[:EXTENDS|IMPLEMENTS*0..6]->(s:Type)-[:DECLARES]->(sm:Method)
  WHERE t.fqn IN to AND (t)<-[:CONTAINS]-(:Artifact) AND sm.name IS NOT NULL
  RETURN collect(DISTINCT CASE WHEN toLower(sm.name) = name THEN s.fqn END) AS declaredBy,
         collect(DISTINCT sm.name) AS methods
}
CALL (from) {
  OPTIONAL MATCH (c:Type)-[:DECLARES]->(:Method)-[:INVOKES]->(r:Method)<-[:DECLARES]-(rt:Type)
  WHERE any(f IN from WHERE c.fqn = f OR c.fqn STARTS WITH f + '$')
  WITH rt.fqn + '.' + coalesce(r.name, last(split(split(r.signature, '(')[0], ' '))) AS call
  WHERE call IN ['java.lang.Class.forName', 'java.lang.Class.newInstance', 'java.lang.Class.getConstructor',
                 'java.lang.Class.getMethod', 'java.lang.reflect.Constructor.newInstance',
                 'java.lang.reflect.Method.invoke', 'org.apache.tomcat.util.digester.Digester.parse']
  RETURN collect(DISTINCT call) AS reflective
}
RETURN calls, callers, declaredBy, methods, reflective
