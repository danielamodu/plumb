// Frozen canonical interfaces for plumb (Mission 07 — Telegraph Season II)

export interface TelegraphEscrowReceipt {
  receipt_hash: `0x${string}`;
  rail: "escrow";
  payer: `0x${string}`;
  miner: string;
  intent: string;
  amount_uusdc: string;
  epoch_id: number;
  settlement: "epoch";
  chain: "telegraph";
  timestamp: number;
}

export interface TelegraphEscrowConfig {
  nodeUrl: string;
  diamondAddress: `0x${string}`;
  chainId: 11155111;
  rpcUrl: string;
  privateKey?: `0x${string}`;
  anjomanApiKey?: string;
  maxAskUsd: number;
  dailyLimitUsd: number;
  maxBudgetUsdc: number;
}

export interface TelegraphAskRequest {
  intent?: string;
  params?: Record<string, unknown>;
  query?: string;
  max_budget_usdc?: number;
  minerId?: string;
}

export interface TelegraphAskResult {
  ok: boolean;
  httpStatus: number;
  rail: "escrow" | "anjoman";
  intent: string;
  minerId?: string;
  minerName?: string;
  minerRank?: number;
  endpoint?: string;
  answer: unknown;
  costUsd: number;
  authorizedUsd: number;
  signalHash?: string;
  receiptHash?: string;
  rawReceipt?: TelegraphEscrowReceipt | Record<string, unknown>;
  rawBody?: Record<string, unknown>;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface BudgetReservation {
  id: string;
  reservedUsd: number;
  createdAtMs: number;
}

export interface BudgetGate {
  reserve(maxUsd: number, requestCapUsd?: number): Promise<BudgetReservation>;
  settle(reservationId: string, actualUsd: number): Promise<void>;
  release(reservationId: string): Promise<void>;
  snapshot(): { dailySpentUsd: number; inFlightReservedUsd: number; dailyLimitUsd: number };
}

export type BoundaryMode = "PASSTHROUGH" | "VERIFY";

export type SupportedIntent =
  | "CRYPTO_PRICE_USD"
  | "STOCK_PRICE_US_EQUITY"
  | "FX_NOW_EUR"
  | "FX_NOW_CAD"
  | "CURRENCY_EXCHANGE_CONVERT"
  | "WEATHER_CHECK_TEMPERATURE"
  | "URL_SCAN_VERDICT"
  | "SSL_VERIFICATION_CERT"
  | "DNS_RECORD_LOOKUP_GENERAL";

export interface BoundaryDecision {
  mode: BoundaryMode;
  intent?: SupportedIntent;
  params?: Record<string, unknown>;
  reason: string;
  confidence: number;
  classifierLatencyMs: number;
}

export interface SanitizedAnswer {
  valid: boolean;
  data?: Record<string, unknown>;
  injectionDetected: boolean;
  rejectionReason?: string;
}

export interface MinerCallTrace {
  minerId: string;
  minerSlug?: string;
  minerName?: string;
  rank?: number;
  isPrimaryTrack01: boolean;
  httpStatus: number;
  latencyMs: number;
  schemaValid: boolean;
  injectionFlagged: boolean;
  costUsd: number;
  signalHash?: string;
  receiptHash?: string;
  parsedValue?: unknown;
  error?: string;
}

export interface ReferenceSnapshot {
  sourceName: string;
  capturedAtUtc: string;
  referenceValue: unknown;
  toleranceBand: string;
}

export interface AdjudicationRecord {
  id: string;
  timestamp: string;
  promptHash: string;
  promptPreview: string;
  decision: BoundaryDecision;
  status:
    | "PASSTHROUGH_OK"
    | "VERIFIED_OK"
    | "DISAGREEMENT_RESOLVED"
    | "FAIL_CLOSED_BUDGET"
    | "FAIL_CLOSED_MINER";
  calls: MinerCallTrace[];
  finalValue?: unknown;
  totalCostUsd: number;
  totalLatencyMs: number;
  disagreementDetected: boolean;
  groundTruthCheck?: {
    snapshot: ReferenceSnapshot;
    matchedMinerIds: string[];
    failedMinerIds: string[];
  };
  bugReportMarkdown?: string;
}
