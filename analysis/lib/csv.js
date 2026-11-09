// CSV helpers for the analysis scripts: RFC 4180 quoting, header row, LF or CRLF line ends.

// Parses CSV text into one object per data row, keyed by the header.
function parseCsv(text) {
  const records = [];
  let record = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); records.push(record); record = []; field = '';
    } else field += c;
  }
  if (field !== '' || record.length) { record.push(field); records.push(record); }
  const [header, ...rows] = records;
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// Writes rows as CSV with the given columns; quotes values that contain a comma, quote or line break.
function serializeCsv(rows, columns) {
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

module.exports = { parseCsv, serializeCsv };
