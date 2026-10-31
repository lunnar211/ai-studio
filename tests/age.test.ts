import { describe, expect, it } from "vitest";
import { ageGate, ageInYears, parseDob } from "../lib/age";

const NOW = new Date("2026-11-01T00:00:00Z");

describe("age calculation", () => {
  it("counts birthdays correctly around the boundary", () => {
    expect(ageInYears(new Date("2008-11-01T00:00:00Z"), NOW)).toBe(18);
    expect(ageInYears(new Date("2008-11-02T00:00:00Z"), NOW)).toBe(17);
    expect(ageInYears(new Date("2013-11-01T00:00:00Z"), NOW)).toBe(13);
  });
  it("maps ages to gates", () => {
    expect(ageGate(new Date("2015-01-01T00:00:00Z"), NOW)).toBe("BLOCKED_UNDER_13");
    expect(ageGate(new Date("2012-01-01T00:00:00Z"), NOW)).toBe("BLOCKED_UNDER_16");
    expect(ageGate(new Date("2009-01-01T00:00:00Z"), NOW)).toBe("FREE_ONLY");
    expect(ageGate(new Date("2000-01-01T00:00:00Z"), NOW)).toBe("FULL");
  });
  it("rejects impossible and future dates", () => {
    expect(parseDob("2026-02-30")).toBeNull();
    expect(parseDob("not-a-date")).toBeNull();
    expect(parseDob("2030-01-01")).toBeNull();
    expect(parseDob("2000-05-06")?.toISOString().slice(0, 10)).toBe("2000-05-06");
  });
});
