// Tests for selecting and describing the absent messages of RQ3. Run: node --test analysis/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectAbsences, similarNames, describeFacts, classifyByRules, resolveStatically, summarizeResolutions } =
  require('../lib/rq3');

test('only messages absent at both levels are classified; the rest is counted by group', () => {
  const rows = [
    { id: 'a', interface_status: 'absence', implementation_status: 'absence' },
    { id: 'b', interface_status: 'convergence', implementation_status: 'absence' },
    { id: 'c', interface_status: 'absence', implementation_status: 'convergence' },
    { id: 'd', interface_status: 'unmapped', implementation_status: 'unmapped' },
    { id: 'e', interface_status: 'convergence', implementation_status: 'convergence' },
  ];
  const { toClassify, counts } = selectAbsences(rows);
  assert.deepEqual(toClassify.map(r => r.id), ['a']);
  assert.deepEqual(counts, { absentAtBothLevels: 1, foundAtInterfaceLevelOnly: 1, foundAtImplementationLevelOnly: 1,
    unmapped: 1, foundAtBothLevels: 1 });
});

test('similarNames finds names at most two edits away, ignoring case', () => {
  assert.deepEqual(similarNames('findSecurityContraints', ['findSecurityConstraints', 'findRole', 'start']),
    ['findSecurityConstraints']);
  assert.deepEqual(similarNames('start', ['START', 'stop']), ['START']);
  assert.deepEqual(similarNames('', ['a']), []);
});

test('describeFacts states what the source calls instead and who calls the target', () => {
  const text = describeFacts({
    calls: [{ caller: 'org.apache.catalina.connector.CoyoteAdapter', by: 'self', declaredBy: 'org.apache.catalina.Valve', toTarget: true }],
    callers: [], declaredBy: ['org.apache.catalina.Valve'], methods: ['invoke'], reflective: [],
  }, 'invoke');
  assert.match(text, /catalina\.connector\.CoyoteAdapter calls invoke\(\) on catalina\.Valve, a supertype of the target/);
  assert.match(text, /No type calls invoke\(\) on the target type directly/);
});

test('describeFacts flags a call to the target at the other mapping level and keeps the diagram spelling', () => {
  const text = describeFacts({
    calls: [{ caller: 'org.apache.catalina.core.StandardService', by: 'self', declaredBy: 'org.apache.catalina.Engine', toTarget: true }],
    callers: [], declaredBy: ['org.apache.catalina.Lifecycle'], methods: ['init'], reflective: [],
  }, 'lifecycleEvent', ['org.apache.catalina.Engine', 'org.apache.catalina.core.StandardEngine']);
  assert.match(text, /lifecycleEvent\(\) on catalina\.Engine, a mapped type of the target, but at the other mapping level/);
});

const call = (by, declaredBy, toTarget = true) => ({ caller: 'x.Source', by, declaredBy, toTarget });
const facts = (over = {}) => ({ calls: [], callers: [], declaredBy: ['x.Target'], methods: [], reflective: [], ...over });

test('classifyByRules applies the categories in the order of the codebook', () => {
  assert.equal(classifyByRules(facts({ reflective: ['java.lang.Class.forName'] }), '<init>'), 'reflection');
  assert.equal(classifyByRules(facts({ calls: [call('supertype', 'org.apache.catalina.LifecycleListener')] }), 'lifecycleEvent'),
    'listener-notification');
  assert.equal(classifyByRules(facts(), 'run'), 'thread-hand-off');
  assert.equal(classifyByRules(facts({ calls: [call('supertype', 'org.apache.catalina.Valve')] }), 'invoke'),
    'chain-of-responsibility');
  assert.equal(classifyByRules(facts({ calls: [call('supertype', 'x.Base')] }), 'start'), 'inherited-call');
  assert.equal(classifyByRules(facts({ calls: [call('supertype', 'x.Base'), call('self', 'x.Iface')] }), 'start'),
    'interface-dispatch');
});

test('reflection needs the source not to call the target, and a misspelled name is a diagram error', () => {
  assert.equal(classifyByRules(facts({ reflective: ['java.lang.Class.forName'], calls: [call('self', 'x.Iface')] }), 'start'),
    'interface-dispatch');
  assert.equal(classifyByRules(facts({ declaredBy: [], methods: ['findSecurityConstraints'] }), 'findSecurityContraints'),
    'other: misspelled in diagram');
  assert.equal(classifyByRules(facts(), 'foo'), 'other: no static call');
});

test('resolveStatically: a diagram error, no static call, or a creation of the target', () => {
  const none = () => [];
  assert.deepEqual(resolveStatically(facts({ declaredBy: [], methods: ['findSecurityConstraints'] }), 'findSecurityContraints', none),
    { resolution: 'diagram-error', receivers: 0 });
  assert.deepEqual(resolveStatically(facts({ reflective: ['java.lang.Class.forName'] }), 'start', none),
    { resolution: 'no-static-call', receivers: 0 });
  assert.deepEqual(resolveStatically(facts({ calls: [call('self', 'x.Iface', false)] }), 'execute', none),
    { resolution: 'no-static-call', receivers: 0 });
  assert.deepEqual(resolveStatically(facts({ calls: [call('supertype', 'x.Target')] }), '<init>', none),
    { resolution: 'unique', receivers: 1 });
});

test('resolveStatically counts the possible receivers and takes the most precise call', () => {
  const receivers = { 'x.Adapter': ['x.CoyoteAdapter'], 'x.Valve': ['x.A', 'x.B', 'x.C'], 'x.Outside': [] };
  const receiversOf = type => receivers[type] || [];
  assert.deepEqual(resolveStatically(facts({ calls: [call('self', 'x.Adapter')] }), 'service', receiversOf),
    { resolution: 'unique', receivers: 1 });
  assert.deepEqual(resolveStatically(facts({ calls: [call('self', 'x.Valve')] }), 'invoke', receiversOf),
    { resolution: 'ambiguous', receivers: 3 });
  assert.deepEqual(resolveStatically(facts({ calls: [call('self', 'x.Valve'), call('nested', 'x.Adapter')] }), 'service', receiversOf),
    { resolution: 'unique', receivers: 1 });
  assert.deepEqual(resolveStatically(facts({ calls: [call('self', 'x.Outside')] }), 'start', receiversOf),
    { resolution: 'no-static-call', receivers: 0 });
});

test('summarizeResolutions counts the resolutions per mechanism and in total', () => {
  const rows = [
    { mechanism: 'reflection', resolution: 'no-static-call' },
    { mechanism: 'chain-of-responsibility', resolution: 'ambiguous' },
    { mechanism: 'chain-of-responsibility', resolution: 'unique' },
  ];
  assert.deepEqual(summarizeResolutions(rows), [
    { mechanism: 'chain-of-responsibility', messages: 2, unique: 1, ambiguous: 1, 'no-static-call': 0, 'diagram-error': 0 },
    { mechanism: 'reflection', messages: 1, unique: 0, ambiguous: 0, 'no-static-call': 1, 'diagram-error': 0 },
    { mechanism: 'total', messages: 3, unique: 1, ambiguous: 1, 'no-static-call': 1, 'diagram-error': 0 },
  ]);
});
