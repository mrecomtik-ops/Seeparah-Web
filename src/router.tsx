import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Explicit defaults, not React Query's own (staleTime: 0, retry: 3) --
  // with the app moving to Cloudflare Workers' free tier, every one of
  // those 3 retries on a failing query is a separate Worker invocation,
  // and staleTime: 0 means every single mount/remount/window-refocus of
  // any query anywhere in the app refetches immediately. Neither default
  // is dangerous, both are wasteful: a 15s staleTime still means any
  // genuinely new page view/action gets fresh data (nothing here serves
  // data older than 15s as if it were live), and one retry still
  // recovers from an ordinary single dropped request without turning a
  // real outage into 4x the request volume. Individual queries that
  // legitimately need different behavior (e.g. useAdminSession's own
  // 15s staleTime, admin/health's 30s refetchInterval) already set their
  // own options, which override these unchanged.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
