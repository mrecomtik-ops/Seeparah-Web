import { describe, expect, it, vi } from "vitest";

// Same minimal chainable-query-builder mock pattern as
// src/lib/library.publishBook.test.ts — see that file's own comment for
// the full rationale.
interface ScriptEntry {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

interface MockChain {
  insert(payload: unknown): MockChain;
  update(payload: unknown): MockChain;
  select(...args: unknown[]): MockChain;
  eq(...args: unknown[]): MockChain;
  single(): Promise<ScriptEntry>;
  then<T>(resolve: (value: ScriptEntry) => T, reject: (error: unknown) => T): Promise<T>;
}

function makeMockSupabase(script: ScriptEntry[]) {
  let i = 0;
  const next = (): ScriptEntry => {
    if (i >= script.length) {
      throw new Error(`Mock supabase: ran out of scripted responses after ${i} call(s)`);
    }
    return script[i++]!;
  };
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();

  function chain(): MockChain {
    const builder: MockChain = {
      insert: (payload: unknown) => {
        insertSpy(payload);
        return builder;
      },
      update: (payload: unknown) => {
        updateSpy(payload);
        return builder;
      },
      select: () => builder,
      eq: () => builder,
      single: async () => next(),
      then: (resolve, reject) => Promise.resolve(next()).then(resolve, reject),
    };
    return builder;
  }

  return {
    supabaseAdmin: { from: () => chain() },
    insertSpy,
    updateSpy,
  };
}

let mock: ReturnType<typeof makeMockSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return mock.supabaseAdmin;
  },
}));

const { submitTicketAndNotify } = await import("@/lib/admin/support.server");

const BASE_PARAMS = {
  userId: null,
  contactEmail: "reporter@example.com",
  subject: "Test subject",
  description: "Test description",
  category: "general_support" as const,
  requestKind: "ticket" as const,
};

describe("submitTicketAndNotify", () => {
  it("stores the ticket and records notification_status='sent' when notify succeeds", async () => {
    mock = makeMockSupabase([
      { data: { id: "ticket-1" }, error: null }, // insert().select().single()
      { data: null, error: null }, // update().eq() for setNotificationStatus
    ]);
    const notify = vi.fn().mockResolvedValue(true);

    const result = await submitTicketAndNotify({ ...BASE_PARAMS, notify });

    expect(result.ticketId).toBe("ticket-1");
    expect(result.referenceCode).toMatch(/^SPRH-/);
    expect(notify).toHaveBeenCalledWith(result.referenceCode);
    expect(mock.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ notification_status: "sent" }),
    );
  });

  it("still stores the ticket, still returns a real reference code, and records 'failed' — never loses the request — when notify returns false", async () => {
    mock = makeMockSupabase([
      { data: { id: "ticket-2" }, error: null },
      { data: null, error: null },
    ]);
    const notify = vi.fn().mockResolvedValue(false);

    const result = await submitTicketAndNotify({ ...BASE_PARAMS, notify });

    expect(mock.insertSpy).toHaveBeenCalledTimes(1);
    expect(result.ticketId).toBe("ticket-2");
    expect(result.referenceCode).toMatch(/^SPRH-/);
    expect(mock.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ notification_status: "failed" }),
    );
  });

  it("still stores the ticket and records 'failed' — never loses the request — when notify THROWS", async () => {
    mock = makeMockSupabase([
      { data: { id: "ticket-3" }, error: null },
      { data: null, error: null },
    ]);
    const notify = vi.fn().mockRejectedValue(new Error("Resend is down"));

    const result = await expect(
      submitTicketAndNotify({ ...BASE_PARAMS, notify }),
    ).resolves.toMatchObject({ ticketId: "ticket-3" });
    void result;
    expect(mock.insertSpy).toHaveBeenCalledTimes(1);
    expect(mock.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ notification_status: "failed" }),
    );
  });

  it("passes structuredData through to storage untouched", async () => {
    mock = makeMockSupabase([
      { data: { id: "ticket-4" }, error: null },
      { data: null, error: null },
    ]);
    const structuredData = { claimantName: "Test Claimant", signature: "Test Claimant" };

    await submitTicketAndNotify({
      ...BASE_PARAMS,
      structuredData,
      notify: vi.fn().mockResolvedValue(true),
    });

    expect(mock.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ structured_data: structuredData }),
    );
  });
});
