// Technique A (step 6): describes the divergences of the behavioral view by kind and layer direction.
// Usage: node analysis/divergence_kinds.js   (needs the jQAssistant server, like reflexion.js)
// Reads output/divergences.csv, writes output/divergence_kinds.csv and prints the counts per level and kind.
const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');
const { parseCsv, serializeCsv } = require('./lib/csv');
const { kindOf, direction } = require('./lib/divergence_kinds');

const out = path.join(__dirname, 'output');

async function main() {
  const divergences = parseCsv(fs.readFileSync(path.join(out, 'divergences.csv'), 'utf8'));
  const pairsOf = d => d.pairs.split('; ');
  const driver = neo4j.driver(process.env.NEO4J_URI || 'bolt://localhost:7687', neo4j.auth.basic('neo4j', 'neo4j'));
  const session = driver.session();
  let details;
  try {
    const query = fs.readFileSync(path.join(__dirname, 'queries', 'divergence_details.cypher'), 'utf8');
    const pairs = [...new Set(divergences.flatMap(pairsOf))].map(p => p.split(' -> '));
    details = new Map((await session.run(query, { pairs })).records.map(r => [r.get('pair'), r.toObject()]));
  } finally {
    await session.close();
    await driver.close();
  }
  const rows = divergences.map(d => {
    const info = pairsOf(d).map(p => details.get(p));
    const methods = [...new Set(info.flatMap(i => i.methods))].sort();
    return {
      level: d.level, from: d.from, to: d.to,
      kind: kindOf({ from: d.from, to: d.to, methods, inherits: info.some(i => i.inherits) }),
      direction: direction(pairsOf(d)),
      methods: methods.join(' '),
    };
  });
  fs.writeFileSync(path.join(out, 'divergence_kinds.csv'),
    serializeCsv(rows, ['level', 'from', 'to', 'kind', 'direction', 'methods']));
  const count = key => rows.reduce((t, r) => (t[`${r.level} ${r[key]}`] = (t[`${r.level} ${r[key]}`] || 0) + 1, t), {});
  console.table(count('kind'));
  console.table(count('direction'));
}

main().catch(e => { console.error(e.message); process.exit(1); });
