/** Parses RFC 4180 CSV with a header row into one object per record. */
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const rows = records.filter((row) => row.some((cell) => cell.trim() !== ""));
  const header = rows.shift()?.map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!header) return [];
  return rows.map((row) => Object.fromEntries(header.map((key, column) => [key, row[column]?.trim() ?? ""])));
}

/** Writes rows as CSV, with every key any row has as a column. */
export function toCsv(rows: Record<string, string>[]): string {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value = "") => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [keys.join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\n") + "\n";
}
