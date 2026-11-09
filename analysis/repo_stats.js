// Repository analysis (step 2): size of the Tomcat source tree per top-level module.
// Usage: node analysis/repo_stats.js <path-to-tomcat-checkout> > analysis/output/module_sizes.csv
// Counts .java files under java/ and their lines. "Code lines" are lines that are neither
// blank nor part of a comment (// and /* */ are stripped; string contents are not parsed,
// which is precise enough for size statistics).
const fs = require('fs');
const path = require('path');

const root = path.join(process.argv[2], 'java');
const stats = new Map();

function moduleOf(rel) {
  const parts = rel.split(path.sep);
  if (parts[0] === 'org' && parts[1] === 'apache') return `org.apache.${parts[2]}`;
  if (parts[0] === 'jakarta') return `jakarta.${parts[1]}`;
  return parts.slice(0, 2).join('.');
}

function codeLines(text) {
  let inBlock = false, count = 0;
  for (let line of text.split(/\r?\n/)) {
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

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.java')) {
      const text = fs.readFileSync(full, 'utf8');
      const m = moduleOf(path.relative(root, full));
      const s = stats.get(m) || { files: 0, lines: 0, code: 0 };
      s.files++; s.lines += text.split(/\r?\n/).length; s.code += codeLines(text);
      stats.set(m, s);
    }
  }
}

walk(root);
const rows = [...stats.entries()].sort((a, b) => b[1].code - a[1].code);
const total = rows.reduce((t, [, s]) => ({ files: t.files + s.files, lines: t.lines + s.lines, code: t.code + s.code }), { files: 0, lines: 0, code: 0 });
console.log('module,java_files,lines,code_lines');
for (const [m, s] of rows) console.log(`${m},${s.files},${s.lines},${s.code}`);
console.log(`TOTAL,${total.files},${total.lines},${total.code}`);
