import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";

export const usageReportSchema = z.object({
  days:z.number(), pageViews:z.number(),sessions:z.number(),uniqueVisitors:z.number(),
  returningVisitors:z.number(),repeatSessions:z.number(),readingSessions:z.number(),
  trackingSince:z.string().nullable(),retentionDays:z.number(),
  daily:z.array(z.object({date:z.string(),pageViews:z.number(),sessions:z.number(),visitors:z.number()})),
  countries:z.array(z.object({country:z.string(),pageViews:z.number(),sessions:z.number(),visitors:z.number()})),
  regions:z.array(z.object({country:z.string(),region:z.string(),pageViews:z.number(),sessions:z.number(),visitors:z.number()})),
  areas:z.array(z.object({area:z.string(),pageViews:z.number(),sessions:z.number()})),
});
export type UsageReport=z.infer<typeof usageReportSchema>;

export const adminGetPlatformUsageReport = createServerFn({method:"POST"})
  .validator((value)=>z.object({
    accessToken:z.string().min(1),
    days:z.union([z.literal(7),z.literal(30),z.literal(90)]).default(30),
  }).parse(value))
  .handler(async ({data})=>{
    // Reuse Seeparah's server-side active admin role and MFA gate.
    await requireAdmin(data.accessToken,"health.read");
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as unknown as {
      rpc(name:string,args:{p_days:number}):Promise<{data:unknown;error:{message:string}|null}>;
    };
    const result=await db.rpc("platform_usage_report",{p_days:data.days});
    if(result.error) throw new Error("Could not load private visitor analytics");
    return usageReportSchema.parse(result.data);
  });
