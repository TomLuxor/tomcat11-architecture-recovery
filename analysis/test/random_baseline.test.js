// Tests for the chance level of the RQ2 measures (lib/random_baseline.js). Run: node --test analysis/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { layerOfPackage, seededRandom, shuffleLabels, layerMeasures, clusterSpread } = require('../lib/random_baseline');

const sizes = clusterOf => [...clusterOf.values()].reduce((m, c) => m.set(c, (m.get(c) || 0) + 1), new Map());

test('layerOfPackage assigns the three layers by package prefix and nothing else', () => {
  assert.equal(layerOfPackage('org.apache.tomcat.util.net'), 1);
  assert.equal(layerOfPackage('org.apache.tomcat.util.net.openssl'), 1);
  assert.equal(layerOfPackage('org.apache.coyote.http11'), 2);
  assert.equal(layerOfPackage('org.apache.catalina.core'), 3);
  assert.equal(layerOfPackage('org.apache.tomcat.util.buf'), null);
  assert.equal(layerOfPackage('org.apache.catalinax'), null);
});

test('shuffleLabels keeps the cluster sizes and is reproducible with the same seed', () => {
  const clusterOf = new Map([['a', 'X'], ['b', 'X'], ['c', 'X'], ['d', 'Y'], ['e', 'Z'], ['f', 'Z']]);
  const first = shuffleLabels(clusterOf, seededRandom(7));
  assert.deepEqual(sizes(first), sizes(clusterOf));
  assert.deepEqual([...first.keys()], [...clusterOf.keys()]);
  assert.deepEqual(first, shuffleLabels(clusterOf, seededRandom(7)));
});

test('layerMeasures counts own-layer types and dependencies against the layer order', () => {
  // cluster L1 is dominated by layer 1 (2 of 3), cluster L3 by layer 3; u is unlayered and ignored
  const layerOf = new Map([['n1', 1], ['n2', 1], ['c1', 3], ['c2', 3], ['c3', 3], ['u', null]]);
  const clusterOf = new Map([['n1', 'L1'], ['n2', 'L1'], ['c1', 'L1'], ['c2', 'L3'], ['c3', 'L3'], ['u', 'L3']]);
  const edges = [['n1', 'c2'], ['c2', 'n2'], ['n1', 'n2'], ['u', 'c1']];
  const m = layerMeasures(clusterOf, layerOf, edges);
  assert.equal(m.layeredTypes, 5);
  assert.equal(m.dominatedClusters, 2);
  assert.equal(m.ownLayerShare, 4 / 5); // c1 lies in the cluster of layer 1
  assert.equal(m.comparedEdges, 3); // n1->c2, c2->n2, u->c1 run between the two clusters; n1->n2 stays inside
  assert.equal(m.againstEdges, 1); // only n1->c2 runs from the lower to the higher layer
});

test('layerMeasures separates the dependencies against the layer order that end outside the layers', () => {
  // u belongs to no layer but lies in the cluster of layer 3, so n2->u counts against the layer order
  const layerOf = new Map([['n1', 1], ['n2', 1], ['c1', 3], ['c2', 3], ['u', null]]);
  const clusterOf = new Map([['n1', 'L1'], ['n2', 'L1'], ['c1', 'L3'], ['c2', 'L3'], ['u', 'L3']]);
  const seen = [];
  const m = layerMeasures(clusterOf, layerOf, [['n1', 'c1'], ['n2', 'u'], ['c2', 'n1']], (s, t) => seen.push(`${s}->${t}`));
  assert.equal(m.againstEdges, 2); // n1->c1 and n2->u run from the cluster of layer 1 to that of layer 3
  assert.equal(m.againstLayered, 1); // only n1->c1 connects two layered types
  assert.deepEqual(seen, ['n1->c1', 'n2->u']);
});

test('layerMeasures leaves a cluster without a majority layer undominated', () => {
  const layerOf = new Map([['a', 1], ['b', 3]]);
  const m = layerMeasures(new Map([['a', 'K'], ['b', 'K']]), layerOf, []);
  assert.equal(m.dominatedClusters, 0);
  assert.equal(m.ownLayerShare, 0);
});

test('clusterSpread counts distinct clusters and ignores nodes without a cluster', () => {
  const clusterOf = new Map([['a', 'X'], ['b', 'X'], ['c', 'Y']]);
  assert.equal(clusterSpread(['a', 'b', 'c', 'missing'], clusterOf), 2);
});
