import { describe, expect, it } from "vitest";
import { LIMITS, photoCreditBudgetFor } from "../lib/limits";
import { PHOTO_CREDIT_COST, checkPhotoCredits } from "../lib/ai/credits";

// DATABASE_URL is unset in the test env, so prisma is null and the
// signed-in credit check measures used = 0 (no DB). That is exactly
// the documented no-DB behaviour, and it lets us test the arithmetic.
describe("photo credit accounting", () => {
  it("costs exactly Enhance 1 / Colorize 2 / Restore + Colorize 3", () => {
    expect(PHOTO_CREDIT_COST.enhance).toBe(1);
    expect(PHOTO_CREDIT_COST.colorize).toBe(2);
    expect(PHOTO_CREDIT_COST.restore).toBe(3);
    expect(LIMITS.photoCreditCost).toEqual({ enhance: 1, colorize: 2, restore: 3 });
  });
  it("budgets Free 10 / Premium 100 per day", async () => {
    expect(await photoCreditBudgetFor("FREE")).toBe(10);
    expect(await photoCreditBudgetFor("PREMIUM")).toBe(100);
  });
  it("deducts the mode cost from the remaining budget", async () => {
    const enhance = await checkPhotoCredits({ userId: "test-user", plan: "FREE", mode: "enhance" });
    expect(enhance.ok).toBe(true);
    expect(enhance.cost).toBe(1);
    expect(enhance.remaining).toBe(9);
    const restore = await checkPhotoCredits({ userId: "test-user", plan: "FREE", mode: "restore" });
    expect(restore.cost).toBe(3);
    expect(restore.remaining).toBe(7);
    const premium = await checkPhotoCredits({ userId: "test-user", plan: "PREMIUM", mode: "restore" });
    expect(premium.remaining).toBe(97);
  });
});
