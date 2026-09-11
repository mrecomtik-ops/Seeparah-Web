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
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (mounted) setUser(data.user ?? null);
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
