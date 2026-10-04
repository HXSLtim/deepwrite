import { describe, expect, it } from "vitest";
import { announcedVersionStatus } from "./useAnnouncedVersion";

describe("announcement version reminders", () => {
  it("shows a reminder and manual download when the update source lags behind the announcement", () => {
    expect(announcedVersionStatus("1.5.3", "1.5.2", "1.5.0")).toEqual({
      hasVersionNotice: true,
      manualUpdateRequired: true
    });
  });

  it("compares numeric segments and prereleases instead of strings", () => {
    expect(
      announcedVersionStatus("1.10.0", "1.9.0", "1.9.9").manualUpdateRequired
    ).toBe(true);
    expect(
      announcedVersionStatus("1.5.3", "1.5.3-beta.2", "1.5.3-beta.10")
        .manualUpdateRequired
    ).toBe(true);
    expect(
      announcedVersionStatus("1.5.3", "1.5.2", "1.5.4").manualUpdateRequired
    ).toBe(false);
  });

  it("clears the reminder when the announcement matches or is not newer", () => {
    expect(
      announcedVersionStatus("1.5.3", "1.5.3", "1.5.0").hasVersionNotice
    ).toBe(false);
    expect(
      announcedVersionStatus("1.5.3", "1.5.4", "1.5.3").hasVersionNotice
    ).toBe(false);
    expect(
      announcedVersionStatus("1.4.0", "1.5.4", "1.5.3").hasVersionNotice
    ).toBe(false);
    expect(announcedVersionStatus(undefined, "1.5.2", "1.5.0")).toEqual({
      hasVersionNotice: false,
      manualUpdateRequired: false
    });
  });

  it("keeps the announcement reminder when no update source version is available", () => {
    expect(announcedVersionStatus("1.5.3", "1.5.2", undefined)).toEqual({
      hasVersionNotice: true,
      manualUpdateRequired: false
    });
    expect(
      announcedVersionStatus("invalid", "1.5.2", undefined).hasVersionNotice
    ).toBe(false);
  });
});
