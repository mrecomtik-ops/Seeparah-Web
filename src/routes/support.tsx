import { createFileRoute, redirect } from "@tanstack/react-router";

// /legal is the source of truth for all legal/support content -- this is
// a redirect-only route, not a duplicate page, for the old pre-/legal URL.
export const Route = createFileRoute("/support")({
  beforeLoad: () => {
    throw redirect({ to: "/legal", hash: "support", statusCode: 301 });
  },
});
