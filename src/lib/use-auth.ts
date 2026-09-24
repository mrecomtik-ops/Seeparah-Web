import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_USER_ID } from "@/lib/library";

export interface AuthState {
  user: User | null;
  userId: string;
  displayName: string;
  isDemo: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // getSession(), not getUser(): getUser() makes a real network request
    // to re-verify the JWT against Supabase's auth server, which can fail
    // from a transient connectivity blip -- especially likely on a cold,
    // direct page load, the exact case this was found from. The old code
    // swallowed that failure (.catch(() => {})) and left `user` at its
    // initial `null`, making isDemo true even though the browser held a
    // perfectly valid session the whole time -- a signed-in admin hitting
    // /admin directly could see "Sign in required" for no reason beyond
    // that one request being slow or flaky, self-correcting only once a
    // later auth event (e.g. a token refresh) happened to fire.
    // getSession() reads the locally persisted session -- no network call,
    // so no request to fail. It's not a weaker check: both getSession()
    // and getUser() await the same internal initializePromise inside
    // supabase-js before resolving (confirmed in @supabase/auth-js's
    // GoTrueClient source), so neither can return a premature/incomplete
    // result depending on when it's called relative to the client
    // restoring a session from storage. This is a client-side UI-presence
    // decision only, same as before -- every actual admin action still
    // re-verifies the token and role server-side via requireAdmin(),
    // unchanged.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setUser(data.session?.user ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ??
    user?.email ??
    "Demo Reader";

  return {
    user,
    userId: user?.id ?? DEMO_USER_ID,
    displayName,
    isDemo: !user,
    loading,
  };
}

export async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch {
    // already signed out
  }
}
