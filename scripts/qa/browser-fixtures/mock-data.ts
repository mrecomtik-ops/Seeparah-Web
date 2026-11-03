import { qaState, type ShelfKind, type ShelfRow } from "./mock-state";
export type { ShelfKind, ShelfRow };
export const GENRES = ["Fiction", "History", "Poetry"];
export const demoStore = {
  getShelves: () => [...qaState.cached],
  setShelves: (rows: ShelfRow[]) => { qaState.cached = [...rows]; },
  getReadingDays: () => [] as string[],
  setReadingDays: (_days: string[]) => {},
};
