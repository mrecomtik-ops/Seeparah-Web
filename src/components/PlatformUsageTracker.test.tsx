// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PlatformUsageTracker, setUsageConsent, usageArea } from "./PlatformUsageTracker";

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();});
describe("anonymous analytics opt-in",()=>{
  it("classifies only broad anonymous content areas and never tracks admin",()=>{
    expect(usageArea("/")).toBe("home");
    expect(usageArea("/read/this-book?id=secret")).toBe("reader");
    expect(usageArea("/sacred-texts")).toBe("sacred_texts");
    expect(usageArea("/admin/analytics")).toBeNull();
    expect(usageArea("/auth")).toBeNull();
  });
  it("keeps the anonymous visitor ID unset when tracking is declined",()=>{
    render(<PlatformUsageTracker pathname="/library" />);
    expect(localStorage.getItem("seeparah:anonymous-visitor")).toBeNull();
    setUsageConsent("deny");
    expect(localStorage.getItem("seeparah:analytics-consent")).toBe("deny");
    expect(localStorage.getItem("seeparah:anonymous-visitor")).toBeNull();
  });
});
