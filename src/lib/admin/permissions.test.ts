import { describe, expect, it } from "vitest";
import { roleHasCapability, capabilitiesFor, isAtLeast, ADMIN_ROLES } from "@/lib/admin/permissions";

describe("permission matrix", () => {
  it("gives owner every capability administrator has, plus role management", () => {
    const ownerCaps = capabilitiesFor("owner");
    const adminCaps = capabilitiesFor("administrator");
    for (const cap of adminCaps) expect(ownerCaps).toContain(cap);
    expect(ownerCaps).toContain("roles.manage");
    expect(adminCaps).not.toContain("roles.manage");
  });

  it("keeps support agents away from unpublished manuscripts, private notes, roles, and secrets", () => {
    expect(roleHasCapability("support", "catalog.read_unpublished")).toBe(false);
    expect(roleHasCapability("support", "users.private_notes.read")).toBe(false);
    expect(roleHasCapability("support", "roles.manage")).toBe(false);
    expect(roleHasCapability("support", "settings.secrets_status.read")).toBe(false);
    // Support DOES get the narrow set it actually needs.
    expect(roleHasCapability("support", "support.tickets.manage")).toBe(true);
    expect(roleHasCapability("support", "users.support_actions")).toBe(true);
  });

  it("keeps editors away from user management, support tickets, settings, and roles", () => {
    expect(roleHasCapability("editor", "users.read")).toBe(false);
    expect(roleHasCapability("editor", "support.tickets.read_all")).toBe(false);
    expect(roleHasCapability("editor", "settings.manage")).toBe(false);
    expect(roleHasCapability("editor", "roles.manage")).toBe(false);
    // Editors DO own catalog + translation review.
    expect(roleHasCapability("editor", "catalog.publish")).toBe(true);
    expect(roleHasCapability("editor", "translation.requests.decide")).toBe(true);
  });

  it("gates the 'Reply to requester' capability (support.tickets.public_reply) to owner/administrator/support only — never editor, never an unassigned role", () => {
    expect(roleHasCapability("owner", "support.tickets.public_reply")).toBe(true);
    expect(roleHasCapability("administrator", "support.tickets.public_reply")).toBe(true);
    expect(roleHasCapability("support", "support.tickets.public_reply")).toBe(true);
    expect(roleHasCapability("editor", "support.tickets.public_reply")).toBe(false);
    expect(roleHasCapability(null, "support.tickets.public_reply")).toBe(false);
    expect(roleHasCapability(undefined, "support.tickets.public_reply")).toBe(false);
  });

  it("denies every capability to a null/unassigned role", () => {
    for (const role of [null, undefined] as const) {
      expect(capabilitiesFor(role)).toEqual([]);
      expect(roleHasCapability(role, "catalog.publish")).toBe(false);
    }
  });

  it("ranks roles for seniority checks", () => {
    expect(isAtLeast("owner", "administrator")).toBe(true);
    expect(isAtLeast("support", "administrator")).toBe(false);
    expect(isAtLeast(null, "support")).toBe(false);
  });

  it("defines exactly the four documented roles", () => {
    expect(ADMIN_ROLES).toEqual(["owner", "administrator", "editor", "support"]);
  });
});
