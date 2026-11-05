import { useEffect, useState } from "react";

/* Random, first-party IDs only after explicit consent. They do not encode
 * an account, IP address, content, email or other personal details. */
export const CONSENT_KEY="seeparah:analytics-consent";
const VISITOR_KEY="seeparah:anonymous-visitor";
const SESSION_KEY="seeparah:anonymous-session";
const LAST_PAGE_KEY="seeparah:anonymous-last-page";
const SESSION_TTL=30*60*1000;
export type UsageConsent="allow"|"deny"|null;

export function usageArea(path: string) {
  if (path.startsWith("/admin") || path.startsWith("/auth")) return null;
  if (path==="/") return "home";
  if (path.startsWith("/read/")) return "reader";
  if (path.startsWith("/library")) return "library";
  if (path.startsWith("/sacred-texts")) return "sacred_texts";
  if (path.startsWith("/book/")) return "book";
  if (path.startsWith("/author")) return "author";
  if (path.startsWith("/research")) return "research";
  if (path.startsWith("/insights")) return "insights";
  return "other";
}
export function privacySignalActive() {
  return navigator.doNotTrack==="1" ||
    (navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true ||
    navigator.webdriver===true;
}
export function readUsageConsent(): UsageConsent {
  if (privacySignalActive()) return "deny";
  try { const v=localStorage.getItem(CONSENT_KEY);return v==="allow"||v==="deny"?v:null; }
  catch { return "deny"; }
}
export function setUsageConsent(value:"allow"|"deny") {
  if (privacySignalActive() && value==="allow") return;
  try {
    localStorage.setItem(CONSENT_KEY,value);
    if(value==="deny"){
      localStorage.removeItem(VISITOR_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(LAST_PAGE_KEY);
    }
    window.dispatchEvent(new Event("seeparah:usage-consent-changed"));
  } catch { /* No analytics storage available; never block navigation. */ }
}
function sendPageView(path: string) {
  const area=usageArea(path);
  if(!area || document.visibilityState!=="visible") return;
  try {
    let visitorId=localStorage.getItem(VISITOR_KEY);
    if(!visitorId){visitorId=crypto.randomUUID();localStorage.setItem(VISITOR_KEY,visitorId);}
    const now=Date.now();
    const raw=sessionStorage.getItem(SESSION_KEY);
    let session:{id:string;at:number}={id:"",at:0};
    try { if(raw) session=JSON.parse(raw) as {id:string;at:number}; } catch { /* new session */ }
    if(!session.id || !Number.isFinite(session.at) || now-session.at>SESSION_TTL || session.at>now)
      session={id:crypto.randomUUID(),at:now};
    else session.at=now;
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
    const signature=path+":"+session.id;
    const previous=sessionStorage.getItem(LAST_PAGE_KEY);
    if(previous) {
      try {
        const p=JSON.parse(previous) as {signature:string;at:number};
        if(p.signature===signature && now-p.at<8000) return;
      } catch { /* re-send */ }
    }
    sessionStorage.setItem(LAST_PAGE_KEY,JSON.stringify({signature,at:now}));
    const body=JSON.stringify({visitorId,sessionId:session.id,area});
    const blob=new Blob([body],{type:"application/json"});
    if(!navigator.sendBeacon?.("/api/platform-usage",blob))
      void fetch("/api/platform-usage",{method:"POST",headers:{"content-type":"application/json"},body,keepalive:true});
  } catch { /* Tracking must never interrupt reading. */ }
}

export function PlatformUsageTracker({pathname}:{pathname:string}) {
  const [consent,setConsent]=useState<UsageConsent>("deny");
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const update=()=>setConsent(readUsageConsent());
    update();
    setReady(true);
    window.addEventListener("seeparah:usage-consent-changed",update);
    return()=>window.removeEventListener("seeparah:usage-consent-changed",update);
  },[]);
  useEffect(()=>{
    if(!ready || consent!=="allow") return;
    sendPageView(pathname);
  },[pathname,consent,ready]);
  if(!ready || consent!==null || !usageArea(pathname)) return null;
  return <section aria-label="Anonymous visitor statistics choice"
    className="fixed bottom-4 left-3 z-[65] w-[min(21rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-4 shadow-xl">
    <p className="text-sm font-semibold text-foreground">Help improve Seeparah</p>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
      May we count anonymous page visits and return visits by country or region?
      No IP addresses, emails or book titles are stored in these statistics.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={()=>setUsageConsent("allow")}
        className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
        Allow anonymous stats
      </button>
      <button type="button" onClick={()=>setUsageConsent("deny")}
        className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">
        No thanks
      </button>
    </div>
    <a href="/legal#privacy" className="mt-2 inline-block text-xs text-muted-foreground underline">Privacy details</a>
  </section>;
}