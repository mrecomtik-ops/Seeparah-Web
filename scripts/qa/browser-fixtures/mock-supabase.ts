import { qaState, type ShelfKind, type ShelfRow } from "./mock-state";

// Deliberate in-memory transport stub; only the real production
// src/lib/shelves.ts algorithms decide cache reconciliation and fallback.
class ShelfQuery {
  private conditions: Record<string, string> = {};
  private deleting = false;
  select(_columns: string) { return this; }
  delete() { this.deleting = true; return this; }
  eq(column: string, value: string) { this.conditions[column] = value; return this; }
  then(resolve: (result: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    const result = !qaState.online
      ? { data: null, error: { message: "Synthetic browser offline" } }
      : this.deleting
        ? (() => {
          qaState.server = qaState.server.filter(row =>
            !Object.entries(this.conditions).every(([k, v]) => row[k as keyof ShelfRow] === v));
          return { data: null, error: null };
        })()
        : { data: qaState.server.filter(row =>
            Object.entries(this.conditions).every(([k, v]) => row[k as keyof ShelfRow] === v)), error: null };
    return Promise.resolve(result).then(resolve, reject);
  }
}
export const supabase = {
  from(table: string) {
    if (table !== "book_shelves") throw new Error("Fixture only supports shelves");
    return {
      select: (fields: string) => new ShelfQuery().select(fields),
      delete: () => new ShelfQuery().delete(),
      upsert: async (row: { user_id: string; book_id: string; shelf: ShelfKind }) => {
        if (!qaState.online) return { error: { message: "Synthetic browser offline" } };
        if (!qaState.server.some(item => item.user_id === row.user_id && item.book_id === row.book_id && item.shelf === row.shelf)) {
          qaState.server.push({ ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() });
        }
        return { error: null };
      },
    };
  },
};
