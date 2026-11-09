// RQ1 check: a mapping that assigns each participant both its interface-level and its implementation-level types.
// Usage: node analysis/combine_mapping.js [mapping.csv] > analysis/output/mapping_combined.csv
// Then (needs the jQAssistant server): node analysis/reflexion.js analysis/output/mapping_combined.csv analysis/output/combined
// Both columns of the result hold the same union of types, so both "levels" of that run give the combined result.
const fs = require('fs');
const path = require('path');
const { parseCsv, serializeCsv } = require('./lib/csv');

const file = process.argv[2] || path.join(__dirname, 'output', 'mapping.csv');
const rows = parseCsv(fs.readFileSync(file, 'utf8'));
const split = v => (v || '').split('|').map(s => s.trim()).filter(Boolean);
const combined = rows.map(r => {
  const types = [...new Set([...split(r.interface_level), ...split(r.implementation_level)])].join(' | ');
  return { ...r, interface_level: types, implementation_level: types };
});
process.stdout.write(serializeCsv(combined, Object.keys(rows[0])));
