// @vitest-environment happy-dom
//
// Regression coverage for the live-preview bug: clicking "Set up an
// authenticator app" failed with 'A factor with the friendly name "" for
// this user already exists' whenever an earlier, interrupted enrollment
// had left an unverified TOTP factor behind — the component never checked
// for one and always called enroll() again with the same empty default
// friendly name. Mocks only supabase.auth.mfa.* (the real Supabase Auth
// API surface this component calls); everything else in the component
// runs for real.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// vi.mock factories are hoisted above ordinary module code, so a plain
// `const mfa = {...}` referenced inside one would hit a TDZ error —
// vi.hoisted() is vitest's own mechanism for a value that must exist
// before the hoisted factory runs.
const mfa = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { mfa } },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { AdminMfaGate } = await import("./AdminMfaGate");

function totpFactor(id: string, status: "verified" | "unverified") {
  return { id, factor_type: "totp", status, friendly_name: status === "unverified" ? "" : "primary" };
}

/** Mirrors the real listFactors() response shape: `all` contains every
 * factor regardless of status, but the per-type field (`totp`) is
 * populated with verified factors only — see
 * node_modules/@supabase/auth-js's own AuthMFAListFactorsResponse type.
 * Getting this mock shape right is exactly the fix under test: the
 * original code (and an easy mistake to repeat) read unverified factors
 * from `totp`, where the real API never puts them. */
function listFactorsResponse(factors: ReturnType<typeof totpFactor>[]) {
  return {
    data: {
      all: factors,
      totp: factors.filter((f) => f.status === "verified"),
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminMfaGate — interrupted setup (the reported bug)", () => {
  it('offers "Restart setup" instead of re-calling enroll() when an unverified factor already exists', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1" } });
    mfa.listFactors.mockResolvedValue(listFactorsResponse([totpFactor("leftover-1", "unverified")]));

    render(<AdminMfaGate onSatisfied={vi.fn()} />);

    expect(await screen.findByText("Restart setup")).toBeTruthy();
    expect(screen.queryByText("Set up an authenticator app")).toBeNull();
    // The bug never even got here — enroll() must not be called just for
    // detecting the leftover factor.
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it('"Restart setup" unenrolls ONLY the specific unverified factor by id, then enrolls fresh with a nonempty friendlyName', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1" } });
    mfa.listFactors.mockResolvedValue(listFactorsResponse([totpFactor("leftover-1", "unverified")]));
    mfa.unenroll.mockResolvedValue({ data: {}, error: null });
    mfa.enroll.mockResolvedValue({
      data: { id: "new-factor-1", totp: { qr_code: "<svg></svg>", secret: "ABCDEF" } },
      error: null,
    });

    render(<AdminMfaGate onSatisfied={vi.fn()} />);
    fireEvent.click(await screen.findByText("Restart setup"));

    await waitFor(() => expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "leftover-1" }));
    await waitFor(() => expect(mfa.enroll).toHaveBeenCalledTimes(1));
    const enrollArg = mfa.enroll.mock.calls[0]?.[0] as { friendlyName?: string };
    expect(enrollArg.friendlyName).toBeTruthy();
    expect(enrollArg.friendlyName).not.toBe("");
    // Fresh QR/secret from the new enrollment actually renders.
    expect(await screen.findByAltText("MFA QR code")).toBeTruthy();
  });
});

describe("AdminMfaGate — already-verified factor", () => {
  it("challenges the verified factor instead of showing enrollment UI, and never unenrolls it", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1" } });
    mfa.listFactors.mockResolvedValue(listFactorsResponse([totpFactor("verified-1", "verified")]));
    mfa.challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });

    render(<AdminMfaGate onSatisfied={vi.fn()} />);

    expect(await screen.findByText("Enter your MFA code")).toBeTruthy();
    expect(mfa.challenge).toHaveBeenCalledWith({ factorId: "verified-1" });
    expect(screen.queryByText("Restart setup")).toBeNull();
    expect(screen.queryByText("Set up an authenticator app")).toBeNull();
    expect(mfa.unenroll).not.toHaveBeenCalled();
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("aal2 (fully satisfied) calls onSatisfied and renders nothing, without listing factors", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2" } });
    const onSatisfied = vi.fn();

    const { container } = render(<AdminMfaGate onSatisfied={onSatisfied} />);

    await waitFor(() => expect(onSatisfied).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe("");
  });
});

describe("AdminMfaGate — double-click protection", () => {
  it("a rapid double click on 'Set up an authenticator app' calls enroll() only once", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1" } });
    mfa.listFactors.mockResolvedValue(listFactorsResponse([]));
    let resolveEnroll!: (v: unknown) => void;
    mfa.enroll.mockReturnValue(
      new Promise((resolve) => {
        resolveEnroll = resolve;
      }),
    );

    render(<AdminMfaGate onSatisfied={vi.fn()} />);
    const button = await screen.findByText("Set up an authenticator app");
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    resolveEnroll({
      data: { id: "new-factor-1", totp: { qr_code: "<svg></svg>", secret: "ABCDEF" } },
      error: null,
    });
    await waitFor(() => expect(screen.queryByAltText("MFA QR code")).toBeTruthy());

    expect(mfa.enroll).toHaveBeenCalledTimes(1);
  });

  it("a rapid double click on 'Restart setup' unenrolls and enrolls exactly once each", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1" } });
    mfa.listFactors.mockResolvedValue(listFactorsResponse([totpFactor("leftover-1", "unverified")]));
    let resolveUnenroll!: (v: unknown) => void;
    mfa.unenroll.mockReturnValue(
      new Promise((resolve) => {
        resolveUnenroll = resolve;
      }),
    );
    mfa.enroll.mockResolvedValue({
      data: { id: "new-factor-1", totp: { qr_code: "<svg></svg>", secret: "ABCDEF" } },
      error: null,
    });

    render(<AdminMfaGate onSatisfied={vi.fn()} />);
    const button = await screen.findByText("Restart setup");
    fireEvent.click(button);
    fireEvent.click(button);

    resolveUnenroll({ data: {}, error: null });
    await waitFor(() => expect(mfa.enroll).toHaveBeenCalledTimes(1));

    expect(mfa.unenroll).toHaveBeenCalledTimes(1);
  });
});
