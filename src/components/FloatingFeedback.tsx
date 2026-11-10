import { useEffect, useId, useState, type FormEvent } from "react";
import { Lightbulb, Loader2, MessageCircleQuestion, MessageSquareWarning, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitSupportRequest } from "@/lib/admin/support.functions";

type Mode = "issue"|"suggestion";
type Audience = "reader"|"author"|"visitor";
const field="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const label="block text-xs font-semibold text-foreground";

/** Site-wide, including the full-page book and sacred-text readers. */
export function FloatingFeedback({bare}:{bare:boolean}) {
  const id=useId();
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<Mode>("issue");
  const [audience,setAudience]=useState<Audience>("reader");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [subject,setSubject]=useState("");
  const [message,setMessage]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [honeypot,setHoneypot]=useState("");
  const [busy,setBusy]=useState(false);
  const [reference,setReference]=useState<string|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!open) return;
    const keydown=(e:KeyboardEvent)=>{if(e.key==="Escape" && !busy) setOpen(false);};
    document.addEventListener("keydown",keydown);
    return()=>document.removeEventListener("keydown",keydown);
  },[open,busy]);
  function choose(next:Mode) {
    setMode(next);setReference(null);setError("");setOpen(true);
  }
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(!confirmed || busy) return;
    setBusy(true);setError("");
    try {
      const auth=await supabase.auth.getSession();
      const result=await submitSupportRequest({data:{
        requestType:mode==="issue"?"technical_issue":"platform_suggestion",
        fullName:name.trim(),
        replyEmail:email.trim(),
        subject:subject.trim(),
        message:message.trim(),
        pageUrl:window.location.origin+window.location.pathname,
        audience,
        confirmedAccurate:true,
        honeypot:honeypot||undefined,
        accessToken:auth.data.session?.access_token,
      }});
      setReference(result.referenceCode);
      setName("");setEmail("");setSubject("");setMessage("");setConfirmed(false);
    } catch {
      setError("We could not submit your message. Please try again or use Legal & support.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <button type="button" aria-expanded={open} aria-label="Open support tickets and suggestions"
      onClick={()=>open?setOpen(false):choose("issue")}
      className={"seeparah-floating-feedback fixed right-3 z-[70] flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xl hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring "+(bare?"bottom-14":"bottom-5")}>
      <MessageCircleQuestion className="h-5 w-5" aria-hidden="true"/>
      <span>Help & ideas</span>
    </button>
    {open && <div className="seeparah-floating-feedback fixed inset-0 z-[80] flex items-end justify-end bg-black/40 p-3 sm:p-5"
      onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
      <section role="dialog" aria-modal="true" aria-labelledby={id+"-title"}
        className="w-full max-w-md max-h-[min(85dvh,700px)] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={id+"-title"} className="font-display text-lg font-semibold text-foreground">Help improve Seeparah</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">For readers, authors and visitors.</p>
          </div>
          <button type="button" onClick={()=>setOpen(false)} aria-label="Close feedback"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-foreground hover:bg-secondary"><X className="h-5 w-5"/></button>
        </div>
        <div role="group" aria-label="Feedback type" className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={mode==="issue"} onClick={()=>choose("issue")}
            className={"flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold "+(mode==="issue"?"border-primary bg-primary/10 text-foreground":"border-border text-muted-foreground")}>
            <MessageSquareWarning className="h-4 w-4"/> Report issue
          </button>
          <button type="button" aria-pressed={mode==="suggestion"} onClick={()=>choose("suggestion")}
            className={"flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold "+(mode==="suggestion"?"border-primary bg-primary/10 text-foreground":"border-border text-muted-foreground")}>
            <Lightbulb className="h-4 w-4"/> Suggest idea
          </button>
        </div>
        {reference?<div role="status" className="mt-5 rounded-xl border border-border bg-secondary/40 p-4 text-sm text-foreground">
          <p className="font-semibold">{mode==="issue"?"Your support ticket was created.":"Thank you for your suggestion."}</p>
          <p className="mt-2">Reference: <span className="font-mono font-bold">{reference}</span></p>
          <p className="mt-2 text-xs text-muted-foreground">Your message is now in the private admin queue. Keep this reference to follow up.</p>
          <button type="button" onClick={()=>setOpen(false)} className="mt-3 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Close</button>
        </div>:<form onSubmit={(e)=>void submit(e)} className="mt-3 space-y-3">
          <input type="text" value={honeypot} onChange={(e)=>setHoneypot(e.target.value)}
            tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true"/>
          {mode==="suggestion"&&<label className={label}>I’m a
            <select className={field} value={audience} onChange={(e)=>setAudience(e.target.value as Audience)}>
              <option value="reader">Reader</option>
              <option value="author">Author</option>
              <option value="visitor">Visitor</option>
            </select>
          </label>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={label}>Your name
              <input className={field} required maxLength={200} autoComplete="name" value={name} onChange={(e)=>setName(e.target.value)}/>
            </label>
            <label className={label}>Reply email
              <input className={field} type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)}/>
            </label>
          </div>
          <label className={label}>{mode==="issue"?"Issue title":"Your idea"}
            <input className={field} required minLength={3} maxLength={200}
              placeholder={mode==="issue"?"e.g. Book page won't turn":"e.g. More reading languages"}
              value={subject} onChange={(e)=>setSubject(e.target.value)}/>
          </label>
          <label className={label}>{mode==="issue"?"What happened and how can we reproduce it?":"What could we improve, and why?"}
            <textarea className={field+" min-h-28"} rows={4} required maxLength={5000}
              placeholder={mode==="issue"?"Include the book, device and steps if helpful.":"Tell us what would make Seeparah more useful for you."}
              value={message} onChange={(e)=>setMessage(e.target.value)}/>
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" required checked={confirmed} onChange={(e)=>setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0"/>
            I confirm the information is accurate. The current page address is included without search parameters.
          </label>
          {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
          <button disabled={busy||!confirmed} type="submit"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy&&<Loader2 className="h-4 w-4 animate-spin"/>}
            {busy?"Submitting…":mode==="issue"?"Create support ticket":"Send suggestion"}
          </button>
          <p className="text-xs leading-relaxed text-muted-foreground">Only authorized staff see submissions.{" "}
            <a href="/legal#support" className="font-semibold underline">Legal & support</a>
          </p>
        </form>}
      </section>
    </div>}
  </>;
}
