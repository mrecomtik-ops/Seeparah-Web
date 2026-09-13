import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminWhoAmI } from "@/lib/admin/session.functions";
import type { AdminRole, Capability } from "@/lib/admin/permissions";

export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Sign in required");
  return t;
}

export interface AdminSession {
  signedIn: boolean;
  role: AdminRole | null;
  mfaSatisfied: boolean;
  capabilities: Capability[];
}

export function useAdminSession() {
  return useQuery<AdminSession>({
    queryKey: ["admin-whoami"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken)
        return { signedIn: false, role: null, mfaSatisfied: false, capabilities: [] };
      return adminWhoAmI({ data: { accessToken } });
    },
    staleTime: 15_000,
  });
}

export function can(session: AdminSession | undefined, capability: Capability): boolean {
  return session?.capabilities.includes(capability) ?? false;
}
