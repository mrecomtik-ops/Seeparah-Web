// Pure logic, no Supabase import — safe to unit test and to import from
// client-rendered admin route components for UI-level show/hide decisions.
// The real authorization boundary is always the server check in
// require-admin.server.ts; this module is the single source of truth for
// what each role is allowed to do, shared by both sides so they can't drift.

export type AdminRole = "owner" | "administrator" | "editor" | "support";

export const ADMIN_ROLES: AdminRole[] = ["owner", "administrator", "editor", "support"];

export type Capability =
  | "roles.manage" // grant/revoke admin roles
  | "users.read" // search/view user accounts + status
  | "users.support_actions" // recovery email, suspend/restore, revoke sessions, repair profile
  | "users.private_notes.read" // a user's own highlights/notes (never for support)
  | "catalog.read_unpublished" // view draft/in_review/rejected manuscripts
  | "catalog.upload" // admin batch upload / CSV import
  | "catalog.review" // rights review + edition review, request changes
  | "catalog.publish" // approve -> published, unpublish, archive
  | "translation.jobs.manage" // retry/cancel/review jobs, edit glossary
  | "translation.requests.decide" // approve/decline/revoke reader access requests
  | "support.tickets.read_all"
  | "support.tickets.manage" // assign, change status, write internal notes
  | "support.tickets.public_reply"
  | "settings.manage" // content settings publish/rollback
  | "settings.secrets_status.read" // configured/unconfigured only, never values
  | "health.read"
  | "health.recover" // allowlisted recovery actions (retry job, resend notification, etc.)
  | "audit.read";

const MATRIX: Record<AdminRole, Capability[]> = {
  owner: [
    "roles.manage",
    "users.read",
    "users.support_actions",
    "catalog.read_unpublished",
    "catalog.upload",
    "catalog.review",
    "catalog.publish",
    "translation.jobs.manage",
    "translation.requests.decide",
    "support.tickets.read_all",
    "support.tickets.manage",
    "support.tickets.public_reply",
    "settings.manage",
    "settings.secrets_status.read",
    "health.read",
    "health.recover",
    "audit.read",
  ],
  administrator: [
    "users.read",
    "users.support_actions",
    "catalog.read_unpublished",
    "catalog.upload",
    "catalog.review",
    "catalog.publish",
    "translation.jobs.manage",
    "translation.requests.decide",
    "support.tickets.read_all",
    "support.tickets.manage",
    "support.tickets.public_reply",
    "settings.manage",
    "settings.secrets_status.read",
    "health.read",
    "health.recover",
    "audit.read",
  ],
  // Editorial staff: full reach over catalog + translation quality, but no
  // user management, no support tickets, no settings/secrets, no roles.
  editor: [
    "catalog.read_unpublished",
    "catalog.review",
    "catalog.publish",
    "translation.jobs.manage",
    "translation.requests.decide",
    "health.read",
  ],
  // Support agents: tickets + narrowly-scoped, read-mostly user account
  // actions. Explicitly NOT: unpublished manuscripts, private notes/highlights,
  // role assignment, or secrets.
  support: [
    "users.read",
    "users.support_actions",
    "support.tickets.read_all",
    "support.tickets.manage",
    "support.tickets.public_reply",
  ],
};

export function roleHasCapability(
  role: AdminRole | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(capability) ?? false;
}

export function capabilitiesFor(role: AdminRole | null | undefined): Capability[] {
  if (!role) return [];
  return MATRIX[role] ?? [];
}

const ROLE_RANK: Record<AdminRole, number> = { support: 0, editor: 1, administrator: 2, owner: 3 };

/** True if `role` is at least as senior as `minimum` in the owner > administrator
 * > editor > support seniority order. Only meaningful for capabilities every
 * more-senior role also has — most checks should use roleHasCapability
 * instead, since editor and support are siblings, not ranked against each
 * other. */
export function isAtLeast(role: AdminRole | null | undefined, minimum: AdminRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
