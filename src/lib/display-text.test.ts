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

  it("preserves small connecting words inside titles", () => {
    expect(displayTitleCase("alice's adventures in wonderland")).toBe(
      "Alice's Adventures in Wonderland",
    );
  });
});