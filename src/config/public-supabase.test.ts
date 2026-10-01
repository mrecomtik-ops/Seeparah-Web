import { describe, expect, it } from "vitest";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "@/config/public-supabase";

describe("public Supabase browser configuration", () => {
  it("keeps a valid production URL and publishable key available without build env variables", () => {
    expect(PUBLIC_SUPABASE_URL).toBe("https://wxldqxuxpjurttspbxok.supabase.co");
    expect(PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
    expect(PUBLIC_SUPABASE_PUBLISHABLE_KEY.length).toBeGreaterThan(20);
  });
});
