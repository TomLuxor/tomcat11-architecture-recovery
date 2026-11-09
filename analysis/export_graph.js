// Technique B (input): exports the source model as the graph that ACDC and Leiden cluster (Section 4.6).
// Usage: node analysis/export_graph.js   (needs the jQAssistant server, like reflexion.js)
// Writes, with nested and anonymous types merged into their top-level type and without self-loops:
//   output/graph_nodes.csv   (id, package)   top-level in-scope types
//   output/graph_edges.csv   (source, target) unweighted DEPENDS_ON edges, the clustering input; directed (ACDC),
//                                             treat them as undirected for Leiden; also used to score containment
//   output/graph_invokes.csv (source, target) type pairs with an INVOKES between their methods; used to score
//                                             messages (relation scoring, Appendix G of the paper), not a clustering input
//   output/documented_relations.csv           the 5 containment relations and 147 messages with the top-level
//                                             types of both ends at both mapping levels (from output/mapping.csv)
const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');
const { parseCsv, serializeCsv } = require('./lib/csv');
const { mergeNested, documentedRelations } = require('./lib/graph');
const { documentedMessages } = require('./lib/reflexion');

async function main() {
  const { inScope } = JSON.parse(fs.readFileSync(path.join(__dirname, 'scope.json'), 'utf8'));
  const query = fs.readFileSync(path.join(__dirname, 'queries', 'graph_export.cypher'), 'utf8');
  const driver = neo4j.driver(process.env.NEO4J_URI || 'bolt://localhost:7687', neo4j.auth.basic('neo4j', 'neo4j'));
  const session = driver.session();
  let record;
  try {
    [record] = (await session.run(query, { inScope })).records;
  } finally {
    await session.close();
    await driver.close();
  }
  const types = record.get('types');
  const { nodes, edges } = mergeNested(types, record.get('dependencies'));
  const { edges: invokes } = mergeNested(types, record.get('invocations'));
  const out = path.join(__dirname, 'output');
  fs.writeFileSync(path.join(out, 'graph_nodes.csv'), serializeCsv(nodes, ['id', 'package']));
  fs.writeFileSync(path.join(out, 'graph_edges.csv'), serializeCsv(edges, ['source', 'target']));
  fs.writeFileSync(path.join(out, 'graph_invokes.csv'), serializeCsv(invokes, ['source', 'target']));

  const read = f => parseCsv(fs.readFileSync(path.join(out, f), 'utf8'));
  const mapping = new Map(read('mapping.csv').map(r => [r.participant, r]));
  const containment = read('structural_model.csv')
    .map(r => ({ view: 'containment', id: `${r.whole} -> ${r.part}`, from: r.whole, to: r.part, kind: '', message: '' }));
  const messages = documentedMessages(read('messages.csv'), read('participants.csv')).map(m => ({ view: 'messages', ...m }));
  const relations = documentedRelations([...containment, ...messages], mapping);
  fs.writeFileSync(path.join(out, 'documented_relations.csv'), serializeCsv(relations, ['view', 'id', 'from', 'to', 'kind',
    'message', 'interface_from', 'interface_to', 'implementation_from', 'implementation_to']));
  console.log(`${nodes.length} nodes, ${edges.length} DEPENDS_ON edges, ${invokes.length} INVOKES type pairs, ` +
    `${relations.length} documented relations`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
