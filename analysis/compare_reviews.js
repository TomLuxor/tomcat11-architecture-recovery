// Agreement of two independent reviews (mapping decisions, RQ3 classification).
// Usage: node analysis/compare_reviews.js <review-a.csv> <review-b.csv> <key-column> <field,field,...>
// A row agrees if all given fields are equal; whitespace and the order of types separated by ' | ' are ignored.
const fs = require('fs');
const { parseCsv } = require('./lib/csv');

const normalize = v => (v || '').split('|').map(s => s.trim()).filter(Boolean).sort().join(' | ');

function compareReviews(a, b, key, fields) {
  const byKey = new Map(b.map(r => [r[key], r]));
  const keysA = new Set(a.map(r => r[key]));
  const missing = [...a.map(r => r[key]).filter(k => !byKey.has(k)), ...b.map(r => r[key]).filter(k => !keysA.has(k))];
  if (missing.length) throw new Error(`Rows missing in one review: ${missing.join(', ')}`);

  const disagreements = [];
  let agreed = 0;
  for (const ra of a) {
    const rb = byKey.get(ra[key]);
    const diff = fields.filter(f => normalize(ra[f]) !== normalize(rb[f]));
    if (!diff.length) agreed++;
    for (const f of diff) disagreements.push({ key: ra[key], field: f, a: ra[f], b: rb[f] });
  }
  return { total: a.length, agreed, share: a.length ? agreed / a.length : null, disagreements };
}

if (require.main === module) {
  const [fileA, fileB, key, fields] = process.argv.slice(2);
  const read = f => parseCsv(fs.readFileSync(f, 'utf8'));
  const r = compareReviews(read(fileA), read(fileB), key, fields.split(','));
  console.log(`Agreement: ${r.agreed} of ${r.total} rows (${(100 * r.share).toFixed(1)} %)`);
  for (const d of r.disagreements) console.log(`  ${d.key} [${d.field}]: "${d.a}" vs "${d.b}"`);
}

module.exports = { compareReviews };
