// Server-only. Versioned content/config settings shared by the website and
// (per the documented mobile API contract) the app. Every publish is
// recorded in content_settings_history so it can be rolled back; nothing
// here ever carries a secret value — that's a separate, code-only path
// (see settings.server.ts's isGeminiConfigured-style status checks).
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Known settings keys and their shapes. Adding a new key here is additive
 * and safe; changing an existing key's shape is a breaking change for both
 * clients and must go through the compatibility rules in
 * docs/mobile-api-contract.md. */
export const SETTINGS_SCHEMAS = {
  home_collections: z.array(
    z.object({ id: z.string(), title: z.string(), bookIds: z.array(z.string()) }),
  ),
  featured_books: z.array(z.string()),
  categories: z
    .array(z.string().trim().min(1))
    .refine((categories) => categories.includes("Religious"), {
      message: 'The protected "Religious" category cannot be removed',
    }),
  announcements: z.array(z.object({ id: z.string(), message: z.string(), active: z.boolean() })),
  support_contact: z.object({ email: z.string().email(), helpUrl: z.string().url().optional() }),
  maintenance_message: z.object({ active: z.boolean(), message: z.string().optional() }),
  language_availability: z.array(z.string()),
  translation_budget: z.object({
    dailyUsd: z.number().nonnegative(),
    monthlyUsd: z.number().nonnegative(),
    maxConcurrentJobs: z.number().int().positive(),
    maxRequestsPerUserPerDay: z.number().int().positive(),
  }),
  monetization_enabled: z.boolean(),
  monthly_plan_price_usd: z.number().positive(),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;

export const PUBLIC_SETTINGS_KEYS: SettingsKey[] = [
  "home_collections",
  "featured_books",
  "categories",
  "announcements",
  "support_contact",
  "maintenance_message",
  "language_availability",
  "monetization_enabled",
  "monthly_plan_price_usd",
];

/** Default monthly translated-edition plan price: $2.99 USD. This is the
 * fallback used everywhere the price is read, for as long as no admin has
 * ever published a monthly_plan_price_usd setting yet (content_settings
 * starts empty; nothing here seeds a row via migration, matching how
 * every other setting in this table already works). The moment an admin
 * publishes a real value, that value — not this constant — is what every
 * reader and every future billing sync sees. */
export const DEFAULT_MONTHLY_PLAN_PRICE_USD = 2.99;

/**
 * Monetization is deliberately fail-closed until the production billing
 * integration explicitly opts in. Merely editing a public setting must never
 * turn on a paywall that readers have no way to purchase.
 *
 * BILLING_PROVIDER_READY is set only by deployment/ops after the real
 * recurring billing + webhook flow has been connected and verified.
 */
export function isBillingProviderReady(): boolean {
  return process.env["BILLING_PROVIDER_READY"] === "true";
}

export async function getMonthlyPlanPriceUsd(): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("content_settings")
    .select("value")
    .eq("key", "monthly_plan_price_usd")
    .maybeSingle();
  const value = data?.value;
  return typeof value === "number" && value > 0 ? value : DEFAULT_MONTHLY_PLAN_PRICE_USD;
}

export async function getSetting(key: SettingsKey) {
  const db = await admin();
  const { data } = await db.from("content_settings").select("*").eq("key", key).maybeSingle();
  return data ?? null;
}

/** Public read: only keys marked is_public, for the website/app config
 * fetch. Never returns translation_budget (operational/secret-adjacent). */
export async function getPublicSettings(): Promise<Record<string, Json>> {
  const db = await admin();
  const { data } = await db.from("content_settings").select("key, value").eq("is_public", true);
  const out: Record<string, Json> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

export async function publishSetting(params: {
  key: SettingsKey;
  value: unknown;
  updatedBy: string;
}) {
  const schema = SETTINGS_SCHEMAS[params.key];
  const parsed = schema.safeParse(params.value);
  if (!parsed.success) {
    throw new Error(
      `Invalid value for ${params.key}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  if (params.key === "monetization_enabled" && parsed.data === true && !isBillingProviderReady()) {
    throw new Error(
      "Monetization cannot be enabled until the production billing provider, recurring plan, and webhook flow have been connected and BILLING_PROVIDER_READY=true in the server runtime.",
    );
  }

  const db = await admin();
  const { data: existing } = await db
    .from("content_settings")
    .select("version")
    .eq("key", params.key)
    .maybeSingle();
  const nextVersion = (existing?.version ?? 0) + 1;
  const isPublic = PUBLIC_SETTINGS_KEYS.includes(params.key);

  const { error } = await db.from("content_settings").upsert({
    key: params.key,
    value: parsed.data,
    is_public: isPublic,
    version: nextVersion,
    updated_by: params.updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  await db.from("content_settings_history").insert({
    key: params.key,
    value: parsed.data,
    version: nextVersion,
    action: "publish",
    updated_by: params.updatedBy,
  });
  return { key: params.key, version: nextVersion };
}

export async function rollbackSetting(params: {
  key: SettingsKey;
  toVersion: number;
  updatedBy: string;
}) {
  const db = await admin();
  const { data: historyRow, error } = await db
    .from("content_settings_history")
    .select("value")
    .eq("key", params.key)
    .eq("version", params.toVersion)
    .maybeSingle();
  if (error || !historyRow) throw new Error("That version was not found in history");
  return publishSetting({ key: params.key, value: historyRow.value, updatedBy: params.updatedBy });
}

export async function listSettingHistory(key: SettingsKey) {
  const db = await admin();
  const { data, error } = await db
    .from("content_settings_history")
    .select("*")
    .eq("key", key)
    .order("version", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Configured/unconfigured status only — never the secret value itself. */
export async function getSecretsStatus(): Promise<Record<string, boolean>> {
  return {
    gemini: !!process.env["GEMINI_API_KEY"],
    supabaseServiceRole: !!process.env["SUPABASE_SERVICE_ROLE_KEY"],
    billingProviderReady: isBillingProviderReady(),
  };
}
