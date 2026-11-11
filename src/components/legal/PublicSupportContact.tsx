import { useEffect, useState } from "react";
import { getPublicContentSettings } from "@/lib/admin/settings.functions";

export type PublicSupportChannel = { email: string; helpUrl: string | null };

/** Only display a contact that an editor explicitly published in Settings.
 * Never synthesize an email or expose an admin-only configuration value. */
export function publicSupportChannel(value: unknown): PublicSupportChannel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const email = fields["email"];
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const rawUrl = fields["helpUrl"];
  let helpUrl: string | null = null;
  if (typeof rawUrl === "string") {
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "https:" && url.hostname === "seeparah.com") helpUrl = url.href;
    } catch { /* invalid/unsafe external destination: omit */ }
  }
  return { email, helpUrl };
}

export function PublicSupportContact() {
  const [contact, setContact] = useState<PublicSupportChannel | null>(null);
  useEffect(() => {
    let active = true;
    void getPublicContentSettings().then((settings) => {
      if (active) setContact(publicSupportChannel(settings["support_contact"]));
    }).catch(() => {
      // Existing ticket forms are still available without public settings.
    });
    return () => { active = false; };
  }, []);
  if (!contact) return null;
  return (
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
      Prefer email? The published Seeparah support contact is{" "}
      <a href={`mailto:${contact.email}`} className="font-semibold text-primary underline">
        {contact.email}
      </a>.
      {" "}Use the form below for a support ticket and reference number.
    </p>
  );
}
