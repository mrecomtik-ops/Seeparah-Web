import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Read-only "who am I in the admin surface" check for the admin shell to
 * decide what to render (nav items, MFA prompt, etc). Never used to
 * authorize a mutation — every mutation calls requireAdmin itself.
 */
export const adminWhoAmI = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ accessToken: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimsData, error } = await supabaseAdmin.auth.getClaims(data.accessToken);
    if (error || !claimsData?.claims?.sub) {
      return { signedIn: false as const, role: null, mfaSatisfied: false, capabilities: [] };
    }
    const userId = claimsData.claims.sub as string;
    const aal = (claimsData.claims as Record<string, unknown>)["aal"];
    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();
    const role =
      (adminRow?.role as "owner" | "administrator" | "editor" | "support" | undefined) ?? null;
    const { capabilitiesFor } = await import("@/lib/admin/permissions");
    return {
      signedIn: true as const,
      role,
      mfaSatisfied: aal === "aal2",
      capabilities: role ? capabilitiesFor(role) : [],
    };
  });
