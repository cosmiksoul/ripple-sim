/** RFC 4180 parser: quoted fields, doubled quotes, CR/LF/CRLF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[k + 1] === '"') {
          field += '"';
          k++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[k + 1] === '\n') k++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function csvObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const header = rows[0] ?? [];
  const out: Array<Record<string, string>> = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.length === 1 && cells[0] === '') continue;
    const obj: Record<string, string> = {};
    header.forEach((h, k) => {
      obj[h] = cells[k] ?? '';
    });
    out.push(obj);
  }
  return out;
}
