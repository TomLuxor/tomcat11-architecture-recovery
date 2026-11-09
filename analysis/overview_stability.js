// Repository analysis (step 2): did the code keep matching the component descriptions of the architecture
// overview (webapps/docs/architecture/overview.xml) between 2006 and the analyzed tag?
// Usage: node analysis/overview_stability.js <path-to-tomcat-checkout> [tag] [output-dir]
// Needs a full clone (git show of old file versions); the checkout itself may be empty (--no-checkout).
// Writes overview_checks.csv: one row per yearly snapshot of the main line and statement of the overview,
//        with the result of a check against the source files of that snapshot, and
//        overview_activity.csv: commits per year that touch the overview, the files of the six described
//        components, and java/ as a whole.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { serializeCsv } = require('./lib/csv');

const [checkout, tag = '11.0.27', outDir = path.join(__dirname, 'output')] = process.argv.slice(2);
if (!checkout) { console.error('usage: node analysis/overview_stability.js <tomcat-checkout> [tag] [output-dir]'); process.exit(1); }
const git = (args, opts = {}) => execFileSync('git', ['-C', checkout, ...args],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const C = 'java/org/apache/catalina/';

// Content of a file at a commit, or null if it does not exist there.
const show = (commit, file) => { try { return git(['show', `${commit}:${file}`]); } catch { return null; } };
const treeExists = (commit, dir) => git(['ls-tree', '-d', commit, dir]).trim() !== '';
const all = (text, ...patterns) => text !== null && patterns.every(p => p.test(text));

// One check per statement of the component descriptions (overview.xml at the tag, section "Terms").
// Each returns true/false, or a value where the statement concerns a type (getContainer).
const checks = [
  ['server-interface', 'Server: default implementation of the Server interface',
    c => all(show(c, C + 'Server.java'), /interface\s+Server\b/) && show(c, C + 'core/StandardServer.java') !== null],
  ['server-contains-services', 'Service lives inside a Server',
    c => all(show(c, C + 'Server.java'), /void\s+addService\s*\(\s*Service\b/, /Service\[\]\s+findServices\s*\(/)],
  ['service-connectors', 'Service ties one or more Connectors ...',
    c => all(show(c, C + 'Service.java'), /void\s+addConnector\s*\(\s*Connector\b/, /Connector\[\]\s+findConnectors\s*\(/)],
  ['service-container-type', '... to exactly one Engine (return type of Service.getContainer)',
    c => { const m = /(\w+)\s+getContainer\s*\(\s*\)/.exec(show(c, C + 'Service.java') || ''); return m ? m[1] : 'none'; }],
  ['engine-pipeline', 'Engine represents a request processing pipeline',
    c => all(show(c, C + 'Engine.java'), /interface\s+Engine\s+extends[^{]*\bContainer\b/)
      && all(show(c, C + 'Container.java'), /Pipeline\s+getPipeline\s*\(/)],
  ['engine-jvmroute', 'Engine: clustering via the jvmRoute parameter',
    c => all(show(c, C + 'Engine.java'), /String\s+getJvmRoute\s*\(/)],
  ['engine-contains-hosts', 'An Engine may contain multiple Hosts',
    c => all(show(c, C + 'Container.java'), /void\s+addChild\s*\(\s*Container\b/, /Container\[\]\s+findChildren\s*\(/)
      && all(show(c, C + 'core/StandardEngine.java'), /addChild\s*\(\s*Container\s+child\s*\)\s*\{[^}]*child\s+instanceof\s+Host\b/)],
  ['host-aliases', 'Host supports network aliases',
    c => all(show(c, C + 'Host.java'), /interface\s+Host\s+extends[^{]*\bContainer\b/, /void\s+addAlias\s*\(/)
      && show(c, C + 'core/StandardHost.java') !== null],
  ['host-contains-contexts', 'A Host may contain multiple Contexts',
    c => all(show(c, C + 'core/StandardHost.java'), /addChild\s*\(\s*Container\s+child\s*\)\s*\{[^}]*child\s+instanceof\s+Context\b/)],
  ['context-path', 'Context represents a web application with a unique path',
    c => all(show(c, C + 'Context.java'), /interface\s+Context\s+extends[^{]*\bContainer\b/, /String\s+getPath\s*\(/)
      && show(c, C + 'core/StandardContext.java') !== null],
  ['http-and-ajp-connectors', 'Connectors include the HTTP and the AJP connector',
    c => show(c, C + 'connector/Connector.java') !== null
      && treeExists(c, 'java/org/apache/coyote/http11') && treeExists(c, 'java/org/apache/coyote/ajp')],
  ['connector-interface', 'removed in 2008: all connectors implement the Connector interface',
    c => show(c, C + 'Connector.java') !== null],
];

// Yearly snapshots of the main line (first parent) up to the tag, plus the tag itself.
const tagDate = git(['log', '-1', '--format=%ad', '--date=short', tag]).trim();
const firstYear = Number(git(['log', '--reverse', '--format=%ad', '--date=format:%Y', tag]).split('\n')[0]) + 1;
const snapshots = [];
for (let year = firstYear; `${year}-01-01` <= tagDate; year++) {
  const commit = git(['rev-list', '-1', '--first-parent', `--before=${year}-01-01`, tag]).trim();
  if (commit) snapshots.push({ snapshot: `${year}-01-01`, commit });
}
snapshots.push({ snapshot: tag, commit: git(['rev-parse', tag]).trim() });

const rows = [];
for (const { snapshot, commit } of snapshots) {
  const date = git(['log', '-1', '--format=%ad', '--date=short', commit]).trim();
  for (const [id, statement, check] of checks) {
    rows.push({ snapshot, date, commit: commit.slice(0, 10), check: id, statement, result: String(check(commit)) });
  }
}
fs.writeFileSync(path.join(outDir, 'overview_checks.csv'),
  serializeCsv(rows, ['snapshot', 'date', 'commit', 'check', 'statement', 'result']));

// Commits per year (author date) reachable from the tag.
const perYear = paths => {
  const counts = {};
  for (const y of git(['log', '--format=%ad', '--date=format:%Y', tag, '--', ...paths]).split('\n').filter(Boolean)) {
    counts[y] = (counts[y] || 0) + 1;
  }
  return counts;
};
const components = ['Server', 'Service', 'Engine', 'Host', 'Context', 'Container'].map(t => C + t + '.java')
  .concat(['Server', 'Service', 'Engine', 'Host', 'Context'].map(t => C + `core/Standard${t}.java`))
  .concat([C + 'connector/Connector.java']);
const series = { overview: perYear(['webapps/docs/architecture/overview.xml']), components: perYear(components),
  java: perYear(['java/']) };
const years = [...new Set(Object.values(series).flatMap(Object.keys))].sort();
fs.writeFileSync(path.join(outDir, 'overview_activity.csv'), serializeCsv(
  years.map(year => ({ year, overview: series.overview[year] || 0, components: series.components[year] || 0,
    java: series.java[year] || 0 })), ['year', 'overview', 'components', 'java']));

// Summary: per check, the results over the snapshots in order, with the snapshots where a result changes.
for (const [id] of checks) {
  const own = rows.filter(r => r.check === id);
  const changes = own.filter((r, i) => i > 0 && r.result !== own[i - 1].result).map(r => `${r.snapshot}: ${r.result}`);
  console.log(`${id}: ${own[0].result} (${own[0].snapshot})${changes.length ? ', then ' + changes.join(', ') : ', unchanged'}`);
}
