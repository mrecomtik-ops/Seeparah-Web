// Enforces MFA for the admin surface using Supabase Auth's own TOTP support
// (supabase.auth.mfa.*) — real second-factor enforcement, not a UI-only
// checkbox. The server independently re-checks the session's aal claim on
// every admin server function (see require-admin.server.ts), so this
// component is about giving the admin a way to satisfy that requirement,
// not about being the actual boundary.
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Step = "loading" | "needs_enroll" | "needs_challenge" | "satisfied";

export function AdminMfaGate({ onSatisfied }: { onSatisfied: () => void }) {
  const [step, setStep] = useState<Step>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [unverifiedFactorId, setUnverifiedFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // A ref, not just the `busy` state, guards against a double click firing
  // both handlers before React re-renders the disabled button — state
  // updates are batched/async, so two synchronous clicks could both read
  // busy === false. This lock is checked and set synchronously.
  const actionLockRef = useRef(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      setStep("satisfied");
      onSatisfied();
      return;
    }
    const { data: factors } = await supabase.auth.mfa.listFactors();
    // A verified factor always wins — never unenroll it, never re-enroll
    // over it, just challenge it. This check comes first and returns, so
    // an unverified leftover (rare, but possible with multiple factors)
    // is never even considered while a verified factor exists.
    const verified = factors?.totp.find((f) => f.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setUnverifiedFactorId(null);
      const { data: challenge, error } = await supabase.auth.mfa.challenge({
        factorId: verified.id,
      });
      if (error) {
        toast.error("Couldn't start an MFA challenge — try refreshing.");
        return;
      }
      setChallengeId(challenge.id);
      setStep("needs_challenge");
      return;
    }
    // No verified factor. An UNVERIFIED one left over from an interrupted
    // setup (QR shown, never confirmed) is the exact cause of "A factor
    // with the friendly name \"\" for this user already exists" — detect
    // it here instead of blindly calling enroll() again, which is what
    // produced that error. The fix offers "Restart setup" instead.
    // `factors.totp` is typed (and populated) as verified-only — an
    // unverified factor only ever shows up in `factors.all`.
    const unverified = factors?.all.find(
      (f) => f.factor_type === "totp" && f.status === "unverified",
    );
    setUnverifiedFactorId(unverified?.id ?? null);
    setStep("needs_enroll");
  }

  /** A fresh, nonempty, effectively-unique friendly name for every new
   * enrollment attempt — the empty-string default (what enroll() uses
   * when friendlyName is omitted) is exactly what collided with the
   * leftover unverified factor and produced the original error. */
  async function enrollFresh() {
    const friendlyName = `authenticator-${Date.now()}`;
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName });
    if (error || !data) throw error ?? new Error("Enrollment failed");
    setFactorId(data.id);
    setQrDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(data.totp.qr_code)}`);
    setSecret(data.totp.secret);
  }

  async function startEnroll() {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setBusy(true);
    try {
      await enrollFresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start MFA enrollment");
    } finally {
      setBusy(false);
      actionLockRef.current = false;
    }
  }

  /** Only ever called with unverifiedFactorId, which is only ever set from
   * a factor whose status is literally "unverified" (see refresh() above)
   * — this can never target a verified factor. */
  async function restartSetup() {
    if (actionLockRef.current || !unverifiedFactorId) return;
    actionLockRef.current = true;
    setBusy(true);
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: unverifiedFactorId,
      });
      if (unenrollError) throw unenrollError;
      setUnverifiedFactorId(null);
      await enrollFresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't restart MFA setup");
    } finally {
      setBusy(false);
      actionLockRef.current = false;
    }
  }

  async function verifyEnroll() {
    if (!factorId) return;
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError || !challenge)
        throw challengeError ?? new Error("Could not start challenge");
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      toast.success("MFA enabled for this account");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That code didn't verify — try again");
    } finally {
      setBusy(false);
    }
  }

  async function verifyChallenge() {
    if (!factorId || !challengeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That code didn't verify — try again");
    } finally {
      setBusy(false);
    }
  }

  if (step === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (step === "satisfied") return null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="font-display text-lg font-semibold text-foreground">
            {step === "needs_enroll" ? "Set up multi-factor authentication" : "Enter your MFA code"}
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin actions on Seeparah require MFA on every session — this is enforced server-side, not
          just here.
        </p>

        {step === "needs_enroll" && !qrDataUrl && unverifiedFactorId && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              An authenticator setup was started but never finished. Restart it to get a new QR
              code.
            </p>
            <button
              onClick={restartSetup}
              disabled={busy}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Restarting…" : "Restart setup"}
            </button>
          </div>
        )}

        {step === "needs_enroll" && !qrDataUrl && !unverifiedFactorId && (
          <button
            onClick={startEnroll}
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Starting…" : "Set up an authenticator app"}
          </button>
        )}

        {step === "needs_enroll" && qrDataUrl && (
          <div className="mt-5 space-y-3">
            <img
              src={qrDataUrl}
              alt="MFA QR code"
              className="mx-auto h-40 w-40 rounded-lg border border-border bg-white p-2"
            />
            {secret && (
              <p className="break-all text-center text-xs text-muted-foreground">
                Can't scan? Enter this key manually: <span className="font-mono">{secret}</span>
              </p>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={verifyEnroll}
              disabled={busy || code.length < 6}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify and enable"}
            </button>
          </div>
        )}

        {step === "needs_challenge" && (
          <div className="mt-5 space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code from your authenticator app"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={verifyChallenge}
              disabled={busy || code.length < 6}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
