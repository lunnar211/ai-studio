import { describe, expect, it } from "vitest";
import { LIMITS, photoCreditBudgetFor } from "../lib/limits";
import { PHOTO_CREDIT_COST, checkPhotoCredits } from "../lib/ai/credits";

// DATABASE_URL is unset in the test env, so prisma is null and the
// signed-in GPU-budget check measures used = 0 (no DB). That is
// exactly the documented no-DB behaviour, and it lets us test the
// arithmetic. FREE callers never consume: free photos are unlimited.
describe("photo GPU-budget accounting (Premium only)", () => {
  it("costs exactly Enhance 1 / Colorize 2 / Restore + Colorize 3 on paid GPU", () => {
    expect(PHOTO_CREDIT_COST.enhance).toBe(1);
    expect(PHOTO_CREDIT_COST.colorize).toBe(2);
    expect(PHOTO_CREDIT_COST.restore).toBe(3);
    expect(LIMITS.photoCreditCost).toEqual({ enhance: 1, colorize: 2, restore: 3 });
  });
  it("budgets Free unlimited / Premium GPU 100 per day", async () => {
    expect(await photoCreditBudgetFor("FREE")).toBe(Number.POSITIVE_INFINITY);
    expect(await photoCreditBudgetFor("PREMIUM")).toBe(100);
  });
  it("never blocks or charges a FREE caller", async () => {
    const free = await checkPhotoCredits({ userId: "test-user", plan: "FREE", mode: "restore" });
    expect(free.ok).toBe(true);
    expect(free.cost).toBe(0);
  });
  it("deducts the mode cost from the Premium GPU budget", async () => {
    const enhance = await checkPhotoCredits({ userId: "test-user", plan: "PREMIUM", mode: "enhance" });
    expect(enhance.ok).toBe(true);
    expect(enhance.cost).toBe(1);
    expect(enhance.remaining).toBe(99);
    const restore = await checkPhotoCredits({ userId: "test-user", plan: "PREMIUM", mode: "restore" });
    expect(restore.cost).toBe(3);
    expect(restore.remaining).toBe(97);
  });
});
