import { describe, expect, it } from "vitest";
import { findBlocked, findBlockedCategory, findBlockedTerm } from "../lib/blocklist";

describe("blocklist", () => {
  it("refuses brand terms", () => {
    expect(findBlockedTerm("a logo like Nike shoes")).toBe("nike");
  });
  it("refuses extended categories", () => {
    expect(findBlockedCategory("make a counterfeit document logo")).toBe("illegal");
    expect(findBlockedCategory("pornographic mascot")).toBe("sexual");
    expect(findBlockedCategory("a hate symbol emblem")).toBe("abusive");
    expect(findBlockedCategory("copy the logo of my shop")).toBe("trademark");
  });
  it("passes original prompts", () => {
    expect(findBlocked("a mountain coffee roaster badge")).toBeNull();
  });
  it("is case-insensitive", () => {
    expect(findBlocked("NIKE style swoosh")).not.toBeNull();
  });
});
