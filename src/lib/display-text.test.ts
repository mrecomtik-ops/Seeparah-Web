import { describe, expect, it } from "vitest";
import { displayTitleCase } from "@/lib/display-text";

describe("displayTitleCase", () => {
  it("normalizes sentence-case catalogue titles without changing stored data", () => {
    expect(displayTitleCase("The strange case of Dr. Jekyll and Mr. Hyde")).toBe(
      "The Strange Case of Dr. Jekyll and Mr. Hyde",
    );
    expect(displayTitleCase("The call of the wild")).toBe("The Call of the Wild");
    expect(displayTitleCase("The war of the worlds")).toBe("The War of the Worlds");
  });

  it("preserves small connecting words and subtitle capitalization", () => {
    expect(displayTitleCase("alice's adventures in wonderland")).toBe(
      "Alice's Adventures in Wonderland",
    );
    expect(displayTitleCase("Gulliver's Travels Into Several Remote Nations")).toBe(
      "Gulliver's Travels into Several Remote Nations",
    );
    expect(displayTitleCase("Jane Eyre: an Autobiography")).toBe("Jane Eyre: An Autobiography");
    expect(displayTitleCase("The Red Badge of Courage: an Episode")).toBe(
      "The Red Badge of Courage: An Episode",
    );
    expect(displayTitleCase("Frankenstein; Or, the Modern Prometheus")).toBe(
      "Frankenstein; or, The Modern Prometheus",
    );
  });
});
