// Tests for the component check of RQ2. Run: node --test analysis/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { componentIds, groupByCluster } = require('../lib/components');

test('componentIds collects both ends of the containment relations at one level', () => {
  const relations = [
    { view: 'containment', interface_from: 'x.Server', interface_to: 'x.Service',
      implementation_from: 'x.StandardServer', implementation_to: 'x.StandardService' },
    { view: 'containment', interface_from: 'x.Service', interface_to: 'x.Engine | x.Engine2',
      implementation_from: 'x.StandardService', implementation_to: '' },
    { view: 'messages', interface_from: 'x.A', interface_to: 'x.B', implementation_from: 'x.A', implementation_to: 'x.B' },
  ];
  assert.deepEqual(componentIds(relations, 'interface'), ['x.Server', 'x.Service', 'x.Engine', 'x.Engine2']);
  assert.deepEqual(componentIds(relations, 'implementation'), ['x.StandardServer', 'x.StandardService']);
});

test('groupByCluster groups the ids by cluster and leaves out ids without a cluster', () => {
  const clusterOf = new Map([['a', '1'], ['b', '2'], ['c', '1']]);
  assert.deepEqual(groupByCluster(['a', 'b', 'c', 'd'], clusterOf), [['a', 'c'], ['b']]);
});
