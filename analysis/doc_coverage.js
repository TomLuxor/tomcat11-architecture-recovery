// Repository analysis (step 3): how much of the code base the documentation names.
// Usage: node analysis/doc_coverage.js <path-to-tomcat-checkout> analysis/output/mapping.csv
//          > analysis/output/doc_coverage.csv
// With the final mapping (mapping.csv, column decision), it uses every mapped participant, i.e., all except the
// unmappable ones. With the draft (mapping_draft.csv, column status), it uses only the participants that the name
// matching resolved to exactly one type (exact or case-normalized), which gives a lower bound; this was the state
// before the mapping review. In both cases the implementation-level type counts, else the interface-level type.
// For each module it reports the code lines (as in repo_stats.js) of
//   - the whole module,
//   - the packages that contain at least one documented type,
//   - the source files that declare a documented type (nested types count with their outer file).
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./lib/csv');

const root = path.join(process.argv[2], 'java');
const mapping = parseCsv(fs.readFileSync(process.argv[3], 'utf8'));
const documentedTypes = mapping
  .filter(r => ('decision' in r ? r.decision !== 'unmappable'
                                : r.status.startsWith('exact') || r.status === 'case-normalized'))
  .map(r => r.implementation_level || r.interface_level)
  .filter(Boolean);

function codeLines(text) {
  let inBlock = false, count = 0;
  for (const line of text.split(/\r?\n/)) {
    let code = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) { if (line.startsWith('*/', i)) { inBlock = false; i++; } continue; }
      if (line.startsWith('/*', i)) { inBlock = true; i++; continue; }
      if (line.startsWith('//', i)) break;
      code += line[i];
    }
    if (code.trim()) count++;
  }
  return count;
}

function moduleOf(pkg) {
  const p = pkg.split('.');
  if (p[0] === 'org' && p[1] === 'apache') return `org.apache.${p[2]}`;
  if (p[0] === 'jakarta') return 'jakarta.*';
  return p.slice(0, 2).join('.');
}

// documented types: package and outer source file
const docPackages = new Set();
const docFiles = new Set();
for (const fqn of documentedTypes) {
  const parts = fqn.split('.');
  const typeIdx = parts.findIndex(s => /^[A-Z]/.test(s));
  const pkg = parts.slice(0, typeIdx).join('.');
  const outer = parts[typeIdx].split('$')[0];
  docPackages.add(pkg);
  docFiles.add(path.join(...pkg.split('.'), outer + '.java'));
}

const stats = new Map();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.name.endsWith('.java')) continue;
    const rel = path.relative(root, full);
    const pkg = path.dirname(rel).split(path.sep).join('.');
    const m = moduleOf(pkg);
    const s = stats.get(m) || { total: 0, docPackages: 0, docFiles: 0, files: 0, packageCount: new Set() };
    const lines = codeLines(fs.readFileSync(full, 'utf8'));
    s.total += lines;
    if (docPackages.has(pkg)) { s.docPackages += lines; s.packageCount.add(pkg); }
    if (docFiles.has(rel)) { s.docFiles += lines; s.files++; }
    stats.set(m, s);
  }
}
walk(root);

console.log('module,code_lines,code_lines_documented_packages,documented_packages,code_lines_documented_files,documented_files');
let t = { total: 0, docPackages: 0, docFiles: 0, files: 0, pk: 0 };
for (const [m, s] of [...stats].sort((a, b) => b[1].total - a[1].total)) {
  console.log([m, s.total, s.docPackages, s.packageCount.size, s.docFiles, s.files].join(','));
  t.total += s.total; t.docPackages += s.docPackages; t.docFiles += s.docFiles; t.files += s.files; t.pk += s.packageCount.size;
}
console.log(['total', t.total, t.docPackages, t.pk, t.docFiles, t.files].join(','));
