import { describe, expect, it } from "vitest";
import { asPublicAuthorProfile } from "@/lib/public-catalog.server";

describe("QA-031 public author profile privacy", () => {
  it("never returns account UUIDs or private identity metadata", () => {
    const raw = {
      user_id: "private-login-uuid",
      pen_name: "Published Writer",
      bio: "A publicly authored biography",
      avatar_url: "/book-avatar.jpg",
      updated_at: "2026-11-11T00:00:00Z",
      email: "private@example.org",
      identity_provider: "google",
    };
    expect(asPublicAuthorProfile(raw)).toEqual({
      pen_name: "Published Writer",
      bio: "A publicly authored biography",
      avatar_url: "/book-avatar.jpg",
    });
    expect(JSON.stringify(asPublicAuthorProfile(raw))).not.toContain("private-login-uuid");
    expect(JSON.stringify(asPublicAuthorProfile(raw))).not.toContain("private@example.org");
  });
  it("omits invalid metadata rather than inventing public author details", () => {
    expect(asPublicAuthorProfile({ pen_name: 5, bio: false, avatar_url: null })).toEqual({
      pen_name: null, bio: null, avatar_url: null,
    });
  });
});