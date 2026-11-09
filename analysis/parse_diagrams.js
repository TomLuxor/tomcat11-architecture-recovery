// Intended model (step 3): extract participants and messages from Tomcat's PlantUML sequence diagrams.
// Usage: node analysis/parse_diagrams.js <path-to-tomcat-checkout> <output-dir>
// Writes participants.csv and messages.csv and prints a summary plus every line containing an
// arrow that the parser could not classify.
// Message kinds: call (A -> B), create (A -->> B **), return (A --> B or the 'return' keyword),
// self (A -> A). Only 'call' and 'create' between different participants enter the intended model.
const fs = require('fs');
const path = require('path');

const [checkout, outDir] = process.argv.slice(2);
const base = path.join(checkout, 'webapps', 'docs', 'architecture');
const files = ['startup', 'requestProcess'].flatMap(d =>
  fs.readdirSync(path.join(base, d)).filter(f => f.endsWith('.plantuml')).sort().map(f => path.join(d, f)));

const unquote = s => s.replace(/^"(.*)"$/, '$1');
const participants = [];   // {diagram, alias, label, declared}
const messages = [];       // {diagram, line, from, to, kind, text}
const unparsed = [];

// Endpoints are a plain name or a quoted label with an inline alias, e.g. "Service(s)" as Services.
const endpoint = String.raw`("[^"]+"(?:\s+as\s+\S+?)?|[^\s":]+?)`;
const arrow = new RegExp(String.raw`^\s*${endpoint}\s*(-->>|->>|-->|->|<--|<-)\s*${endpoint}\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.*))?$`);
const cleanLabel = s => s.replace(/\\n/g, ' ');
const splitEndpoint = e => {
  const m = e.match(/^"([^"]+)"\s+as\s+(\S+)$/);
  return m ? { alias: m[2], label: cleanLabel(m[1]) } : { alias: unquote(e), label: cleanLabel(unquote(e)) };
};
const decl = /^\s*(participant|actor|boundary|control|entity|database|collections|queue)\s+("[^"]+"|\S+)(?:\s+as\s+(\S+))?/;

for (const rel of files) {
  const diagram = path.basename(rel, '.plantuml');
  const seen = new Map();
  const note = (alias, declared, label) => {
    if (!seen.has(alias)) { seen.set(alias, true); participants.push({ diagram, alias, label: label || alias, declared }); }
  };
  let inNote = false;
  fs.readFileSync(path.join(base, rel), 'utf8').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("'")) return;
    if (/^(r|h)?note\b/.test(line) && !line.includes(':')) { inNote = true; return; }
    if (inNote) { if (/^end ?note$/.test(line)) inNote = false; return; }
    let m = line.match(decl);
    if (m) { const label = cleanLabel(unquote(m[2])); note(m[3] || unquote(m[2]), true, label); return; }
    if (/^return\b/.test(line)) { messages.push({ diagram, line: i + 1, from: '', to: '', kind: 'return', text: line.slice(6).trim() }); return; }
    m = line.match(arrow);
    if (m) {
      let [, a, op, b, mod, text] = m;
      const ea = splitEndpoint(a), eb = splitEndpoint(b);
      a = ea.alias; b = eb.alias;
      note(a, false, ea.label); note(b, false, eb.label);
      if (op.startsWith('<')) [a, b] = [b, a];
      const kind = a === b ? 'self' : mod === '**' ? 'create' : op === '-->' || op === '<--' ? 'return' : 'call';
      messages.push({ diagram, line: i + 1, from: a, to: b, kind, text: (text || '').trim() });
      return;
    }
    if (/(->|<-)/.test(line)) unparsed.push(`${rel}:${i + 1}: ${line}`);
  });
}

const csv = v => /[",]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'participants.csv'),
  'diagram,alias,label,declared\n' + participants.map(p => [p.diagram, p.alias, p.label, p.declared].map(csv).join(',')).join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'messages.csv'),
  'diagram,line,from,to,kind,message\n' + messages.map(m => [m.diagram, m.line, m.from, m.to, m.kind, m.text].map(csv).join(',')).join('\n') + '\n');

const byKind = k => messages.filter(m => m.kind === k).length;
const model = messages.filter(m => m.kind === 'call' || m.kind === 'create');
const pairs = new Set(model.map(m => `${m.from} -> ${m.to}`));
console.log(`diagrams: ${files.length}`);
console.log(`participant occurrences: ${participants.length}, distinct participants: ${new Set(participants.map(p => p.alias)).size}`);
console.log(`messages: call ${byKind('call')}, create ${byKind('create')}, self ${byKind('self')}, return ${byKind('return')}`);
console.log(`model messages (call + create between different participants): ${model.length}, distinct participant pairs: ${pairs.size}`);
console.log(`unparsed lines with arrows: ${unparsed.length}`);
unparsed.forEach(u => console.log('  ' + u));
