// Intended model (step 3): draft mapping rules from diagram participants to Tomcat types.
// Usage: node analysis/draft_mapping.js <path-to-tomcat-checkout> <output-dir>
// Reads <output-dir>/participants.csv (from parse_diagrams.js), indexes all type declarations under java/,
// and proposes an interface-level and an implementation-level type per participant.
// The result is a DRAFT: every row with status other than 'exact' needs a human decision, and even
// 'exact' rows must be checked against the diagram context. Record review time for the RQ2 effort measure.
const fs = require('fs');
const path = require('path');

const [checkout, outDir] = process.argv.slice(2);
const javaRoot = path.join(checkout, 'java');

// 1. Index every type declaration: simple name -> [{fqn, kind}]
const index = new Map();
const declRe = /\b(?:public|protected|private|abstract|final|static|\s)*\b(class|interface|enum|record)\s+([A-Z]\w*)/g;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!e.name.endsWith('.java')) continue;
    const pkg = path.relative(javaRoot, dir).split(path.sep).join('.');
    const top = e.name.slice(0, -5);
    const src = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    let m;
    while ((m = declRe.exec(src))) {
      const [, kind, name] = m;
      const fqn = name === top ? `${pkg}.${name}` : `${pkg}.${top}$${name}`;
      if (!index.has(name)) index.set(name, []);
      if (!index.get(name).some(t => t.fqn === fqn)) index.get(name).push({ fqn, kind });
    }
  }
})(javaRoot);

// 2. Distinct participants (by label), with the diagrams they occur in
const rows = fs.readFileSync(path.join(outDir, 'participants.csv'), 'utf8').trim().split('\n').slice(1)
  .map(l => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
const byLabel = new Map();
for (const [diagram, , label] of rows) {
  if (!byLabel.has(label)) byLabel.set(label, new Set());
  byLabel.get(label).add(diagram);
}

// 3. Resolve each label
const normalize = l => l.replace(/\(s\)$/, '').replace(/\s*\(.*\)$/, '').replace(/\s+/g, '');
const ci = new Map();
for (const name of index.keys()) { const k = name.toLowerCase(); if (!ci.has(k)) ci.set(k, []); ci.get(k).push(name); }

const out = [];
for (const [label, diagrams] of [...byLabel.entries()].sort()) {
  const name = normalize(label);
  let status, cands = index.get(name) || [];
  if (cands.length) status = cands.length === 1 ? 'exact' : 'ambiguous';
  else {
    const alt = (ci.get(name.toLowerCase()) || []).flatMap(n => index.get(n));
    if (alt.length) { cands = alt; status = alt.length === 1 ? 'case-normalized' : 'ambiguous'; }
    else status = 'manual';
  }
  if (status !== 'manual' && name !== label) status += label.endsWith('(s)') ? ' (plural label)' : ' (label normalized)';
  // Interface level: a catalina interface of that name; implementation level: Standard<Name> if it exists.
  const iface = cands.find(c => c.kind === 'interface' && c.fqn.startsWith('org.apache.catalina.'));
  const std = (index.get('Standard' + name) || []).find(c => c.fqn.startsWith('org.apache.catalina.'));
  let ifaceLevel = '', implLevel = '';
  if (iface) { ifaceLevel = iface.fqn; implLevel = std ? std.fqn : ''; }
  else if (cands.length === 1) { ifaceLevel = implLevel = cands[0].fqn; }
  out.push({ label, diagrams: [...diagrams].join(' '), name, status, ifaceLevel, implLevel,
             candidates: cands.length > 1 ? cands.map(c => c.fqn).join(' | ') : '' });
}

const csv = v => /[",]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
fs.writeFileSync(path.join(outDir, 'mapping_draft.csv'),
  'participant,diagrams,normalized_name,status,interface_level,implementation_level,candidates\n' +
  out.map(r => [r.label, r.diagrams, r.name, r.status, r.ifaceLevel, r.implLevel, r.candidates].map(csv).join(',')).join('\n') + '\n');

const tally = {};
for (const r of out) { const k = r.status.split(' ')[0]; tally[k] = (tally[k] || 0) + 1; }
console.log(`indexed type names: ${index.size}; distinct participant labels: ${out.length}`);
console.log('status:', JSON.stringify(tally));
for (const r of out.filter(r => !r.status.startsWith('exact')))
  console.log(`  ${r.status.padEnd(28)} ${r.label.padEnd(26)} ${r.candidates || r.ifaceLevel || '-'}`);
