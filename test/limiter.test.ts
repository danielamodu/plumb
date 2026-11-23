import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicBudgetLimiter, BudgetExceededError } from "../src/budget/limiter.js";

test("reserve, settle, release, and disk persistence track spend accurately", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-budget-"));
  const statePath = join(dir, "spend.json");
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 0.05,
      defaultMaxAskUsd: 0.02,
      statePath,
    });

    const r1 = await limiter.reserve(0.01);
    assert.equal(limiter.snapshot().inFlightReservedUsd, 0.01);
    await limiter.settle(r1.id, 0.01);
    assert.equal(limiter.snapshot().inFlightReservedUsd, 0);
    assert.equal(limiter.snapshot().dailySpentUsd, 0.01);

    // Failed ask releases reservation ($0.00 spent)
    const r2 = await limiter.reserve(0.02);
    assert.equal(limiter.snapshot().inFlightReservedUsd, 0.02);
    await limiter.release(r2.id);
    assert.equal(limiter.snapshot().inFlightReservedUsd, 0);
    assert.equal(limiter.snapshot().dailySpentUsd, 0.01);

    // Reload from disk preserves daily spend
    const reloaded = new AtomicBudgetLimiter({
      dailyLimitUsd: 0.05,
      defaultMaxAskUsd: 0.02,
      statePath,
    });
    assert.equal(reloaded.snapshot().dailySpentUsd, 0.01);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects single ask exceeding per-request cap", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-budget-cap-"));
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 1.0,
      defaultMaxAskUsd: 0.05,
      statePath: join(dir, "spend.json"),
    });
    await assert.rejects(
      () => limiter.reserve(0.02, 0.01),
      (err: unknown) => err instanceof BudgetExceededError && err.code === "BUDGET_EXCEEDED"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("20-way concurrent race against $0.03 daily cap allows exactly 3 and blocks 17", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plumb-budget-race-"));
  const statePath = join(dir, "spend.json");
  try {
    const limiter = new AtomicBudgetLimiter({
      dailyLimitUsd: 0.03,
      defaultMaxAskUsd: 0.05,
      statePath,
    });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, async () => {
        const res = await limiter.reserve(0.01);
        // Simulate async network delay before settling
        await new Promise((r) => setTimeout(r, 15));
        await limiter.settle(res.id, 0.01);
        return res.id;
      })
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 3);
    assert.equal(rejected.length, 17);
    for (const r of rejected) {
      assert.ok(r.status === "rejected");
      assert.ok(r.reason instanceof BudgetExceededError);
      assert.equal(r.reason.code, "BUDGET_EXCEEDED");
    }

    const snap = limiter.snapshot();
    assert.ok(snap.dailySpentUsd <= 0.0300001);
    assert.equal(snap.dailySpentUsd, 0.03);
    assert.equal(snap.inFlightReservedUsd, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
