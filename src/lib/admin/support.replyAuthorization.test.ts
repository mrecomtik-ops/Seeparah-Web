import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Confirms adminReplyToTicket is wired to require admin auth + the correct
// capability BEFORE it can send anything — requireAdmin() itself already
// enforces MFA (aal2) as part of every admin action (require-admin.server.ts),
// so this is the one new wiring fact worth pinning down for this specific
// action: "unauthorized users cannot send" depends on this exact call
// existing, with this exact capability, ahead of the actual send.
describe("adminReplyToTicket authorization wiring", () => {
  it("requires the support.tickets.public_reply capability before sending", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/admin/support.functions.ts"),
      "utf8",
    );
    const start = source.indexOf("export const adminReplyToTicket");
    expect(start).toBeGreaterThan(-1);
    const nextExport = source.indexOf("\nexport const", start + 1);
    const fnBody = source.slice(start, nextExport === -1 ? undefined : nextExport);

    const requireAdminIndex = fnBody.indexOf('requireAdmin(data.accessToken, "support.tickets.public_reply")');
    const replyToTicketIndex = fnBody.indexOf("replyToTicket({");
    expect(requireAdminIndex).toBeGreaterThan(-1);
    expect(replyToTicketIndex).toBeGreaterThan(-1);
    expect(requireAdminIndex).toBeLessThan(replyToTicketIndex);
  });
});
