// RQ3 (step 8): which of the messages absent at both mapping levels a static analysis that follows the type
// hierarchy could recover (paper, Section 4.7).
// Usage: node analysis/rq3_static.js   (needs the jQAssistant server, like rq3_sheet.js)
// For every message absent at both levels: the calls of the documented method (queries/absence_facts.cypher), the
// possible receiver classes of every called type (queries/possible_receivers.cypher), and the resolution by the rules
// of lib/rq3.js (resolveStatically). The mechanism is taken from the final classification, review/rq3_rules.csv
// (see review/rq3_agreement.md).
// Writes output/rq3_static.csv (one row per message) and output/rq3_static_summary.csv (mechanism x resolution).
const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');
const { parseCsv, serializeCsv } = require('./lib/csv');
const { typesFor } = require('./lib/reflexion');
const { selectAbsences, RESOLUTIONS, resolveStatically, summarizeResolutions } = require('./lib/rq3');

const here = __dirname;
const read = f => parseCsv(fs.readFileSync(path.join(here, f), 'utf8'));
const short = fqn => fqn.replace(/^org\.apache\./, '');

async function main() {
  const { toClassify } = selectAbsences(read('output/reflexion_messages.csv'));
  const mapping = new Map(read('output/mapping.csv').map(r => [r.participant, r]));
  const both = label => [...new Set(['interface', 'implementation'].flatMap(l => typesFor(mapping.get(label), l).types))];
  const mechanism = new Map(read('review/rq3_rules.csv').map(r => [r.id, r.category]));
  const factsQuery = fs.readFileSync(path.join(here, 'queries', 'absence_facts.cypher'), 'utf8');
  const receiversQuery = fs.readFileSync(path.join(here, 'queries', 'possible_receivers.cypher'), 'utf8');

  const driver = neo4j.driver(process.env.NEO4J_URI || 'bolt://localhost:7687', neo4j.auth.basic('neo4j', 'neo4j'));
  const session = driver.session();
  const receivers = new Map();
  const rows = [];
  try {
    for (const m of toClassify) {
      const name = m.kind === 'create' ? '<init>' : m.message.split('(')[0].trim();
      const facts = (await session.run(factsQuery, { from: both(m.from), to: both(m.to), name: name.toLowerCase() }))
        .records[0].toObject();
      const called = [...new Set(facts.calls.filter(c => c.toTarget).map(c => c.declaredBy))];
      for (const type of called) {
        if (!receivers.has(type)) receivers.set(type, (await session.run(receiversQuery, { type })).records[0].get('receivers'));
      }
      const result = resolveStatically(facts, name, type => receivers.get(type) || []);
      rows.push({ id: m.id, from: m.from, to: m.to, message: m.message, mechanism: mechanism.get(m.id) || '',
        resolution: result.resolution, receivers: result.receivers,
        // Every called type with its number of possible receivers; for a single receiver also its name.
        called_types: called.map(type => {
          const list = receivers.get(type) || [];
          return `${short(type)} (${list.length === 1 ? short(list[0]) : list.length})`;
        }).join(' | ') });
    }
  } finally {
    await session.close();
    await driver.close();
  }
  fs.writeFileSync(path.join(here, 'output', 'rq3_static.csv'), serializeCsv(rows,
    ['id', 'from', 'to', 'message', 'mechanism', 'resolution', 'receivers', 'called_types']));
  const summary = summarizeResolutions(rows);
  fs.writeFileSync(path.join(here, 'output', 'rq3_static_summary.csv'), serializeCsv(summary,
    ['mechanism', 'messages', ...RESOLUTIONS]));
  console.table(summary);
}

main().catch(e => { console.error(e.message); process.exit(1); });
