// One-time, human-run script to grant the FIRST admin "owner" role.
// There is deliberately no in-app way to do this — no first-registrant
// bootstrap, no hardcoded email, no public admin registration. An owner
// must already exist as a real Supabase auth user (i.e. has signed in at
// least once) before this script can grant them the role.
//
// Usage (run locally, never from a client/browser):
//   npx tsx scripts/seed-owner.ts <email-or-user-id> --confirm
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (e.g. `node --env-file=.env.local` equivalent — export them in your shell,
// or run via `npx dotenv-cli -e .env.local -- npx tsx scripts/seed-owner.ts ...`).
// This script is NOT wired into any build step and must be run manually.
import { createClient } from "@supabase/supabase-js";

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--confirm");
  const identifier = args.find((a) => !a.startsWith("--"));

  if (!identifier) {
    console.error("Usage: npx tsx scripts/seed-owner.ts <email-or-user-id> --confirm");
    process.exit(1);
  }
  if (!confirmed) {
    console.error("Refusing to run without --confirm. Re-run with --confirm once you've verified the identifier below is correct.");
    process.exit(1);
  }

  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let userId: string;
  let email: string | null;
  if (/^[0-9a-f-]{36}$/i.test(identifier)) {
    const { data, error } = await db.auth.admin.getUserById(identifier);
    if (error || !data.user) {
      console.error(`No user found with id ${identifier}`);
      process.exit(1);
    }
    userId = data.user.id;
    email = data.user.email ?? null;
  } else {
    // No admin.getUserByEmail exists in supabase-js — page through listUsers.
    let found: { id: string; email: string | null } | undefined;
    for (let page = 1; page <= 25 && !found; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error(error.message);
        process.exit(1);
      }
      found = data.users.find((u) => u.email?.toLowerCase() === identifier.toLowerCase());
      if (data.users.length < 200) break;
    }
    if (!found) {
      console.error(`No user found with email ${identifier}. They must sign in at least once before this script can grant them owner.`);
      process.exit(1);
    }
    userId = found.id;
    email = found.email;
  }

  console.log(`Granting owner to user_id=${userId} (email=${email ?? "unknown"})`);

  const { error: upsertError } = await db
    .from("admin_users")
    .upsert(
      { user_id: userId, role: "owner", granted_by: userId, granted_at: new Date().toISOString(), revoked_at: null, revoked_by: null },
      { onConflict: "user_id" },
    );
  if (upsertError) {
    console.error(`Failed to grant owner role: ${upsertError.message}`);
    process.exit(1);
  }

  await db.from("audit_log").insert({
    actor_id: userId,
    actor_role: "owner",
    action: "role.grant",
    entity_type: "admin_user",
    entity_id: userId,
    reason: "First-owner bootstrap via scripts/seed-owner.ts",
    after: { role: "owner" },
  });

  console.log("Done. This account now holds the owner role.");
  console.log("Next: sign in as this account, go to /admin, and enroll an MFA factor — admin actions require it.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
