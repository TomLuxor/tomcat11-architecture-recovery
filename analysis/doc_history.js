// Repository analysis (step 2): history of Tomcat's architecture documentation up to the analyzed tag.
// Usage: node analysis/doc_history.js <path-to-tomcat-checkout> [tag] > analysis/output/doc_history.csv
const { execFileSync } = require('child_process');
const [checkout, tag = '11.0.27'] = process.argv.slice(2);
const git = args => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const parts = {
  overview: ['webapps/docs/architecture/overview.xml'],
  startup: ['webapps/docs/architecture/startup', 'webapps/docs/architecture/startup.xml'],
  requestProcess: ['webapps/docs/architecture/requestProcess', 'webapps/docs/architecture/requestProcess.xml'],
};
const csv = v => /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
console.log('part,date,commit,author,subject');
for (const [part, paths] of Object.entries(parts)) {
  const follow = paths.length === 1 ? ['--follow'] : [];
  const out = git(['log', tag, ...follow, '--date=short', '--format=%ad\t%h\t%an\t%s', '--', ...paths]).trim();
  for (const line of out.split('\n')) console.log([part, ...line.split('\t')].map(csv).join(','));
}
