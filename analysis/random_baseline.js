// RQ2 (step 9): chance level of the layer and component measures. For every clustering run, random partitions with
// the same cluster sizes (the cluster labels permuted over the nodes, seeded) are scored like the clustering itself.
// Usage: node analysis/random_baseline.js [permutations per run, default 1000]
// Inputs:  output/graph_nodes.csv, graph_edges.csv, clustering_assignments.csv, documented_relations.csv; for the
//          self-check also clustering_layers.csv (technique_b/score_clusterings.py) and clustering_components.csv
// Output:  output/clustering_random_baseline.csv, one row per configuration and measure: the observed mean over the
//          runs, and mean and 2.5/97.5 percentiles of the random partitions (pooled over the runs).
//          against_edges_layered counts the dependencies against the layer order that connect two layered types; the
//          other against_edges end at a type outside the three layers. The script prints the most frequent of these
//          types per configuration (mean number of such dependencies per run).
const fs = require('fs');
const path = require('path');
const { parseCsv, serializeCsv } = require('./lib/csv');
const { componentIds } = require('./lib/components');
const { layerOfPackage, seededRandom, shuffleLabels, layerMeasures, clusterSpread } = require('./lib/random_baseline');

const permutations = Number(process.argv[2] || 1000);
const out = path.join(__dirname, 'output');
const read = f => parseCsv(fs.readFileSync(path.join(out, f), 'utf8'));

const nodes = read('graph_nodes.csv');
const layerOf = new Map(nodes.map(n => [n.id, layerOfPackage(n.package)]));
const edges = read('graph_edges.csv').map(e => [e.source, e.target]);
const relations = read('documented_relations.csv');
const components = { interface: componentIds(relations, 'interface'), implementation: componentIds(relations, 'implementation') };

const runs = new Map();
for (const r of read('clustering_assignments.csv')) {
  const key = [r.algorithm, r.config, r.run].join(',');
  if (!runs.has(key)) runs.set(key, new Map());
  runs.get(key).set(r.id, r.cluster);
}
runs.set('packages,packages,0', new Map(nodes.map(n => [n.id, n.package])));

// FNV-1a hash of the run key as its seed
const seedOf = key => [...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

function score(clusterOf, onAgainst) {
  const layers = layerMeasures(clusterOf, layerOf, edges, onAgainst);
  return { own_layer_share: layers.ownLayerShare, against_edges: layers.againstEdges,
    against_edges_layered: layers.againstLayered,
    components_interface: clusterSpread(components.interface, clusterOf),
    components_implementation: clusterSpread(components.implementation, clusterOf) };
}

// self-check: the observed values must equal those of score_clusterings.py and component_clusters.js
const pythonLayers = new Map(read('clustering_layers.csv').map(r => [[r.algorithm, r.config, r.run].join(','), r]));
const componentRows = new Map(read('clustering_components.csv').map(r => [[r.algorithm, r.config, r.run, r.level].join(','), r]));

const byConfiguration = new Map();
for (const [key, clusterOf] of runs) {
  const [algorithm, config] = key.split(',');
  const configKey = `${algorithm},${config}`;
  if (!byConfiguration.has(configKey)) byConfiguration.set(configKey, { observed: [], random: [], outside: new Map() });
  const entry = byConfiguration.get(configKey);
  // dependencies against the layer order per type outside the layers at their target end
  const observed = score(clusterOf, (source, target) => {
    if (layerOf.get(target) === null) entry.outside.set(target, (entry.outside.get(target) || 0) + 1);
  });
  const py = pythonLayers.get(key);
  if (py && (Math.abs(Number(py.own_layer_share) - observed.own_layer_share) > 1e-5 || Number(py.against_edges) !== observed.against_edges)) {
    throw new Error(`${key}: layer measures differ from clustering_layers.csv`);
  }
  for (const level of ['interface', 'implementation']) {
    const row = componentRows.get(`${key},${level}`);
    if (row && Number(row.clusters) !== observed[`components_${level}`]) throw new Error(`${key}: components differ (${level})`);
  }
  entry.observed.push(observed);
  const random = seededRandom(seedOf(key));
  for (let i = 0; i < permutations; i++) entry.random.push(score(shuffleLabels(clusterOf, random)));
}

const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const rows = [];
for (const [configKey, entry] of byConfiguration) {
  const [algorithm, config] = configKey.split(',');
  for (const measure of ['own_layer_share', 'against_edges', 'against_edges_layered', 'components_interface', 'components_implementation']) {
    const random = entry.random.map(r => r[measure]).sort((a, b) => a - b);
    rows.push({ algorithm, config, runs: entry.observed.length, permutations: random.length, measure,
      observed_mean: mean(entry.observed.map(r => r[measure])).toFixed(4),
      random_mean: mean(random).toFixed(4),
      random_p025: percentile(random, 0.025).toFixed(4), random_p975: percentile(random, 0.975).toFixed(4) });
  }
}
fs.writeFileSync(path.join(out, 'clustering_random_baseline.csv'), serializeCsv(rows,
  ['algorithm', 'config', 'runs', 'permutations', 'measure', 'observed_mean', 'random_mean', 'random_p025', 'random_p975']));
console.table(rows.map(r => ({ configuration: `${r.algorithm} ${r.config}`, measure: r.measure,
  observed: r.observed_mean, random: `${r.random_mean} [${r.random_p025}, ${r.random_p975}]` })));

console.log('Dependencies against the layer order that end at a type outside the layers (mean per run):');
for (const [configKey, entry] of byConfiguration) {
  const runCount = entry.observed.length;
  const total = [...entry.outside.values()].reduce((a, b) => a + b, 0);
  const top = [...entry.outside].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([type, n]) => `${type} ${(n / runCount).toFixed(1)}`).join(', ');
  console.log(`  ${configKey.replace(',', ' ')}: ${(total / runCount).toFixed(1)}${top ? `, most frequent: ${top}` : ''}`);
}
