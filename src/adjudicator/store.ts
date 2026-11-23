import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AdjudicationRecord } from "../types.js";

export interface ScoreboardEntry {
  minerId: string;
  minerName: string;
  isPrimaryTrack01: boolean;
  calls: number;
  validCalls: number;
  groundTruthMatches: number;
  groundTruthTotal: number;
  injectionFlags: number;
  avgLatencyMs: number;
  totalEarnedUsd: number;
  score: number;
}

export function computeScoreboard(
  records: AdjudicationRecord[]
): ScoreboardEntry[] {
  const byMiner = new Map<
    string,
    {
      minerId: string;
      minerName: string;
      isPrimaryTrack01: boolean;
      calls: number;
      validCalls: number;
      groundTruthMatches: number;
      groundTruthTotal: number;
      injectionFlags: number;
      totalLatencyMs: number;
      totalEarnedUsd: number;
    }
  >();

  for (const rec of records) {
    const matchedSet = new Set(rec.groundTruthCheck?.matchedMinerIds ?? []);
    const failedSet = new Set(rec.groundTruthCheck?.failedMinerIds ?? []);

    for (const c of rec.calls) {
      const existing = byMiner.get(c.minerId) ?? {
        minerId: c.minerId,
        minerName: c.minerName ?? c.minerId,
        isPrimaryTrack01: c.isPrimaryTrack01,
        calls: 0,
        validCalls: 0,
        groundTruthMatches: 0,
        groundTruthTotal: 0,
        injectionFlags: 0,
        totalLatencyMs: 0,
        totalEarnedUsd: 0,
      };
      existing.calls += 1;
      if (c.schemaValid && !c.injectionFlagged) existing.validCalls += 1;
      if (c.injectionFlagged) existing.injectionFlags += 1;
      if (matchedSet.has(c.minerId)) {
        existing.groundTruthMatches += 1;
        existing.groundTruthTotal += 1;
      } else if (failedSet.has(c.minerId)) {
        existing.groundTruthTotal += 1;
      }
      existing.totalLatencyMs += c.latencyMs;
      existing.totalEarnedUsd += c.costUsd;
      if (c.isPrimaryTrack01) existing.isPrimaryTrack01 = true;
      if (c.minerName) existing.minerName = c.minerName;
      byMiner.set(c.minerId, existing);
    }
  }

  const entries: ScoreboardEntry[] = Array.from(byMiner.values()).map((m) => {
    const baseScore =
      m.groundTruthTotal > 0
        ? m.groundTruthMatches / m.groundTruthTotal
        : m.calls > 0
          ? m.validCalls / m.calls
          : 0;
    const penalty = m.calls > 0 ? (m.injectionFlags / m.calls) * 0.5 : 0;
    const score = Number(Math.max(0, baseScore - penalty).toFixed(4));
    return {
      minerId: m.minerId,
      minerName: m.minerName,
      isPrimaryTrack01: m.isPrimaryTrack01,
      calls: m.calls,
      validCalls: m.validCalls,
      groundTruthMatches: m.groundTruthMatches,
      groundTruthTotal: m.groundTruthTotal,
      injectionFlags: m.injectionFlags,
      avgLatencyMs: m.calls > 0 ? Math.round(m.totalLatencyMs / m.calls) : 0,
      totalEarnedUsd: Number(m.totalEarnedUsd.toFixed(6)),
      score,
    };
  });

  // Honest strict sort: measured score DESC, tie-break avgLatencyMs ASC.
  // ZERO special/pinned placement for Track 01 primary miner.
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.avgLatencyMs - b.avgLatencyMs;
  });

  return entries;
}

export class LedgerStore {
  private readonly filePath: string;
  private readonly records: AdjudicationRecord[] = [];
  private readonly maxMemoryRecords: number;

  constructor(filePath: string, maxMemoryRecords = 1000) {
    this.filePath = filePath;
    this.maxMemoryRecords = maxMemoryRecords;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const lines = readFileSync(this.filePath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);
      for (const line of lines.slice(-this.maxMemoryRecords)) {
        try {
          this.records.push(JSON.parse(line) as AdjudicationRecord);
        } catch {
          // skip corrupt trailing line
        }
      }
    } catch {
      // ignore read errors on startup
    }
  }

  append(record: AdjudicationRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxMemoryRecords) {
      this.records.shift();
    }
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  list(limit = 100): AdjudicationRecord[] {
    return this.records.slice(-limit).reverse();
  }

  get(id: string): AdjudicationRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  scoreboard(): ScoreboardEntry[] {
    return computeScoreboard(this.records);
  }

  summary() {
    const total = this.records.length;
    const verified = this.records.filter((r) => r.decision.mode === "VERIFY").length;
    const passthrough = total - verified;
    const spentUsd = Number(
      this.records.reduce((s, r) => s + r.totalCostUsd, 0).toFixed(6)
    );
    const alwaysBuyCounterfactualUsd = Number((total * 0.01).toFixed(6));
    const savedUsd = Number(
      Math.max(0, alwaysBuyCounterfactualUsd - spentUsd).toFixed(6)
    );
    const disagreements = this.records.filter((r) => r.disagreementDetected).length;
    const injectionsQuarantined = this.records.reduce(
      (s, r) => s + r.calls.filter((c) => c.injectionFlagged).length,
      0
    );
    return {
      totalRequests: total,
      verifiedRequests: verified,
      passthroughRequests: passthrough,
      totalSpentUsd: spentUsd,
      savedVsAlwaysBuyUsd: savedUsd,
      disagreementsResolved: disagreements,
      injectionsQuarantined,
    };
  }
}
