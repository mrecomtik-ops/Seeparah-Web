import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Globe2, Loader2, RefreshCw } from "lucide-react";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminGetPlatformUsageReport, type UsageReport } from "@/lib/admin/platform-analytics.functions";

export const Route=createFileRoute("/admin/analytics")({component:AdminVisitorAnalytics});

const number=(value:number)=>value.toLocaleString("en-US");
export function countryLabel(code:string) {
  if(code==="ZZ") return "Unknown";
  try { return new Intl.DisplayNames(["en"],{type:"region"}).of(code) ?? code; }
  catch { return code; }
}
const AREA_NAMES:Record<string,string>={
  home:"Homepage",library:"Library",sacred_texts:"Sacred texts",reader:"Reading room",
  book:"Book details",author:"Authors",research:"Research",insights:"Insights",other:"Other",
};
function saveCsv(report:UsageReport) {
  const rows:(string|number)[][]=[
    ["Seeparah anonymous usage",report.days+" days"],
    ["Metric","Value"],
    ["Page views",report.pageViews],["Visits",report.sessions],
    ["Unique browsers",report.uniqueVisitors],["Returning browsers",report.returningVisitors],
    ["Repeat visits",report.repeatSessions],["Reading visits",report.readingSessions],
    [],["Country","Unique browsers","Visits","Page views"],
    ...report.countries.map(x=>[countryLabel(x.country),x.visitors,x.sessions,x.pageViews]),
    [],["Country","Region","Unique browsers","Visits","Page views"],
    ...report.regions.map(x=>[countryLabel(x.country),x.region,x.visitors,x.sessions,x.pageViews]),
    [],["Date (UTC)","Unique browsers","Visits","Page views"],
    ...report.daily.map(x=>[x.date,x.visitors,x.sessions,x.pageViews]),
  ];
  const quote=(x:string|number)=>'"'+String(x).replace(/"/g,'""')+'"';
  const csv=rows.map(row=>row.map(quote).join(",")).join("\r\n");
  const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="seeparah-usage-"+report.days+"-days.csv";a.click();URL.revokeObjectURL(url);
}
function AdminVisitorAnalytics() {
  const [days,setDays]=useState<7|30|90>(30);
  const query=useQuery({
    queryKey:["admin-platform-usage",days],
    queryFn:async()=>adminGetPlatformUsageReport({data:{accessToken:await getAccessToken(),days}}),
    staleTime:60_000,
  });
  const data=query.data;
  const returnRate=data?.uniqueVisitors?Math.round(100*data.returningVisitors/data.uniqueVisitors):0;
  const maxVisits=Math.max(1,...(data?.daily.map(x=>x.sessions)??[]));
  const cards=data?[
    {name:"Page views",value:data.pageViews,note:"Tracked page openings"},
    {name:"Visits",value:data.sessions,note:"30-minute idle session threshold"},
    {name:"Unique visitors",value:data.uniqueVisitors,note:"Consenting browsers"},
    {name:"Returning visitors",value:data.returningVisitors,note:returnRate+"% returned in this period"},
    {name:"Repeat visits",value:data.repeatSessions,note:"Additional sessions beyond the first"},
    {name:"Reading visits",value:data.readingSessions,note:"Visits that opened a reading room"},
  ]:[];
  return <main>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Visitor analytics</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          World traffic, regions, return visits and most-used platform areas.
          Aggregated anonymous statistics only — no individual visitor records.
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" aria-label="Refresh analytics" onClick={()=>void query.refetch()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium">
          <RefreshCw className="h-4 w-4"/> Refresh
        </button>
        <button type="button" disabled={!data} onClick={()=>{if(data)saveCsv(data);}}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Download className="h-4 w-4"/> Export CSV
        </button>
      </div>
    </div>
    <div role="group" aria-label="Analytics date range" className="mt-5 flex flex-wrap items-center gap-2">
      {([7,30,90] as const).map(v=><button type="button" key={v} onClick={()=>setDays(v)} aria-pressed={days===v}
        className={"min-h-10 rounded-full border px-4 text-sm font-semibold "+(days===v?"border-primary bg-primary text-primary-foreground":"border-border bg-card text-foreground")}>
        {v} days
      </button>)}
      <span className="text-xs text-muted-foreground">Dates use UTC.</span>
    </div>

    {query.isPending?<div role="status" className="flex min-h-44 items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Loading visitor statistics…</div>:
    query.isError?<p role="alert" className="mt-6 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">
      Could not load the statistics. Check the active admin MFA session and database migration.
    </p>:data?<>
      <section aria-label="Traffic totals" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(card=><article key={card.name} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground">{card.name}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{number(card.value)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
        </article>)}
      </section>
      <p className="mt-4 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Only visitors who allow anonymous usage statistics are counted. Tracking began with
        this feature and cannot backfill historical sessions. Countries/regions come from
        Cloudflare; unknown locations are shown as unknown. Counts represent browsers rather
        than guaranteed unique people. No IP addresses, account IDs, search queries or book
        titles are retained. Events older than {data.retentionDays} days are removed.
        {data.trackingSince&&(" First recorded visit: "+new Date(data.trackingSince).toLocaleString()+".")}
      </p>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Daily visits</h2>
        <p className="text-xs text-muted-foreground">Count of sessions on each calendar day (UTC).</p>
        {data.daily.length===0?<p className="py-8 text-center text-sm text-muted-foreground">No opted-in usage yet.</p>:
        <div className="mt-4 space-y-2">{data.daily.map(day=><div key={day.date}
          className="grid grid-cols-[6rem_minmax(0,1fr)_3rem] items-center gap-3 text-xs">
          <span className="tabular-nums text-muted-foreground">{day.date}</span>
          <div role="img" aria-label={day.date+": "+day.sessions+" visits"} className="h-4 overflow-hidden rounded-full bg-secondary">
            <div className="h-4 rounded-full bg-primary" style={{width:String(Math.max(1,day.sessions*100/maxVisits))+"%"}}/>
          </div>
          <span className="text-right font-semibold tabular-nums">{number(day.sessions)}</span>
        </div>)}</div>}
      </section>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Globe2 className="h-4 w-4"/> Countries</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 text-left">Country</th><th className="py-2 text-right">Visitors</th><th className="py-2 text-right">Visits</th><th className="py-2 text-right">Views</th>
              </tr></thead>
              <tbody>{data.countries.map(row=><tr key={row.country} className="border-b border-border/50 last:border-0">
                <td className="py-2">{countryLabel(row.country)}</td>
                <td className="py-2 text-right tabular-nums">{number(row.visitors)}</td>
                <td className="py-2 text-right tabular-nums">{number(row.sessions)}</td>
                <td className="py-2 text-right tabular-nums">{number(row.pageViews)}</td>
              </tr>)}</tbody>
            </table>
            {data.countries.length===0&&<p className="py-7 text-center text-xs text-muted-foreground">No country data yet.</p>}
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">Regions</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 text-left">Country · region</th><th className="py-2 text-right">Visitors</th><th className="py-2 text-right">Visits</th><th className="py-2 text-right">Views</th>
              </tr></thead>
              <tbody>{data.regions.map((row,i)=><tr key={row.country+":"+row.region+":"+i} className="border-b border-border/50 last:border-0">
                <td className="py-2">{countryLabel(row.country)+" · "+row.region}</td>
                <td className="py-2 text-right tabular-nums">{number(row.visitors)}</td>
                <td className="py-2 text-right tabular-nums">{number(row.sessions)}</td>
                <td className="py-2 text-right tabular-nums">{number(row.pageViews)}</td>
              </tr>)}</tbody>
            </table>
            {data.regions.length===0&&<p className="py-7 text-center text-xs text-muted-foreground">No region data yet.</p>}
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Most-used sections</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.areas.map(row=><div key={row.area} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 p-3 text-sm">
            <span className="font-medium">{AREA_NAMES[row.area]??row.area}</span><span className="tabular-nums text-muted-foreground">{number(row.pageViews)} views</span>
          </div>)}
          {data.areas.length===0&&<p className="text-xs text-muted-foreground">No usage data yet.</p>}
        </div>
      </section>
    </>:null}
  </main>;
}
