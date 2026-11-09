// Input graph of Technique B (Section 4.6): nested and anonymous types merged into their top-level type.

const topLevel = fqn => fqn.split('$')[0];
const packageOf = fqn => fqn.slice(0, fqn.lastIndexOf('.'));

// types: fully qualified names of the in-scope types; dependencies: [from, to] pairs between types.
// Returns the top-level types as nodes and the distinct dependencies between different top-level types as edges.
function mergeNested(types, dependencies) {
  const ids = [...new Set(types.map(topLevel))].sort();
  const known = new Set(ids);
  const edges = new Map();
  for (const [from, to] of dependencies) {
    const source = topLevel(from), target = topLevel(to);
    if (source !== target && known.has(source) && known.has(target)) edges.set(`${source} ${target}`, { source, target });
  }
  return {
    nodes: ids.map(id => ({ id, package: packageOf(id) })),
    edges: [...edges.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target)),
  };
}

// Documented relations with the top-level types of both ends at both mapping levels (' | ' between several
// types, empty if unmapped), so that Technique B locates them in the clusters exactly as Technique A maps them.
function documentedRelations(relations, mapping) {
  const { typesFor } = require('./reflexion');
  const ends = (label, level) => [...new Set(typesFor(mapping.get(label), level).types.map(topLevel))].join(' | ');
  return relations.map(r => ({
    ...r,
    interface_from: ends(r.from, 'interface'), interface_to: ends(r.to, 'interface'),
    implementation_from: ends(r.from, 'implementation'), implementation_to: ends(r.to, 'implementation'),
  }));
}

module.exports = { mergeNested, documentedRelations };
