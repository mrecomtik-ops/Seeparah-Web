// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultPrefs, getPrefs } from "./prefs";

describe("QA-008 reader SSR preference hydration", () => {
  beforeEach(() => window.localStorage.clear());
  it("initializes with deterministic SSR defaults regardless of saved client theme", () => {
    window.localStorage.setItem("seeparah:prefs", JSON.stringify({
      theme: "dark", fontSize: 20, contentWidth: "wide",
      fontFamily: "serif", v3LineHeight: 1.8,
    }));
    expect(getDefaultPrefs()).toMatchObject({
      theme: "light", fontSize: 16, contentWidth: "medium",
      fontFamily: "literary", v3LineHeight: 1.5,
    });
    expect(getPrefs()).toMatchObject({
      theme: "dark", fontSize: 20, contentWidth: "wide",
      fontFamily: "serif", v3LineHeight: 1.8,
    });
  });
});
