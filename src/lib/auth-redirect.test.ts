import { describe, expect, it } from "vitest";
import {
  DEFAULT_POST_AUTH_REDIRECT,
  isSafeRedirectPath,
  resolveAuthRedirect,
} from "@/lib/auth-redirect";

describe("isSafeRedirectPath", () => {
  it("accepts ordinary in-app paths", () => {
    expect(isSafeRedirectPath("/library")).toBe(true);
    expect(isSafeRedirectPath("/read/11111111-1111-1111-1111-111111111111?lang=Urdu")).toBe(true);
    expect(isSafeRedirectPath("/admin/users")).toBe(true);
  });

  it("rejects absolute URLs to other domains", () => {
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
    expect(isSafeRedirectPath("http://evil.com/library")).toBe(false);
  });

  it("rejects scheme-relative URLs (// is treated as a full URL by browsers)", () => {
    expect(isSafeRedirectPath("//evil.com")).toBe(false);
    expect(isSafeRedirectPath("//evil.com/library")).toBe(false);
  });

  it("rejects the backslash variant some browsers normalize like //", () => {
    expect(isSafeRedirectPath("/\\evil.com")).toBe(false);
  });

  it("rejects non-path values", () => {
    expect(isSafeRedirectPath("library")).toBe(false);
    expect(isSafeRedirectPath("")).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(123)).toBe(false);
  });
});

describe("resolveAuthRedirect", () => {
  it("passes through a safe path", () => {
    expect(resolveAuthRedirect("/dashboard")).toBe("/dashboard");
  });

  it("falls back to the default for anything unsafe or missing", () => {
    expect(resolveAuthRedirect("https://evil.com")).toBe(DEFAULT_POST_AUTH_REDIRECT);
    expect(resolveAuthRedirect("//evil.com")).toBe(DEFAULT_POST_AUTH_REDIRECT);
    expect(resolveAuthRedirect(undefined)).toBe(DEFAULT_POST_AUTH_REDIRECT);
  });
});
