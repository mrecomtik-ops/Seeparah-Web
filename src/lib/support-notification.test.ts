import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, sendSupportNotificationEmail } from "@/lib/support-notification.server";

// A generic "looks like an email address" pattern — used to assert NO
// email address of any kind (real recipient, reply-to, anything) ever
// reaches a log line. This deliberately never contains the actual
// production recipient value, which must never appear in this repository
// at all, including in test fixtures — see the task's own constraint.
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.env["RESEND_API_KEY"] = "test-key";
  process.env["SUPPORT_NOTIFICATION_TO"] = "configured-recipient@internal.test";
  process.env["SUPPORT_NOTIFICATION_FROM"] = "noreply@seeparah.test";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>&"'</script>`)).toBe(
      "&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;",
    );
  });

  it("leaves ordinary text unchanged", () => {
    expect(escapeHtml("A normal subject line")).toBe("A normal subject line");
  });
});

describe("sendSupportNotificationEmail", () => {
  it("returns false and does not throw when not configured", async () => {
    delete process.env["RESEND_API_KEY"];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendSupportNotificationEmail({
      referenceCode: "SPRH-TESTCODE",
      requestKind: "ticket",
      category: "general_support",
      subject: "Test subject",
    });
    expect(result).toBe(false);
    for (const call of errorSpy.mock.calls) {
      const joined = call.map((c) => String(c)).join(" ");
      expect(joined).not.toMatch(EMAIL_PATTERN);
    }
  });

  it("recipient always comes from SUPPORT_NOTIFICATION_TO, never from the input — request data cannot override it", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await sendSupportNotificationEmail({
      referenceCode: "SPRH-TESTCODE",
      requestKind: "ticket",
      category: "general_support",
      subject: "Test subject",
      replyEmail: "reporter@example.com",
      // @ts-expect-error — deliberately probing that an extra field on the
      // input object can't influence who the email goes to; the function's
      // real type has no such parameter at all.
      to: "attacker-supplied@evil.example",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { to: string[]; from: string };
    expect(body.to).toEqual(["configured-recipient@internal.test"]);
    expect(body.from).toBe("noreply@seeparah.test");
  });

  it("escapes malicious input before building the HTML body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await sendSupportNotificationEmail({
      referenceCode: "SPRH-TESTCODE",
      requestKind: "ticket",
      category: "general_support",
      subject: `<img src=x onerror=alert(1)> Subject with "quotes"`,
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { html: string };
    expect(body.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(body.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("returns false, without throwing, when the provider call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 })) as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendSupportNotificationEmail({
      referenceCode: "SPRH-TESTCODE",
      requestKind: "ticket",
      category: "general_support",
      subject: "Test subject",
      replyEmail: "reporter@example.com",
    });
    expect(result).toBe(false);
    for (const call of errorSpy.mock.calls) {
      const joined = call.map((c) => String(c)).join(" ");
      expect(joined).not.toMatch(EMAIL_PATTERN);
    }
  });

  it("returns false, without throwing, when fetch itself throws (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const result = await sendSupportNotificationEmail({
      referenceCode: "SPRH-TESTCODE",
      requestKind: "ticket",
      category: "general_support",
      subject: "Test subject",
    });
    expect(result).toBe(false);
  });

  it("rejects a malformed reply-to instead of forwarding it unsafely", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await sendSupportNotificationEmail({
      referenceCode: "SPRH-TESTCODE",
      requestKind: "ticket",
      category: "general_support",
      subject: "Test subject",
      replyEmail: "not-a-real-email\r\nBcc: someone@else.example",
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["reply_to"]).toBeUndefined();
  });
});
