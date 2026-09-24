import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitSupportRequest } from "@/lib/admin/support.functions";

const REQUEST_TYPES = [
  { value: "general_support", label: "General support" },
  { value: "account", label: "Account/login issue" },
  { value: "reading_progress", label: "Reading or progress issue" },
  { value: "manuscript_publication", label: "Manuscript/publication issue" },
  { value: "translation_request", label: "Translation request issue" },
  { value: "complaint", label: "General complaint" },
  { value: "safety_abuse", label: "Safety or abuse report" },
  { value: "privacy_request", label: "Privacy request" },
  { value: "accessibility", label: "Accessibility issue" },
  { value: "other", label: "Other" },
] as const;

const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelClass = "block text-sm font-medium text-foreground";

async function optionalAccessToken(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}

export function SupportRequestForm() {
  const idBase = useId();
  const [requestType, setRequestType] = useState<(typeof REQUEST_TYPES)[number]["value"]>(
    "general_support",
  );
  const [fullName, setFullName] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [confirmedAccurate, setConfirmedAccurate] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  function validate(): string | null {
    if (fullName.trim().length === 0) return "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail.trim())) return "Enter a valid reply email.";
    if (subject.trim().length < 3) return "Enter a subject (at least 3 characters).";
    if (message.trim().length === 0) return "Enter a message describing your request.";
    if (!confirmedAccurate) return "Please confirm the information above is accurate.";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const accessToken = await optionalAccessToken();
      const result = await submitSupportRequest({
        data: {
          requestType,
          fullName: fullName.trim(),
          replyEmail: replyEmail.trim(),
          subject: subject.trim(),
          message: message.trim(),
          pageUrl: pageUrl.trim() || undefined,
          confirmedAccurate: true,
          honeypot: honeypot || undefined,
          accessToken,
        },
      });
      setReferenceCode(result.referenceCode);
    } catch {
      setError("We couldn't submit your request — please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (referenceCode) {
    return (
      <div
        role="status"
        className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-secondary-foreground"
      >
        <p className="font-semibold text-foreground">Your request was received.</p>
        <p className="mt-1">
          Reference number: <span className="font-mono font-semibold">{referenceCode}</span>
        </p>
        <p className="mt-1 text-muted-foreground">
          Keep this reference if you follow up. We can't promise a fixed response time, but every
          request is reviewed.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <input
        type="text"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <div>
        <label htmlFor={`${idBase}-type`} className={labelClass}>
          Request type
        </label>
        <select
          id={`${idBase}-type`}
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as typeof requestType)}
          className={`mt-1 ${inputClass}`}
        >
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idBase}-name`} className={labelClass}>
          Full name
        </label>
        <input
          id={`${idBase}-name`}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-email`} className={labelClass}>
          Reply email
        </label>
        <input
          id={`${idBase}-email`}
          type="email"
          value={replyEmail}
          onChange={(e) => setReplyEmail(e.target.value)}
          autoComplete="email"
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-subject`} className={labelClass}>
          Subject
        </label>
        <input
          id={`${idBase}-subject`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={`e.g. "Can't sign in with Google"`}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-message`} className={labelClass}>
          Detailed message
        </label>
        <textarea
          id={`${idBase}-message`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-url`} className={labelClass}>
          Relevant page or book URL <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id={`${idBase}-url`}
          type="url"
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="https://seeparah.com/..."
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={confirmedAccurate}
          onChange={(e) => setConfirmedAccurate(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        I confirm the information above is accurate.
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        This form goes to Seeparah's private support queue. We don't publish or share this address
        — submissions are only visible to authorized staff.
      </p>

      <button
        type="submit"
        disabled={busy}
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send request
      </button>
    </form>
  );
}
