// Fills the open rows of the mapping with the settled decisions on the ambiguous and unmatched participants.
// Usage: node analysis/resolve_mapping.js <decisions.csv> <mapping-in.csv> <mapping-out.csv>
// <decisions.csv> has the columns participant,type,reason as in analysis/review/; type 'none' = not mapped.
// A chosen interface keeps the standard implementation proposed in mapping_draft.csv (e.g. Host -> StandardHost);
// any other chosen type is used at both levels.
const fs = require('fs');
const path = require('path');
const { parseCsv, serializeCsv } = require('./lib/csv');

function resolveOpenRows(mapping, draft, decisions) {
  const byParticipant = new Map(decisions.map(d => [d.participant, d]));
  const draftOf = new Map(draft.map(d => [d.participant, d]));
  const missing = mapping.filter(r => r.decision === 'open' && !byParticipant.has(r.participant));
  if (missing.length) throw new Error(`No decision for: ${missing.map(r => r.participant).join(', ')}`);
  return mapping.map(r => {
    if (r.decision !== 'open') return r;
    const { type, reason } = byParticipant.get(r.participant);
    if (type.trim() === 'none') return { ...r, interface_level: '', implementation_level: '', decision: 'unmappable', note: reason };
    const d = draftOf.get(r.participant) || {};
    const implementation = d.interface_level === type && d.implementation_level ? d.implementation_level : type;
    return { ...r, interface_level: type, implementation_level: implementation, decision: 'resolved', note: reason };
  });
}

if (require.main === module) {
  const [decisionsFile, mappingIn, mappingOut] = process.argv.slice(2);
  const read = f => parseCsv(fs.readFileSync(f, 'utf8'));
  const mapping = read(mappingIn);
  const rows = resolveOpenRows(mapping, read(path.join(__dirname, 'output', 'mapping_draft.csv')), read(decisionsFile));
  fs.writeFileSync(mappingOut, serializeCsv(rows, Object.keys(mapping[0])));
}

module.exports = { resolveOpenRows };
