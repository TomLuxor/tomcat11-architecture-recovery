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

// Cohen's kappa for one nominal field: (observed agreement - chance agreement) / (1 - chance agreement), where the
// chance agreement follows from how often each review uses each category (Cohen 1960).
function cohensKappa(a, b, key, field) {
  const byKey = new Map(b.map(r => [r[key], r]));
  const pairs = a.map(ra => [normalize(ra[field]), normalize(byKey.get(ra[key])[field])]);
  const n = pairs.length;
  const observed = pairs.filter(([x, y]) => x === y).length / n;
  const countA = new Map(), countB = new Map();
  for (const [x, y] of pairs) { countA.set(x, (countA.get(x) || 0) + 1); countB.set(y, (countB.get(y) || 0) + 1); }
  let chance = 0;
  for (const [category, k] of countA) chance += (k / n) * ((countB.get(category) || 0) / n);
  return { observed, chance, kappa: chance === 1 ? 1 : (observed - chance) / (1 - chance) };
}

if (require.main === module) {
  const [fileA, fileB, key, fields] = process.argv.slice(2);
  const read = f => parseCsv(fs.readFileSync(f, 'utf8'));
  const [a, b] = [read(fileA), read(fileB)];
  const r = compareReviews(a, b, key, fields.split(','));
  console.log(`Agreement: ${r.agreed} of ${r.total} rows (${(100 * r.share).toFixed(1)} %)`);
  if (!fields.includes(',')) console.log(`Cohen's kappa: ${cohensKappa(a, b, key, fields).kappa.toFixed(3)}`);
  for (const d of r.disagreements) console.log(`  ${d.key} [${d.field}]: "${d.a}" vs "${d.b}"`);
}

module.exports = { compareReviews, cohensKappa };
