// Paddle price display formatting (pure; the live price fetch itself
// is env-gated and returns null when Paddle is unconfigured, so the
// pricing page hides Upgrade instead of inventing a price).

import { describe, expect, it } from "vitest";
import { formatPaddlePrice } from "../lib/paddle";

describe("formatPaddlePrice", () => {
  it("formats minor units as currency per period", () => {
    expect(formatPaddlePrice({ amountMinor: 1900, currency: "USD", interval: "month", frequency: 1 })).toBe(
      "$19.00 per month"
    );
  });
  it("handles multi-frequency periods and non-USD currencies", () => {
    expect(formatPaddlePrice({ amountMinor: 19000, currency: "USD", interval: "year", frequency: 1 })).toBe(
      "$190.00 per year"
    );
    expect(formatPaddlePrice({ amountMinor: 1500, currency: "EUR", interval: "month", frequency: 3 })).toBe(
      "€15.00 every 3 months"
    );
  });
});
