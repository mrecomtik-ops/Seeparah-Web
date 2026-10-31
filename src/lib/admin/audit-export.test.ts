import { describe, expect, it } from "vitest";
import { auditCsv } from "./audit-export";
describe("audit CSV export", () => {
  it("escapes commas and double quotes and does not export details JSON", () => {
    const csv = auditCsv([{
      created_at:"2026-10-31T00:00:00Z",actor_role:"administrator",actor_id:"user-1",
      action:"catalog.update",entity_type:"book",entity_id:"book-1",
      entity_display_name:'Book, "One"',reason:"=SUM(1,1)",
    }]);
    expect(csv).toContain('"Book, ""One"""');
    expect(csv).toContain("\"'=SUM(1,1)\"");
    expect(csv).not.toContain("before");
  });
  it("exports an empty page with headers", () => {
    expect(auditCsv([])).toContain("entity_display_name");
  });
});
