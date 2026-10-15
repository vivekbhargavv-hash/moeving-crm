/**
 * Spreadsheet downloads, built the same way everywhere.
 *
 * RFC 4180: every cell quoted, any inner quote doubled. The leading byte-order
 * mark makes Excel read the file as UTF-8, so ₹ and names survive.
 */

export function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvBody(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** A download response: `${name}-${today}.csv`, never cached. */
export function csvResponse(name: string, header: string[], rows: unknown[][]) {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + csvBody(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** A `?key=a,b` parameter to a list — the shape every filter uses. */
export function listParam(url: URL, key: string) {
  return (url.searchParams.get(key) ?? "").split(",").filter(Boolean);
}
