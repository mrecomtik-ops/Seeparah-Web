import { describe, expect, it } from "vitest";
import { SETTINGS_SCHEMAS } from "./settings.server";

describe("Seeparah launch language guarantees", () => {
  it("never permits public language settings without English and Urdu", () => {
    expect(SETTINGS_SCHEMAS.language_availability.safeParse(["English", "Arabic"]).success).toBe(false);
    expect(SETTINGS_SCHEMAS.language_availability.safeParse(["Urdu", "Hindi"]).success).toBe(false);
    expect(SETTINGS_SCHEMAS.language_availability.safeParse(["English", "Urdu", "Chinese", "Arabic"]).success).toBe(true);
  });
  it("keeps typed public contact and maintenance data schema-checked", () => {
    expect(SETTINGS_SCHEMAS.maintenance_message.safeParse({active: true, message:"Notice"}).success).toBe(true);
    expect(SETTINGS_SCHEMAS.support_contact.safeParse({ email:"not-an-email" }).success).toBe(false);
  });
});
