// Tests for the rule-based description of divergences (Task 5). Run: node --test analysis/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { kindOf, layerOf, direction } = require('../lib/divergence_kinds');

test('inheritance comes first, then creation, request model, accessor and other', () => {
  assert.equal(kindOf({ from: 'Context', to: 'Container', methods: ['addChild'], inherits: true }), 'inheritance');
  assert.equal(kindOf({ from: 'Host', to: 'StandardHostValve', methods: ['<init>'], inherits: false }), 'creation');
  assert.equal(kindOf({ from: 'Request', to: 'CoyoteRequest', methods: ['getMethod', 'action'], inherits: false }), 'request-model');
  assert.equal(kindOf({ from: 'HostConfig', to: 'Host', methods: ['isUnpackWARs', 'getContextClass'], inherits: false }), 'accessor');
  assert.equal(kindOf({ from: 'ContextConfig', to: 'Digester', methods: ['parse', 'getParser'], inherits: false }), 'other');
});

test('accessor needs every method to be a getter or setter, ignoring constructors', () => {
  assert.equal(kindOf({ from: 'A', to: 'B', methods: ['<init>', 'getX'], inherits: false }), 'accessor');
  assert.equal(kindOf({ from: 'A', to: 'B', methods: ['getX', 'start'], inherits: false }), 'other');
  assert.equal(kindOf({ from: 'A', to: 'B', methods: [], inherits: false }), 'other');
});

test('a component of several labels counts as request model if one of its labels is', () => {
  assert.equal(kindOf({ from: 'Connector | Connector(s)', to: 'Request', methods: ['getX', 'start'], inherits: false }), 'other');
  assert.equal(kindOf({ from: 'Request', to: 'Response | X', methods: ['start'], inherits: false }), 'request-model');
});

test('layers follow the package prefixes, and calls upwards run against the layer order', () => {
  assert.equal(layerOf('org.apache.tomcat.util.net.NioEndpoint$Poller'), 1);
  assert.equal(layerOf('org.apache.coyote.http11.Http11Processor'), 2);
  assert.equal(layerOf('org.apache.catalina.core.StandardHost'), 3);
  assert.equal(layerOf('org.apache.tomcat.util.http.MimeHeaders'), null);
  assert.equal(direction(['org.apache.coyote.Request -> org.apache.tomcat.util.net.NioEndpoint']), 'down');
  assert.equal(direction(['org.apache.coyote.X -> org.apache.coyote.Y']), 'same');
  assert.equal(direction(['org.apache.coyote.X -> org.apache.catalina.Y', 'org.apache.coyote.X -> org.apache.coyote.Z']), 'up');
  assert.equal(direction(['org.apache.tomcat.util.http.A -> org.apache.coyote.B']), 'n/a');
});
