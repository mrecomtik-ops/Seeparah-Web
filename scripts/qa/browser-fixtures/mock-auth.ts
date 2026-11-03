import { useSyncExternalStore } from "react";
import { readUser, subscribe } from "./mock-state";
export function useAuth() {
  const userId = useSyncExternalStore(subscribe, readUser, readUser);
  return { userId, loading: false };
}
