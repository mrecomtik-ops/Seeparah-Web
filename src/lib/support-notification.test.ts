import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  escapeHtml,
  sendSupportNotificationEmail,
  sendTicketReplyEmail,
} from "@/lib/support-notification.server";

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
    const body = JSON.parse(init.body as string) as {
      to: string[];
      from: string;
      reply_to?: string;
    };
    expect(body.to).toEqual(["configured-recipient@internal.test"]);
    expect(body.from).toBe("noreply@seeparah.test");
    // reply_to IS the validated requester address — this is item 1's own
    // fix: so a reply from the internal inbox goes to the requester, not
    // to the notification sender address. Confirms it's actually wired,
    // not just that malformed input is rejected (covered separately below).
    expect(body.reply_to).toBe("reporter@example.com");
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

describe("sendTicketReplyEmail — the admin 'Reply to requester' send", () => {
  it("sends to exactly the given ticket contact address, from SUPPORT_NOTIFICATION_FROM, with the reference code in the subject", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await sendTicketReplyEmail({
      to: "requester@example.com",
      referenceCode: "SPRH-ABCDEFGH",
      subject: "Can't sign in",
      body: "Here is how to fix it.",
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      to: string[];
      from: string;
      subject: string;
    };
    expect(body.to).toEqual(["requester@example.com"]);
    expect(body.from).toBe("noreply@seeparah.test");
    expect(body.subject).toContain("SPRH-ABCDEFGH");
  });

  it("SUPPORT_NOTIFICATION_TO never appears anywhere in the outgoing request, even though it's configured in env", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await sendTicketReplyEmail({
      to: "requester@example.com",
      referenceCode: "SPRH-ABCDEFGH",
      subject: "Test",
      body: "Test body",
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const rawBody = init.body as string;
    expect(rawBody).not.toContain(process.env["SUPPORT_NOTIFICATION_TO"] as string);
    // Also: the function reads no such field into `to` at all — `to` here
    // is exactly the address passed in, which callers derive only from
    // the ticket's own stored contact_email (see
    // support.replyToTicket.test.ts), never from SUPPORT_NOTIFICATION_TO.
  });

  it("escapes malicious admin-provided body content before building the HTML", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await sendTicketReplyEmail({
      to: "requester@example.com",
      referenceCode: "SPRH-ABCDEFGH",
      subject: `<script>alert(1)</script>`,
      body: `<img src=x onerror=alert(1)> "quoted"`,
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { html: string };
    expect(body.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(body.html).not.toContain("<script>alert(1)</script>");
    expect(body.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("rejects an invalid recipient rather than sending to it", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendTicketReplyEmail({
      to: "not-an-email\r\nBcc: someone@else.example",
      referenceCode: "SPRH-ABCDEFGH",
      subject: "Test",
      body: "Test",
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      expect(call.map((c) => String(c)).join(" ")).not.toMatch(EMAIL_PATTERN);
    }
  });

  it("returns false without throwing when not configured, logging no address", async () => {
    delete process.env["SUPPORT_NOTIFICATION_FROM"];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendTicketReplyEmail({
      to: "requester@example.com",
      referenceCode: "SPRH-ABCDEFGH",
      subject: "Test",
      body: "Test",
    });

    expect(result).toBe(false);
    for (const call of errorSpy.mock.calls) {
      expect(call.map((c) => String(c)).join(" ")).not.toMatch(EMAIL_PATTERN);
    }
  });

  it("returns false without throwing when the provider call fails, logging no address or body", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 })) as unknown as typeof fetch;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendTicketReplyEmail({
      to: "requester@example.com",
      referenceCode: "SPRH-ABCDEFGH",
      subject: "Test",
      body: "Sensitive reply content that must never be logged.",
    });

    expect(result).toBe(false);
    for (const call of errorSpy.mock.calls) {
      const joined = call.map((c) => String(c)).join(" ");
      expect(joined).not.toMatch(EMAIL_PATTERN);
      expect(joined).not.toContain("Sensitive reply content");
    }
  });
});
