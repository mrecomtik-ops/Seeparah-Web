/**
 * Complete Gutenberg metadata discovery (75k+ catalogue), separate from
 * text acquisition and from rights-approved publication.
 *
 * Uses ONLY the official weekly Project Gutenberg CSV via authorized mirrors
 * (never the human-facing Gutenberg pages). Stores every Text identity,
 * including multilingual, unknown-author and modern/translated editions.
 * Checkpoints are idempotent and persist in Supabase; no rights status changes.
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { csvRows, downloadCatalog } from "@/lib/admin/gutenberg-autopilot.server";

export const GUTENBERG_DISCOVERY_TARGET = 75_000;
const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const RESCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export type GutenbergInventoryRecord = {
  gutenberg_id: number;
  source_type: "Text";
  title: string;
  author_raw: string;
  language_codes: string[];
  catalog_issued: string | null;
  subjects: string;
  catalog_url: string;
  catalog_sha256: string;
};
export type FullCatalogPage = {
  items: GutenbergInventoryRecord[];
  textRows: number;
  exhausted: boolean;
};

export function parseGutenbergInventoryPage(
  csv: string,
  offset: number,
  limit: number,
  sha256: string,
): FullCatalogPage {
  if (!Number.isInteger(offset) || offset < 0 ||
      !Number.isInteger(limit) || limit < 1 || limit > 5000 ||
      !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("Invalid Gutenberg full-catalog checkpoint");
  }
  const rows = csvRows(csv);
  const header = rows.next();
  if (header.done) throw new Error("Gutenberg CSV header missing");
  const fields = header.value.map((v) => v.replace(/^\uFEFF/u, "").trim());
  const column = (s: string) => fields.indexOf(s);
  const required = ["Text#", "Type", "Issued", "Title", "Language", "Authors", "Subjects"];
  if (required.some((v) => column(v) < 0)) {
    throw new Error("Gutenberg CSV lacks required official metadata columns");
  }

  const items: GutenbergInventoryRecord[] = [];
  let textRows = 0;
  for (const row of rows) {
    const type = row[column("Type")]?.trim();
    if (type !== "Text") continue;
    const rowNumber = textRows++;
    if (rowNumber < offset) continue;
    if (items.length >= limit) return { items, textRows, exhausted: false };
    const rawId = row[column("Text#")]?.trim() ?? "";
    const gutenberg_id = Number(rawId);
    if (!/^\d{1,7}$/.test(rawId) ||
        !Number.isSafeInteger(gutenberg_id) ||
        gutenberg_id < 1 || gutenberg_id > 9_999_999) {
      // Unknown ID cannot be upserted: stop rather than silently skip.
      throw new Error("Invalid Gutenberg catalog identity at Text row " + rowNumber);
    }
    const issue = row[column("Issued")]?.trim() ?? "";
    const languages = (row[column("Language")] ?? "")
      .split(/[;,]/gu).map((s) => s.trim()).filter(Boolean);
    items.push({
      gutenberg_id,
      source_type: "Text",
      title: (row[column("Title")] ?? "").trim().slice(0, 3000),
      author_raw: (row[column("Authors")] ?? "").trim().slice(0, 3000),
      language_codes: languages,
      catalog_issued: /^\d{4}-\d{2}-\d{2}$/u.test(issue) ? issue : null,
      subjects: (row[column("Subjects")] ?? "").trim().slice(0, 3000),
      catalog_url: CATALOG_URL,
      catalog_sha256: sha256,
    });
  }
  return { items, textRows, exhausted: true };
}

type DiscoverySettings = {
  enabled: boolean;
  catalog_offset: number;
  batch_size: number;
  last_catalog_sha256: string | null;
  last_attempt_at: string | null;
  completed_at: string | null;
};

export async function runGutenbergFullDiscoveryOnce(): Promise<void> {
  // This is deliberately independent of the publishing importer's enabled
  // flag. Catalog discovery never downloads full books or publishes anything.
  const db = supabaseAdmin as any;
  const { data: row, error } = await db.from("gutenberg_discovery_state")
    .select("enabled,catalog_offset,batch_size,last_catalog_sha256,last_attempt_at,completed_at")
    .eq("id", 1).maybeSingle();
  if (error) throw new Error("Gutenberg discovery state unavailable: " + error.message);
  const s = row as DiscoverySettings | null;
  if (!s?.enabled) return;

  const now = Date.now();
  const last = s.last_attempt_at ? new Date(s.last_attempt_at).getTime() : 0;
  if (last && now - last < RETRY_INTERVAL_MS) return;
  const completed = s.completed_at ? new Date(s.completed_at).getTime() : 0;
  if (completed && now - completed < RESCAN_INTERVAL_MS) return;

  // Claim the interval before HTTP access so failed mirrors are not hammered.
  // A conditional update is a cheap optimistic lock across overlapping crons.
  let claim = db.from("gutenberg_discovery_state").update({
    last_attempt_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  }).eq("id", 1).eq("enabled", true).eq("catalog_offset", s.catalog_offset);
  claim = s.last_attempt_at ? claim.eq("last_attempt_at", s.last_attempt_at)
    : claim.is("last_attempt_at", null);
  const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
  if (claimError) throw new Error("Gutenberg discovery lease failed: " + claimError.message);
  if (!claimed) return;

  try {
    const csv = await downloadCatalog();
    const sha256 = createHash("sha256").update(csv).digest("hex");
    const refreshed = s.last_catalog_sha256 !== null &&
      s.last_catalog_sha256 !== sha256;
    const offset = refreshed || Boolean(completed) ? 0 : s.catalog_offset;
    const page = parseGutenbergInventoryPage(csv, offset, s.batch_size, sha256);

    for (let i = 0; i < page.items.length; i += 200) {
      const { error: writeError } = await db.from("gutenberg_catalog_inventory")
        .upsert(page.items.slice(i, i + 200), {
          onConflict: "gutenberg_id",
          ignoreDuplicates: true,
        });
      if (writeError) throw new Error("Full catalog inventory persistence failed: " + writeError.message);
    }

    const cursor = offset + page.items.length;
    const patch = {
      catalog_offset: cursor,
      last_catalog_sha256: sha256,
      last_success_at: new Date().toISOString(),
      completed_at: page.exhausted ? new Date().toISOString() : null,
      processed_rows: cursor,
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    const { error: finishError } = await db.from("gutenberg_discovery_state")
      .update(patch).eq("id", 1).eq("enabled", true);
    if (finishError) throw new Error("Full catalog checkpoint write failed: " + finishError.message);
    console.log("[Gutenberg discovery]", JSON.stringify({
      newRows: page.items.length, processedRows: cursor, finished: page.exhausted,
      changedFeed: refreshed, target: GUTENBERG_DISCOVERY_TARGET,
    }));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await db.from("gutenberg_discovery_state").update({
      last_error: message.slice(0, 1200), updated_at: new Date().toISOString(),
    }).eq("id", 1);
    throw new Error("Gutenberg discovery paused this tick: " + message);
  }
}
