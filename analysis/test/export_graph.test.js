// Tests for the input graph of Technique B. Run: node --test analysis/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeNested } = require('../lib/graph');

test('nested and anonymous types are merged into their top-level type', () => {
  const { nodes } = mergeNested(['p.A', 'p.A$Inner', 'p.A$1', 'q.r.B'], []);
  assert.deepEqual(nodes, [{ id: 'p.A', package: 'p' }, { id: 'q.r.B', package: 'q.r' }]);
});

test('edges are lifted to top-level types, deduplicated, and self-loops are dropped', () => {
  const deps = [['p.A$Inner', 'q.r.B'], ['p.A', 'q.r.B'], ['p.A$1', 'p.A'], ['q.r.B', 'p.A$Inner']];
  const { edges } = mergeNested(['p.A', 'p.A$Inner', 'p.A$1', 'q.r.B'], deps);
  assert.deepEqual(edges, [{ source: 'p.A', target: 'q.r.B' }, { source: 'q.r.B', target: 'p.A' }]);
});

test('edges to types outside the node set are ignored', () => {
  const { edges } = mergeNested(['p.A'], [['p.A', 'java.lang.String']]);
  assert.deepEqual(edges, []);
});

const { documentedRelations } = require('../lib/graph');

test('documented relations get the top-level types of both ends at both levels', () => {
  const mapping = new Map([
    ['P', { participant: 'P', interface_level: 'p.Poller', implementation_level: 'p.End$Poller' }],
    ['Q', { participant: 'Q', interface_level: 'q.Q', implementation_level: '' }],
    ['F', { participant: 'F', interface_level: '', implementation_level: '' }],
  ]);
  const [pq, pf] = documentedRelations([
    { view: 'messages', id: 'd:1', from: 'P', to: 'Q' },
    { view: 'messages', id: 'd:2', from: 'P', to: 'F' },
  ], mapping);
  assert.deepEqual([pq.interface_from, pq.implementation_from, pq.implementation_to], ['p.Poller', 'p.End', 'q.Q']);
  assert.deepEqual([pf.interface_to, pf.implementation_to], ['', '']);
});
