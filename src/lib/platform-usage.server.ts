/** Privacy-limited first-party usage ingestion at Cloudflare's edge.
 * Visitor/session IDs are random UUIDs set only after explicit consent.
 * Do not store IPs, user accounts, full URLs, search terms or book titles.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AREAS = ["home","library","sacred_texts","reader","book","author","research","insights","other"] as const;
type Area = typeof AREAS[number];
type EdgeRequest = Request & { cf?: { country?: string; region?: string; regionCode?: string; botManagement?: { score?: number } } };
type UsageEnv = { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string };

export function parsePlatformUsage(request: Request, input: unknown): {
  visitor_id: string; session_id: string; country_code: string; region: string; area: Area;
} | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  if (typeof row["visitorId"] !== "string" || !UUID.test(row["visitorId"]) ||
    typeof row["sessionId"] !== "string" || !UUID.test(row["sessionId"]) ||
    typeof row["area"] !== "string" || !AREAS.includes(row["area"] as Area)) return null;
  const cf = (request as EdgeRequest).cf;
  const country = (cf?.country ?? "").toUpperCase();
  const rawRegion = cf?.region || cf?.regionCode || "";
  const region = rawRegion.trim().slice(0,64).replace(/[\u0000-\u001f]/g, "");
  return {
    visitor_id: row["visitorId"], session_id: row["sessionId"], area: row["area"] as Area,
    country_code: /^[A-Z]{2}$/.test(country) ? country : "ZZ",
    region: region || "Unknown",
  };
}

function supabaseHeaders(key: string) {
  const headers: Record<string,string> = {
    apikey: key, "content-type": "application/json", prefer: "return=minimal",
  };
  // Opaque sb_secret_ keys are apikey only, not JWT bearer credentials.
  if (!key.startsWith("sb_secret_")) headers["authorization"] = "Bearer " + key;
  return headers;
}
export async function handlePlatformUsageRequest(request: Request, envValue: unknown): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (request.method !== "POST") return new Response(null,{status:405,headers});
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
    return new Response(null,{status:403,headers});
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json"))
    return new Response(null,{status:415,headers});
  if (Number(request.headers.get("content-length") || "0") > 1024)
    return new Response(null,{status:413,headers});
  const ua = request.headers.get("user-agent") || "";
  const botScore = (request as EdgeRequest).cf?.botManagement?.score ?? 100;
  if (/bot|crawler|spider|headless|playwright|lighthouse|curl|wget/i.test(ua) || botScore < 20)
    return new Response(null,{status:204,headers});
  let content: string;
  try { content = await request.text(); } catch { return new Response(null,{status:400,headers}); }
  if (content.length > 1024) return new Response(null,{status:413,headers});
  let data: unknown;
  try { data = JSON.parse(content); } catch { return new Response(null,{status:400,headers}); }
  const event = parsePlatformUsage(request,data);
  if (!event) return new Response(null,{status:400,headers});
  const env = envValue as UsageEnv;
  if (!env?.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    return new Response(null,{status:503,headers});
  try {
    const response = await fetch(new URL("/rest/v1/platform_usage_events",env.SUPABASE_URL),{
      method:"POST", headers:supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
      body:JSON.stringify(event),
    });
    if (!response.ok) {
      console.error("[usage] storage unavailable",response.status);
      return new Response(null,{status:503,headers});
    }
    return new Response(null,{status:204,headers});
  } catch {
    return new Response(null,{status:503,headers});
  }
}
export async function prunePlatformUsage(envValue: unknown) {
  const env = envValue as UsageEnv;
  if (!env?.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const response = await fetch(new URL("/rest/v1/rpc/prune_platform_usage",env.SUPABASE_URL),{
    method:"POST",headers:supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY),body:"{}",
  });
  if (!response.ok) console.error("[usage] retention cleanup unavailable",response.status);
}
