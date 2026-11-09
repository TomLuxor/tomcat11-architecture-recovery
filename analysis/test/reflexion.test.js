// Tests for the reflexion logic of Technique A. Run: node --test analysis/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { typesFor, documentedMessages, classify, divergences, summarize } = require('../lib/reflexion');

// X -> p.X; Y -> p.Y / p.YImpl; Z has no implementation; U is not mapped; W shares the type of X.
const mapping = new Map([
  ['X', { participant: 'X', interface_level: 'p.X', implementation_level: 'p.X' }],
  ['Y', { participant: 'Y', interface_level: 'p.Y', implementation_level: 'p.YImpl' }],
  ['Z', { participant: 'Z', interface_level: 'p.Z', implementation_level: '' }],
  ['U', { participant: 'U', interface_level: '', implementation_level: '' }],
  ['W', { participant: 'W', interface_level: 'p.X', implementation_level: 'p.X' }],
  ['M', { participant: 'M', interface_level: 'p.A | p.B', implementation_level: 'p.A | p.B' }],
]);
const observed = pairs => new Map(pairs.map(([k, names = []]) => [k, new Set(names)]));
const rel = (id, from, to, message = '') => ({ id, from, to, message });

test('typesFor splits several types and falls back to the other level when one is empty', () => {
  assert.deepEqual(typesFor(mapping.get('M'), 'interface'), { types: ['p.A', 'p.B'], fallback: false });
  assert.deepEqual(typesFor(mapping.get('Z'), 'implementation'), { types: ['p.Z'], fallback: true });
  assert.deepEqual(typesFor(mapping.get('U'), 'interface'), { types: [], fallback: false });
  assert.deepEqual(typesFor(undefined, 'interface'), { types: [], fallback: false });
});

test('documentedMessages resolves aliases per diagram and keeps only calls and creations', () => {
  const participants = [
    { diagram: 'd1', alias: 'GNR', label: 'Global Naming Resources' },
    { diagram: 'd1', alias: 'Server', label: 'Server' },
  ];
  const messages = [
    { diagram: 'd1', line: '5', from: 'Server', to: 'GNR', kind: 'call', message: 'init()' },
    { diagram: 'd1', line: '6', from: 'Server', to: 'Server', kind: 'self', message: 'x()' },
    { diagram: 'd1', line: '7', from: 'GNR', to: 'Server', kind: 'return', message: '' },
  ];
  assert.deepEqual(documentedMessages(messages, participants),
    [{ id: 'd1:5', from: 'Server', to: 'Global Naming Resources', kind: 'call', message: 'init()' }]);
});

test('a relation converges only in its own direction', () => {
  const r = [rel('1', 'X', 'Y')];
  assert.equal(classify(r, mapping, 'interface', observed([['p.X -> p.Y']]))[0].status, 'convergence');
  assert.equal(classify(r, mapping, 'interface', observed([['p.Y -> p.X']]))[0].status, 'absence');
});

test('a participant with several types converges if any of its types has the relation', () => {
  const r = [rel('1', 'M', 'X')];
  assert.equal(classify(r, mapping, 'interface', observed([['p.B -> p.X']]))[0].status, 'convergence');
});

test('the implementation level uses the implementation types and flags a fallback', () => {
  const r = [rel('1', 'X', 'Y'), rel('2', 'X', 'Z')];
  const o = observed([['p.X -> p.Y'], ['p.X -> p.Z']]);
  const [xy, xz] = classify(r, mapping, 'implementation', o);
  assert.equal(xy.status, 'absence');
  assert.deepEqual([xz.status, xz.fallback], ['convergence', true]);
});

test('an unmapped end gives unmapped, and two ends with the same type give same-type', () => {
  const o = observed([['p.X -> p.X']]);
  assert.equal(classify([rel('1', 'X', 'U')], mapping, 'interface', o)[0].status, 'unmapped');
  assert.equal(classify([rel('1', 'X', 'W')], mapping, 'interface', o)[0].status, 'same-type');
});

test('methodSeen compares the message name case-insensitively and maps creations to <init>', () => {
  const o = observed([['p.X -> p.Y', ['onStartup', '<init>']]]);
  const [a, b, c, d] = classify([rel('1', 'X', 'Y', 'onStartUp'), rel('2', 'X', 'Y', 'stop()'),
    { ...rel('3', 'X', 'Y'), kind: 'create' }, rel('4', 'X', 'U', 'init()')], mapping, 'interface', o);
  assert.deepEqual([a.methodSeen, b.methodSeen, c.methodSeen, d.methodSeen], [true, false, true, null]);
});

test('divergences report undocumented relations between mapped participants, merged by type', () => {
  const documented = [rel('1', 'X', 'Y')];
  const o = observed([['p.X -> p.Y'], ['p.Y -> p.X'], ['p.X -> p.Z'], ['p.X -> p.Q']]);
  const d = divergences(mapping, 'interface', o, documented);
  assert.deepEqual(d.map(x => [x.from, x.to]), [['W | X', 'Z'], ['Y', 'W | X']]);
  assert.deepEqual(d[0].pairs, ['p.X -> p.Z']);
});

test('summarize computes recall over all relations and over the mapped ones', () => {
  const s = summarize(['convergence', 'convergence', 'convergence', 'absence', 'unmapped', 'same-type']
    .map(status => ({ status })));
  assert.deepEqual(s, { C: 3, A: 1, unmapped: 1, sameType: 1, recall: 0.6, recall_mapped: 0.75 });
  assert.equal(summarize([]).recall, null);
});
