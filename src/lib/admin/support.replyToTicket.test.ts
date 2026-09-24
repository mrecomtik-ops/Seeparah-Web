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

const { replyToTicket, getTicketContactInfo } = await import("@/lib/admin/support.server");

const TICKET_ROW = {
  id: "ticket-1",
  contact_email: "requester@example.com",
  reference_code: "SPRH-ABCDEFGH",
  subject: "Original subject",
};

describe("getTicketContactInfo", () => {
  it("returns exactly the stored contact_email — the only thing a reply can ever be sent to", async () => {
    mock = makeMockSupabase([{ data: TICKET_ROW, error: null }]);
    const info = await getTicketContactInfo("ticket-1");
    expect(info.contactEmail).toBe("requester@example.com");
    expect(info.referenceCode).toBe("SPRH-ABCDEFGH");
  });
});

describe("replyToTicket", () => {
  it("notifies using the ticket's own stored contactEmail, regardless of anything else supplied", async () => {
    mock = makeMockSupabase([
      { data: TICKET_ROW, error: null }, // getTicketContactInfo
      { data: { id: "note-1" }, error: null }, // addTicketNote insert
      { data: null, error: null }, // addTicketNote's trailing updated_at touch
    ]);
    const notify = vi.fn().mockResolvedValue(true);

    const result = await replyToTicket({
      ticketId: "ticket-1",
      authorId: "admin-1",
      body: "Here's the answer to your question.",
      notify,
    });

    expect(notify).toHaveBeenCalledWith("requester@example.com", "SPRH-ABCDEFGH", "Original subject");
    expect(result.delivered).toBe(true);
  });

  it("refuses with a clear error when the ticket has no reply email on file, without ever calling notify", async () => {
    mock = makeMockSupabase([{ data: { ...TICKET_ROW, contact_email: null }, error: null }]);
    const notify = vi.fn().mockResolvedValue(true);

    await expect(
      replyToTicket({ ticketId: "ticket-1", authorId: "admin-1", body: "x", notify }),
    ).rejects.toThrow("no reply email on file");
    expect(notify).not.toHaveBeenCalled();
  });

  it("still records the note (never loses the admin's reply text) when notify returns false", async () => {
    mock = makeMockSupabase([
      { data: TICKET_ROW, error: null },
      { data: { id: "note-2" }, error: null },
      { data: null, error: null },
    ]);
    const notify = vi.fn().mockResolvedValue(false);

    const result = await replyToTicket({
      ticketId: "ticket-1",
      authorId: "admin-1",
      body: "This reply's delivery will fail.",
      notify,
    });

    expect(result.delivered).toBe(false);
    expect(mock.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "This reply's delivery will fail.",
        visibility: "public",
        delivery_status: "failed",
      }),
    );
  });

  it("still records the note with delivery_status='failed' when notify THROWS", async () => {
    mock = makeMockSupabase([
      { data: TICKET_ROW, error: null },
      { data: { id: "note-3" }, error: null },
      { data: null, error: null },
    ]);
    const notify = vi.fn().mockRejectedValue(new Error("Resend is down"));

    const result = await replyToTicket({
      ticketId: "ticket-1",
      authorId: "admin-1",
      body: "This one throws.",
      notify,
    });

    expect(result.delivered).toBe(false);
    expect(mock.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "failed" }),
    );
  });

  it("records delivery_status='sent' on success", async () => {
    mock = makeMockSupabase([
      { data: TICKET_ROW, error: null },
      { data: { id: "note-4" }, error: null },
      { data: null, error: null },
    ]);
    await replyToTicket({
      ticketId: "ticket-1",
      authorId: "admin-1",
      body: "Delivered fine.",
      notify: vi.fn().mockResolvedValue(true),
    });
    expect(mock.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "sent" }),
    );
  });
});
