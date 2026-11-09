// RQ2: how a clustering distributes the documented components (paper, Section 4.6). Pure functions.

// The node ids of the documented components at one mapping level, i.e., both ends of every containment relation.
function componentIds(relations, level) {
  const ids = relations.filter(r => r.view === 'containment')
    .flatMap(r => [r[`${level}_from`], r[`${level}_to`]])
    .flatMap(cell => (cell || '').split('|').map(s => s.trim()).filter(Boolean));
  return [...new Set(ids)];
}

// The ids grouped by the cluster they lie in, in the order of `ids`; ids without a cluster are left out.
function groupByCluster(ids, clusterOf) {
  const groups = new Map();
  for (const id of ids) {
    if (!clusterOf.has(id)) continue;
    const cluster = clusterOf.get(id);
    if (!groups.has(cluster)) groups.set(cluster, []);
    groups.get(cluster).push(id);
  }
  return [...groups.values()];
}

module.exports = { componentIds, groupByCluster };
