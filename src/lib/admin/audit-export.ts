/** Export the currently authorized audit-page rows only; no before/after JSON. */
export interface AuditExportRow {
  created_at: string;
  actor_role: string | null;
  actor_id: string | null;
  actor_display_name?: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_display_name: string | null;
  reason: string | null;
}
function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  // Do not let spreadsheet apps evaluate audit-event text as a formula.
  const safe = /^[\s\u0000-\u001f]*[=+@\-\t\r]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function auditCsv(rows: AuditExportRow[]): string {
  const columns: Array<keyof AuditExportRow> = [
    "created_at", "actor_role", "actor_display_name", "actor_id", "action",
    "entity_type", "entity_display_name", "entity_id", "reason",
  ];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");
}
