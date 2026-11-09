// RQ2 (step 9): over how many clusters each clustering distributes the six components of the structural view
// (Server, Service, Connector, Engine, Host, Context), at both mapping levels (paper, Section 4.6).
// Usage: node analysis/component_clusters.js
// Inputs:  output/documented_relations.csv (ends of the containment relations per level),
//          output/clustering_assignments.csv (ACDC and Leiden), output/graph_nodes.csv (package baseline)
// Output:  output/clustering_components.csv (one row per configuration, run and level); prints mean and range.
const fs = require('fs');
const path = require('path');
const { parseCsv, serializeCsv } = require('./lib/csv');
const { componentIds, groupByCluster } = require('./lib/components');

const out = path.join(__dirname, 'output');
const read = f => parseCsv(fs.readFileSync(path.join(out, f), 'utf8'));
const short = id => id.split('.').pop();

const relations = read('documented_relations.csv');
const clusterings = new Map();
for (const r of read('clustering_assignments.csv')) {
  const key = [r.algorithm, r.config, r.run].join(',');
  if (!clusterings.has(key)) clusterings.set(key, new Map());
  clusterings.get(key).set(r.id, r.cluster);
}
clusterings.set('packages,packages,0', new Map(read('graph_nodes.csv').map(n => [n.id, n.package])));

const rows = [];
for (const [key, clusterOf] of clusterings) {
  const [algorithm, config, run] = key.split(',');
  for (const level of ['interface', 'implementation']) {
    const ids = componentIds(relations, level);
    const groups = groupByCluster(ids, clusterOf);
    rows.push({ algorithm, config, run, level, components: ids.length, clusters: groups.length,
      groups: groups.map(g => g.map(short).join(' ')).join(' | ') });
  }
}
fs.writeFileSync(path.join(out, 'clustering_components.csv'),
  serializeCsv(rows, ['algorithm', 'config', 'run', 'level', 'components', 'clusters', 'groups']));

const byConfiguration = new Map();
for (const r of rows) {
  const key = `${r.algorithm} ${r.config} ${r.level}`;
  if (!byConfiguration.has(key)) byConfiguration.set(key, []);
  byConfiguration.get(key).push(r.clusters);
}
console.table([...byConfiguration].map(([configuration, v]) => ({ configuration, runs: v.length,
  mean: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) })));
