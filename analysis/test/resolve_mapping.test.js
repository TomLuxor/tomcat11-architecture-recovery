// Tests for filling the open mapping rows with the settled decisions. Run: node --test analysis/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOpenRows } = require('../resolve_mapping');

const mapping = [
  { participant: 'Engine', interface_level: 'c.Engine', implementation_level: 'c.StandardEngine', decision: 'exact', note: '' },
  { participant: 'Host', interface_level: '', implementation_level: '', decision: 'open', note: '' },
  { participant: 'Request', interface_level: '', implementation_level: '', decision: 'open', note: '' },
  { participant: 'Filter A', interface_level: '', implementation_level: '', decision: 'open', note: '' },
];
const draft = [
  { participant: 'Host', interface_level: 'c.Host', implementation_level: 'c.StandardHost' },
  { participant: 'Request', interface_level: '', implementation_level: '' },
  { participant: 'Filter A', interface_level: '', implementation_level: '' },
];
const decisions = [
  { participant: 'Host', type: 'c.Host', reason: 'has getPipeline()' },
  { participant: 'Request', type: 'c.connector.Request', reason: 'has getHost()' },
  { participant: 'Filter A', type: 'none', reason: 'application code' },
];

test('a chosen interface keeps the standard implementation of the draft', () => {
  const host = resolveOpenRows(mapping, draft, decisions).find(r => r.participant === 'Host');
  assert.deepEqual([host.interface_level, host.implementation_level, host.decision, host.note],
    ['c.Host', 'c.StandardHost', 'resolved', 'has getPipeline()']);
});

test('a chosen class is used at both levels, and none leaves the row unmappable', () => {
  const rows = resolveOpenRows(mapping, draft, decisions);
  const request = rows.find(r => r.participant === 'Request');
  const filter = rows.find(r => r.participant === 'Filter A');
  assert.deepEqual([request.interface_level, request.implementation_level], ['c.connector.Request', 'c.connector.Request']);
  assert.deepEqual([filter.interface_level, filter.implementation_level, filter.decision], ['', '', 'unmappable']);
});

test('rows that are not open stay unchanged', () => {
  assert.deepEqual(resolveOpenRows(mapping, draft, decisions)[0], mapping[0]);
});

test('an open row without a decision is an error', () => {
  assert.throws(() => resolveOpenRows(mapping, draft, decisions.slice(1)), /Host/);
});
