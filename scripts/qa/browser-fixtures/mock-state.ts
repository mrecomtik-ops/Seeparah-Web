export type ShelfKind = "saved" | "favorite" | "want_to_read";
export type ShelfRow = { id: string; user_id: string; book_id: string; shelf: ShelfKind; created_at: string };
export const qaState = {
  userId: "reader-alpha",
  online: true,
  server: [] as ShelfRow[],
  cached: [] as ShelfRow[],
  events: [] as string[],
};
const subscribers = new Set<() => void>();
export const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
};
export const readUser = () => qaState.userId;
export function switchUser(user: string) {
  qaState.userId = user;
  for (const callback of subscribers) callback();
}
