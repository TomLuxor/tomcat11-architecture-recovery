// Technique A (step 5): reflexion model of the documented architecture at interface and implementation level.
// Usage: node analysis/reflexion.js [mapping.csv] [output-dir]   (defaults: analysis/output/mapping.csv, analysis/output)
// Needs the jQAssistant server on bolt://localhost:7687 (or $NEO4J_URI); see README.md.
// Reads structural_model.csv, messages.csv and participants.csv from analysis/output and the queries in analysis/queries.
const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');
const { parseCsv, serializeCsv } = require('./lib/csv');
const { typesFor, documentedMessages, classify, divergences, summarize } = require('./lib/reflexion');

const here = __dirname;
const [mappingFile = path.join(here, 'output', 'mapping.csv'), outDir = path.join(here, 'output')] = process.argv.slice(2);
const read = f => parseCsv(fs.readFileSync(f, 'utf8'));
const query = name => fs.readFileSync(path.join(here, 'queries', `${name}.cypher`), 'utf8');
const LEVELS = ['interface', 'implementation'];

async function main() {
  const { inScope } = JSON.parse(fs.readFileSync(path.join(here, 'scope.json'), 'utf8'));
  const mappingRows = read(mappingFile);
  const open = mappingRows.filter(r => r.decision === 'open');
  if (open.length) console.warn(`Warning: ${open.length} mapping rows are still open and count as unmapped.`);
  const mapping = new Map(mappingRows.map(r => [r.participant, r]));
  const containment = read(path.join(here, 'output', 'structural_model.csv'))
    .map(r => ({ id: `${r.whole} -> ${r.part}`, from: r.whole, to: r.part }));
  // The structural view has its own components (Server, Service, ...); divergences are counted among them only.
  const containmentLabels = new Set(containment.flatMap(r => [r.from, r.to]));
  const containmentMapping = new Map([...mapping].filter(([label]) => containmentLabels.has(label)));
  const messages = documentedMessages(read(path.join(here, 'output', 'messages.csv')),
    read(path.join(here, 'output', 'participants.csv')));

  const driver = neo4j.driver(process.env.NEO4J_URI || 'bolt://localhost:7687', neo4j.auth.basic('neo4j', 'neo4j'));
  const session = driver.session();
  const run = async (name, params) => (await session.run(query(name), params)).records.map(r => r.toObject());
  try {
    const fqnsOf = level => [...new Set(mappingRows.flatMap(r => typesFor(r, level).types))];
    const all = [...new Set(LEVELS.flatMap(fqnsOf))];
    const missing = (await run('type_exists', { fqns: all })).filter(r => !r.found).map(r => r.fqn);
    if (missing.length) throw new Error(`Mapped types not in the source model: ${missing.join(', ')}`);

    const results = {}, summary = [], coverage = [], divergenceRows = [];
    for (const level of LEVELS) {
      const fqns = fqnsOf(level);
      const dependsOn = new Map((await run('depends_on_pairs', { fqns })).map(r => [`${r.from} -> ${r.to}`, new Set()]));
      const invokes = new Map((await run('invokes_pairs', { fqns })).map(r => [`${r.from} -> ${r.to}`, new Set(r.methods)]));
      const views = {
        containment: [classify(containment, mapping, level, dependsOn), divergences(containmentMapping, level, dependsOn, containment)],
        messages: [classify(messages, mapping, level, invokes), divergences(mapping, level, invokes, messages)],
      };
      for (const [view, [classified, diverging]] of Object.entries(views)) {
        results[`${view}:${level}`] = classified;
        summary.push({ view, level, ...summarize(classified), D: diverging.length });
      }
      for (const d of views.messages[1]) divergenceRows.push({ level, ...d, type_pairs: d.pairs.length, pairs: d.pairs.join('; ') });
      const [cov] = await run('mapping_coverage', { inScope, fqns });
      coverage.push({
        level,
        participants: mappingRows.length,
        participants_mapped: mappingRows.filter(r => typesFor(r, level).types.length).length,
        in_scope_types: cov.inScope.toNumber(),
        in_scope_types_reached: cov.reached.toNumber(),
      });
    }

    const merge = (view, extra) => results[`${view}:interface`].map((r, i) => {
      const impl = results[`${view}:implementation`][i];
      return { ...r, interface_status: r.status, implementation_status: impl.status, ...extra(r, impl),
        fallback: r.fallback || impl.fallback };
    });
    fs.mkdirSync(outDir, { recursive: true });
    const write = (name, rows, columns) => fs.writeFileSync(path.join(outDir, name), serializeCsv(rows, columns));
    write('reflexion_containment.csv', merge('containment', () => ({})),
      ['id', 'from', 'to', 'interface_status', 'implementation_status', 'fallback']);
    write('reflexion_messages.csv', merge('messages', (r, impl) => ({
      interface_method_seen: r.methodSeen, implementation_method_seen: impl.methodSeen })),
      ['id', 'from', 'to', 'kind', 'message', 'interface_status', 'implementation_status',
        'interface_method_seen', 'implementation_method_seen', 'fallback']);
    write('reflexion_summary.csv', summary,
      ['view', 'level', 'C', 'D', 'A', 'unmapped', 'sameType', 'recall', 'recall_mapped']);
    write('divergences.csv', divergenceRows, ['level', 'from', 'to', 'type_pairs', 'pairs']);
    write('mapping_coverage.csv', coverage,
      ['level', 'participants_mapped', 'participants', 'in_scope_types_reached', 'in_scope_types']);
    console.table(summary);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
