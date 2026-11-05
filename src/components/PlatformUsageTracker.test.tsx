// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlatformUsageTracker, usageArea } from "./PlatformUsageTracker";

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();});
describe("anonymous analytics opt-in",()=>{
  it("classifies only broad anonymous content areas and never tracks admin",()=>{
    expect(usageArea("/")).toBe("home");
    expect(usageArea("/read/this-book?id=secret")).toBe("reader");
    expect(usageArea("/sacred-texts")).toBe("sacred_texts");
    expect(usageArea("/admin/analytics")).toBeNull();
    expect(usageArea("/auth")).toBeNull();
  });
  it("does not collect a visitor ID before consent and accepts declining",async()=>{
    render(<PlatformUsageTracker pathname="/library" />);
    const button=await screen.findByRole("button",{name:"No thanks"});
    expect(localStorage.getItem("seeparah:anonymous-visitor")).toBeNull();
    fireEvent.click(button);
    expect(localStorage.getItem("seeparah:analytics-consent")).toBe("deny");
    expect(localStorage.getItem("seeparah:anonymous-visitor")).toBeNull();
  });
});
