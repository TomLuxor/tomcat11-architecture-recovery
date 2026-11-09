// Reflexion logic of Technique A (Murphy et al.): classifies documented relations against the relations observed
// between the mapped types. Pure functions; the queries that produce `observed` are in analysis/reflexion.js.
//
// mapping:  Map label -> row of output/mapping.csv (interface_level, implementation_level; several types ' | ')
// observed: Map "<fqnA> -> <fqnB>" -> Set of invoked method names (empty for DEPENDS_ON)

const splitTypes = v => (v || '').split('|').map(s => s.trim()).filter(Boolean);

// Types of a participant at one level. An empty cell falls back to the other level (decision D5).
function typesFor(row, level) {
  if (!row) return { types: [], fallback: false };
  const own = splitTypes(level === 'interface' ? row.interface_level : row.implementation_level);
  if (own.length) return { types: own, fallback: false };
  const other = splitTypes(level === 'interface' ? row.implementation_level : row.interface_level);
  return { types: other, fallback: other.length > 0 };
}

// Documented messages: calls and creations between participants, with aliases resolved to labels per diagram.
function documentedMessages(messages, participants) {
  const label = new Map(participants.map(p => [`${p.diagram}|${p.alias}`, p.label]));
  return messages
    .filter(m => m.kind === 'call' || m.kind === 'create')
    .map(m => ({
      id: `${m.diagram}:${m.line}`,
      from: label.get(`${m.diagram}|${m.from}`) ?? m.from,
      to: label.get(`${m.diagram}|${m.to}`) ?? m.to,
      kind: m.kind,
      message: m.message,
    }));
}

// Name of the documented method (lower case), '<init>' for a creation, null if the relation names none.
function methodName(r) {
  if (r.kind === 'create') return '<init>';
  const name = (r.message || '').split('(')[0].trim().toLowerCase();
  return name || null;
}

// Status per relation: convergence, absence, unmapped (an end without types) or same-type (ends share a type).
function classify(relations, mapping, level, observed) {
  return relations.map(r => {
    const from = typesFor(mapping.get(r.from), level);
    const to = typesFor(mapping.get(r.to), level);
    let status, names = new Set();
    if (!from.types.length || !to.types.length) status = 'unmapped';
    else {
      const pairs = from.types.flatMap(a => to.types.filter(b => a !== b).map(b => `${a} -> ${b}`));
      const hits = pairs.filter(p => observed.has(p));
      if (hits.length) {
        status = 'convergence';
        names = new Set(hits.flatMap(p => [...observed.get(p)].map(n => n.toLowerCase())));
      } else status = pairs.length < from.types.length * to.types.length ? 'same-type' : 'absence';
    }
    const name = methodName(r);
    return {
      ...r,
      status,
      fallback: from.fallback || to.fallback,
      methodSeen: status === 'convergence' && name !== null ? names.has(name) : null,
    };
  });
}

// Observed relations between mapped participants that no documented relation covers in that direction.
// Participants with the same types (e.g. Service and Service(s)) form one component, named by their labels.
function divergences(mapping, level, observed, documented) {
  const components = new Map();
  for (const label of mapping.keys()) {
    const { types } = typesFor(mapping.get(label), level);
    if (!types.length) continue;
    const key = [...types].sort().join(' | ');
    if (!components.has(key)) components.set(key, { types: new Set(types), labels: [] });
    components.get(key).labels.push(label);
  }
  const name = c => c.labels.sort().join(' | ');
  const ofLabel = new Map([...components.values()].flatMap(c => c.labels.map(l => [l, c])));
  const documentedPairs = new Set(documented
    .filter(r => ofLabel.has(r.from) && ofLabel.has(r.to))
    .map(r => `${name(ofLabel.get(r.from))} => ${name(ofLabel.get(r.to))}`));

  const found = new Map();
  for (const pair of observed.keys()) {
    const [a, b] = pair.split(' -> ');
    for (const cf of components.values()) {
      if (!cf.types.has(a)) continue;
      for (const ct of components.values()) {
        if (ct === cf || !ct.types.has(b)) continue;
        const key = `${name(cf)} => ${name(ct)}`;
        if (documentedPairs.has(key)) continue;
        if (!found.has(key)) found.set(key, { from: name(cf), to: name(ct), pairs: [] });
        found.get(key).pairs.push(pair);
      }
    }
  }
  return [...found.values()].sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}

// Counts and recall. recall counts unmapped relations as not recovered (decision D4); same-type ones are
// reported separately, since no type-level check can separate their ends.
function summarize(classified) {
  const n = s => classified.filter(r => r.status === s).length;
  const C = n('convergence'), A = n('absence'), unmapped = n('unmapped'), sameType = n('same-type');
  return {
    C, A, unmapped, sameType,
    recall: C + A + unmapped ? C / (C + A + unmapped) : null,
    recall_mapped: C + A ? C / (C + A) : null,
  };
}

module.exports = { typesFor, documentedMessages, classify, divergences, summarize };
