import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BudgetGate, BudgetReservation } from "../types.js";

export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED" as const;
  readonly requestedUsd: number;
  readonly availableUsd: number;

  constructor(message: string, requestedUsd: number, availableUsd: number) {
    super(message);
    this.name = "BudgetExceededError";
    this.requestedUsd = requestedUsd;
    this.availableUsd = availableUsd;
  }
}

export interface AtomicBudgetLimiterOptions {
  dailyLimitUsd: number;
  defaultMaxAskUsd: number;
  statePath: string;
}

interface PersistedSpendState {
  dayUtc: string;
  dailySpentUusdc: number;
  updatedAtUtc: string;
}

const UUSDC_PER_USD = 1_000_000;

function toUusdc(usd: number): number {
  return Math.max(0, Math.round(usd * UUSDC_PER_USD));
}

function fromUusdc(uusdc: number): number {
  return Number((uusdc / UUSDC_PER_USD).toFixed(6));
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export class AtomicBudgetLimiter implements BudgetGate {
  private readonly dailyLimitUusdc: number;
  private readonly defaultMaxAskUusdc: number;
  private readonly statePath: string;
  private dayUtc: string;
  private dailySpentUusdc: number;
  private readonly inFlight = new Map<string, number>();
  private lockChain: Promise<void> = Promise.resolve();

  constructor(options: AtomicBudgetLimiterOptions) {
    this.dailyLimitUusdc = toUusdc(options.dailyLimitUsd);
    this.defaultMaxAskUusdc = toUusdc(options.defaultMaxAskUsd);
    this.statePath = options.statePath;
    this.dayUtc = todayUtc();
    this.dailySpentUusdc = 0;
    this.loadFromDisk();
  }

  private withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.lockChain.then(fn, fn);
    this.lockChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private rolloverIfNeeded(): void {
    const currentDay = todayUtc();
    if (currentDay !== this.dayUtc) {
      this.dayUtc = currentDay;
      this.dailySpentUusdc = 0;
      this.persistToDisk();
    }
  }

  private inFlightTotalUusdc(): number {
    let total = 0;
    for (const v of this.inFlight.values()) total += v;
    return total;
  }

  private loadFromDisk(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.statePath, "utf8")) as PersistedSpendState;
      if (raw && raw.dayUtc === this.dayUtc && Number.isFinite(raw.dailySpentUusdc)) {
        this.dailySpentUusdc = Math.max(0, Math.round(raw.dailySpentUusdc));
      }
    } catch {
      // Corrupt or empty state file starts cleanly at 0 for current UTC day
    }
  }

  private persistToDisk(): void {
    const dir = dirname(this.statePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: PersistedSpendState = {
      dayUtc: this.dayUtc,
      dailySpentUusdc: this.dailySpentUusdc,
      updatedAtUtc: new Date().toISOString(),
    };
    const tmpPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf8");
    renameSync(tmpPath, this.statePath);
  }

  async reserve(maxUsd: number, requestCapUsd?: number): Promise<BudgetReservation> {
    return this.withLock(() => {
      this.rolloverIfNeeded();
      const requestedUusdc = toUusdc(maxUsd);
      const effectiveCapUusdc =
        requestCapUsd !== undefined
          ? Math.min(this.defaultMaxAskUusdc, toUusdc(requestCapUsd))
          : this.defaultMaxAskUusdc;

      if (requestedUusdc > effectiveCapUusdc) {
        throw new BudgetExceededError(
          `Requested $${fromUusdc(requestedUusdc)} exceeds per-request cap $${fromUusdc(effectiveCapUusdc)}`,
          fromUusdc(requestedUusdc),
          fromUusdc(effectiveCapUusdc)
        );
      }

      const committed = this.dailySpentUusdc + this.inFlightTotalUusdc();
      const remaining = Math.max(0, this.dailyLimitUusdc - committed);
      if (committed + requestedUusdc > this.dailyLimitUusdc) {
        throw new BudgetExceededError(
          `Daily budget exceeded: requested $${fromUusdc(requestedUusdc)}, remaining $${fromUusdc(remaining)} of $${fromUusdc(this.dailyLimitUusdc)}`,
          fromUusdc(requestedUusdc),
          fromUusdc(remaining)
        );
      }

      const id = randomUUID();
      this.inFlight.set(id, requestedUusdc);
      return {
        id,
        reservedUsd: fromUusdc(requestedUusdc),
        createdAtMs: Date.now(),
      };
    });
  }

  async settle(reservationId: string, actualUsd: number): Promise<void> {
    return this.withLock(() => {
      this.rolloverIfNeeded();
      if (!this.inFlight.has(reservationId)) return;
      this.inFlight.delete(reservationId);
      const actualUusdc = toUusdc(actualUsd);
      this.dailySpentUusdc += actualUusdc;
      this.persistToDisk();
    });
  }

  async release(reservationId: string): Promise<void> {
    return this.withLock(() => {
      this.inFlight.delete(reservationId);
    });
  }

  snapshot(): {
    dailySpentUsd: number;
    inFlightReservedUsd: number;
    dailyLimitUsd: number;
  } {
    return {
      dailySpentUsd: fromUusdc(this.dailySpentUusdc),
      inFlightReservedUsd: fromUusdc(this.inFlightTotalUusdc()),
      dailyLimitUsd: fromUusdc(this.dailyLimitUusdc),
    };
  }
}
