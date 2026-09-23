// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminQueryError } from "./AdminQueryError";

describe("AdminQueryError", () => {
  it("shows the message and calls onRetry when clicked, instead of silently looking empty", () => {
    const onRetry = vi.fn();
    render(<AdminQueryError message="Couldn't load the catalog." onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load the catalog.")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
