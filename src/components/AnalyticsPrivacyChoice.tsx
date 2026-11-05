import { useEffect, useState } from "react";
import {
  privacySignalActive, readUsageConsent, setUsageConsent, type UsageConsent,
} from "@/components/PlatformUsageTracker";

/** Inline privacy settings: users can change their mind at any time. */
export function AnalyticsPrivacyChoice() {
  const [choice,setChoice]=useState<UsageConsent>(null);
  const [disabled,setDisabled]=useState(false);
  useEffect(()=>{
    setChoice(readUsageConsent());
    setDisabled(privacySignalActive());
  },[]);
  return <div className="mt-3 rounded-xl border border-border bg-card p-4">
    <p className="font-semibold text-foreground">Anonymous usage statistics</p>
    <p className="mt-1 text-xs text-muted-foreground">
      Current choice: {disabled?"Disabled by browser privacy settings":
        choice==="allow"?"Allowed":choice==="deny"?"Declined":"Not selected"}.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={()=>{setUsageConsent("allow");setChoice(readUsageConsent());}}
        className="min-h-10 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground disabled:opacity-40">
        Allow anonymous stats
      </button>
      <button type="button" onClick={()=>{setUsageConsent("deny");setChoice("deny");}}
        className="min-h-10 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground">
        Withdraw consent
      </button>
    </div>
  </div>;
}
