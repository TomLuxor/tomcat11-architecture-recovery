// Tests for the CSV helpers and the comparison of two independent reviews. Run: node --test analysis/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, serializeCsv } = require('../lib/csv');
const { compareReviews } = require('../compare_reviews');

test('parseCsv keeps commas inside quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y",z\n'), [{ a: 'x, y', b: 'z' }]);
});

test('parseCsv unescapes doubled quotes and tolerates CRLF', () => {
  assert.deepEqual(parseCsv('a\r\n"say ""hi"""\r\n'), [{ a: 'say "hi"' }]);
});

test('serializeCsv quotes values with commas or quotes and round-trips', () => {
  const rows = [{ a: 'x, y', b: 'say "hi"' }, { a: 'plain', b: '' }];
  const text = serializeCsv(rows, ['a', 'b']);
  assert.equal(text.split('\n')[1], '"x, y","say ""hi"""');
  assert.deepEqual(parseCsv(text), rows);
});

const header = 'participant,interface_level,implementation_level,reason\n';

test('compareReviews counts agreement per row over the given fields', () => {
  const a = parseCsv(header + 'A,p.A,p.AImpl,r\nB,p.B,p.BImpl,r\nC,,p.C,r\n');
  const b = parseCsv(header + 'A,p.A,p.AImpl,other reason\nB,p.B,p.Other,r\nC,,p.C,r\n');
  const result = compareReviews(a, b, 'participant', ['interface_level', 'implementation_level']);
  assert.equal(result.total, 3);
  assert.equal(result.agreed, 2);
  assert.equal(result.share, 2 / 3);
  assert.deepEqual(result.disagreements, [{ key: 'B', field: 'implementation_level', a: 'p.BImpl', b: 'p.Other' }]);
});

test('compareReviews ignores whitespace and the order of types separated by |', () => {
  const a = parseCsv(header + 'A, p.A | p.B ,x,r\n');
  const b = parseCsv(header + 'A,p.B |p.A,x,r\n');
  assert.equal(compareReviews(a, b, 'participant', ['interface_level']).agreed, 1);
});

test('compareReviews throws when a key is missing in one review', () => {
  const a = parseCsv(header + 'A,p.A,x,r\nB,p.B,x,r\n');
  const b = parseCsv(header + 'A,p.A,x,r\n');
  assert.throws(() => compareReviews(a, b, 'participant', ['interface_level']), /B/);
});
