import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitCopyrightRequest } from "@/lib/admin/support.functions";

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

export function CopyrightRequestForm() {
  const idBase = useId();
  const [submissionType, setSubmissionType] = useState<"infringement" | "counter_notice">(
    "infringement",
  );
  const [claimantName, setClaimantName] = useState("");
  const [organization, setOrganization] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [ownershipExplanation, setOwnershipExplanation] = useState("");
  const [detailedRequest, setDetailedRequest] = useState("");
  const [goodFaithStatement, setGoodFaithStatement] = useState(false);
  const [accuracyDeclaration, setAccuracyDeclaration] = useState(false);
  const [signature, setSignature] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  function validate(): string | null {
    if (claimantName.trim().length === 0) return "Enter your full legal name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail.trim())) return "Enter a valid reply email.";
    if (workDescription.trim().length === 0) return "Describe the copyrighted work.";
    if (contentUrl.trim().length === 0) return "Enter the exact location/URL on Seeparah.";
    if (ownershipExplanation.trim().length === 0) return "Explain your ownership or authority.";
    if (detailedRequest.trim().length === 0) return "Describe your request in detail.";
    if (!goodFaithStatement) return "The good-faith statement must be checked.";
    if (!accuracyDeclaration) return "The accuracy/authority declaration must be checked.";
    if (signature.trim().length === 0) return "Type your full name as your electronic signature.";
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
      const result = await submitCopyrightRequest({
        data: {
          submissionType,
          claimantName: claimantName.trim(),
          organization: organization.trim() || undefined,
          replyEmail: replyEmail.trim(),
          workDescription: workDescription.trim(),
          contentUrl: contentUrl.trim(),
          ownershipExplanation: ownershipExplanation.trim(),
          detailedRequest: detailedRequest.trim(),
          goodFaithStatement: true,
          accuracyDeclaration: true,
          signature: signature.trim(),
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
          We review copyright notices and counter-notices directly. Keep this reference if you
          follow up.
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

      <fieldset>
        <legend className={labelClass}>Submission type</legend>
        <div className="mt-1 flex flex-col gap-1.5 sm:flex-row sm:gap-4">
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="radio"
              name={`${idBase}-submission-type`}
              checked={submissionType === "infringement"}
              onChange={() => setSubmissionType("infringement")}
            />
            Infringement notice
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="radio"
              name={`${idBase}-submission-type`}
              checked={submissionType === "counter_notice"}
              onChange={() => setSubmissionType("counter_notice")}
            />
            Counter-notice
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${idBase}-claimant`} className={labelClass}>
          Claimant / full legal name
        </label>
        <input
          id={`${idBase}-claimant`}
          value={claimantName}
          onChange={(e) => setClaimantName(e.target.value)}
          autoComplete="name"
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-org`} className={labelClass}>
          Organization <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id={`${idBase}-org`}
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          autoComplete="organization"
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
        <label htmlFor={`${idBase}-work`} className={labelClass}>
          Identification of the copyrighted work
        </label>
        <textarea
          id={`${idBase}-work`}
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
          rows={2}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-url`} className={labelClass}>
          Exact location/URL of the material on Seeparah
        </label>
        <input
          id={`${idBase}-url`}
          value={contentUrl}
          onChange={(e) => setContentUrl(e.target.value)}
          placeholder="https://seeparah.com/..."
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-ownership`} className={labelClass}>
          Explanation of ownership or authority
        </label>
        <textarea
          id={`${idBase}-ownership`}
          value={ownershipExplanation}
          onChange={(e) => setOwnershipExplanation(e.target.value)}
          rows={3}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-request`} className={labelClass}>
          Detailed request
        </label>
        <textarea
          id={`${idBase}-request`}
          value={detailedRequest}
          onChange={(e) => setDetailedRequest(e.target.value)}
          rows={4}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={goodFaithStatement}
          onChange={(e) => setGoodFaithStatement(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        I have a good-faith belief that the use described is not authorized by the rights holder,
        its agent, or the law (or, for a counter-notice, that the material was removed or disabled
        as a result of mistake or misidentification).
      </label>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={accuracyDeclaration}
          onChange={(e) => setAccuracyDeclaration(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        The information in this notice is accurate, and I am the rights holder or authorized to
        act on their behalf.
      </label>

      <div>
        <label htmlFor={`${idBase}-signature`} className={labelClass}>
          Electronic signature (type your full name)
        </label>
        <input
          id={`${idBase}-signature`}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          autoComplete="name"
          className={`mt-1 ${inputClass}`}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        This form goes to Seeparah's private legal review queue. We don't publish or share this
        address — submissions are only visible to authorized staff.
      </p>

      <button
        type="submit"
        disabled={busy}
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit
      </button>
    </form>
  );
}
