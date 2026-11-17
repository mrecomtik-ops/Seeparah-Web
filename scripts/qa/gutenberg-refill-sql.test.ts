import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const sql=readFileSync(new URL("../../supabase/migrations/20261117070715_gutenberg_autopilot_bounded_indexed_refill_20261117.sql",import.meta.url),"utf8");
describe("Gutenberg queue refill remains bounded and index-backed",()=>{
 it("preserves each source duplicate exclusion with a separate lookup index",()=>{
  expect(sql).toContain("books_gutenberg_scan_lookup_idx");
  expect(sql).toContain("books_gutenberg_url_lookup_idx");
  expect(sql).toContain("books_gutenberg_title_lookup_idx");
  expect(sql).toMatch(/WHERE b\.source_scan_id=/);
  expect(sql).toMatch(/WHERE b\.source_url=/);
  expect(sql).toMatch(/WHERE lower\(b\.title\)=lower\(c\.title\)/);
 });
 it("does not count the entire candidate pool on every minute tick",()=>{
  expect(sql).not.toMatch(/into\s+pool_count/i);
  expect(sql).toMatch(/LIMIT\s+to_enqueue/i);
 });
 it("keeps private service-only execution",()=>{
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.gutenberg_autopilot_prepare_batch() FROM PUBLIC, anon, authenticated;");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.gutenberg_autopilot_prepare_batch() TO service_role;");
 });
});
