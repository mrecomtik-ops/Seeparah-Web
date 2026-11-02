import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "owner" as string | null,
  aal: "aal2" as string,
  hasClaims: true,
  lookupError: false,
  getClaims: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return {
      auth: {
        getClaims: state.getClaims.mockImplementation(async () => ({
          data: state.hasClaims ? { claims: { sub: "test-admin-user", aal: state.aal } } : null,
          error: state.hasClaims ? null : new Error("Invalid token"),
        })),
      },
      from: state.from.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({
                data: state.role ? { role: state.role, revoked_at: null } : null,
                error: state.lookupError ? new Error("Database error") : null,
              }),
            }),
          }),
        }),
      })),
    };
  },
}));
const { requireAdmin, AdminAuthError } = await import("./require-admin.server");
const check = async (capability: Parameters<typeof requireAdmin>[1]) =>
  requireAdmin("synthetic-test-token-never-used-on-production", capability);

beforeEach(() => {
  state.role = "owner";
  state.aal = "aal2";
  state.hasClaims = true;
  state.lookupError = false;
  state.getClaims.mockClear();
  state.from.mockClear();
});
describe("SP-04/14 real server permission gate role and MFA matrix (no production tokens)", () => {
  it("allows authorized AAL2 owner to review irreversible delete and staged edition covers", async () => {
    expect(await check("catalog.delete_permanent")).toEqual({
      userId: "test-admin-user", role: "owner",
    });
    expect(await check("catalog.publish")).toEqual({
      userId: "test-admin-user", role: "owner",
    });
  });
  it("allows AAL2 administrator deletion but denies editor/support irreversible deletion", async () => {
    state.role = "administrator";
    await expect(check("catalog.delete_permanent")).resolves.toMatchObject({ role: "administrator" });
    state.role = "editor";
    await expect(check("catalog.delete_permanent")).rejects.toMatchObject({ code: "forbidden" });
    state.role = "support";
    await expect(check("catalog.delete_permanent")).rejects.toMatchObject({ code: "forbidden" });
  });
  it("allows editor staging/assignment but denies support and unknown roles", async () => {
    state.role = "editor";
    await expect(check("catalog.publish")).resolves.toMatchObject({ role: "editor" });
    state.role = "support";
    await expect(check("catalog.publish")).rejects.toMatchObject({ code: "forbidden" });
    state.role = null;
    await expect(check("catalog.publish")).rejects.toMatchObject({ code: "forbidden" });
  });
  it("requires AAL2 even for an otherwise authorized owner", async () => {
    state.aal = "aal1";
    const error = await check("catalog.delete_permanent").catch(e => e);
    expect(error).toBeInstanceOf(AdminAuthError);
    expect(error.code).toBe("mfa_required");
    await expect(check("catalog.publish")).rejects.toMatchObject({ code: "mfa_required" });
  });
  it("rejects missing, expired or revoked accounts before any mutation path", async () => {
    await expect(requireAdmin(null, "catalog.delete_permanent")).rejects.toMatchObject({ code: "unauthorized" });
    state.hasClaims = false;
    await expect(check("catalog.delete_permanent")).rejects.toMatchObject({ code: "unauthorized" });
    state.hasClaims = true;
    state.role = null;
    await expect(check("catalog.delete_permanent")).rejects.toMatchObject({ code: "forbidden" });
    state.role = "owner";
    state.lookupError = true;
    await expect(check("catalog.delete_permanent")).rejects.toMatchObject({ code: "forbidden" });
  });
});
