import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { TelegraphEscrowReceipt } from "../types.js";

export interface EscrowPaymentRequirement {
  scheme: string;
  network: string;
  payTo: string;
  amount: string;
  extra?: {
    message?: string;
    [key: string]: unknown;
  };
}

export interface EscrowPaymentEnvelope {
  x402Version: 2;
  scheme: "escrow";
  network: string;
  payload: {
    signature: `0x${string}`;
    authorization: {
      from: `0x${string}`;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: `0x${string}`;
    };
  };
}

export async function buildEscrowPaymentHeader(
  account: PrivateKeyAccount,
  requirement: EscrowPaymentRequirement,
  nowSec: number = Math.floor(Date.now() / 1000)
): Promise<{
  headerBase64: string;
  envelope: EscrowPaymentEnvelope;
  signedMessage: string;
}> {
  const nonce = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  const validAfter = String(nowSec - 10);
  // Node enforces a max 2-minute validity window; 110s leaves safe headroom.
  const validBefore = String(nowSec + 110);

  const template =
    requirement.extra?.message ??
    [
      "Telegraph Escrow Payment",
      "",
      "Wallet: {from}",
      `Pay To: ${requirement.payTo}`,
      `Network: ${requirement.network}`,
      `Amount: ${requirement.amount} uUSDC`,
      "Resource: /v1/ask",
      "Nonce: {nonce}",
      "Valid After: {validAfter}",
      "Valid Before: {validBefore}",
    ].join("\n");

  const signedMessage = template
    .replaceAll("{from}", account.address.toLowerCase())
    .replaceAll("{nonce}", nonce)
    .replaceAll("{validAfter}", validAfter)
    .replaceAll("{validBefore}", validBefore);

  const signature = await account.signMessage({ message: signedMessage });

  const envelope: EscrowPaymentEnvelope = {
    x402Version: 2,
    scheme: "escrow",
    network: requirement.network,
    payload: {
      signature,
      authorization: {
        from: account.address,
        to: requirement.payTo,
        value: requirement.amount,
        validAfter,
        validBefore,
        nonce,
      },
    },
  };

  const headerBase64 = Buffer.from(JSON.stringify(envelope), "utf8").toString(
    "base64"
  );

  return { headerBase64, envelope, signedMessage };
}

export function decodePaymentResponseHeader(
  headerValue: string | null | undefined
): TelegraphEscrowReceipt | null {
  if (!headerValue) return null;
  try {
    const raw = Buffer.from(headerValue.trim(), "base64").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.receipt_hash !== "string") return null;
    return parsed as unknown as TelegraphEscrowReceipt;
  } catch {
    return null;
  }
}

export function parseBilledUsd(
  body: Record<string, unknown>,
  receipt: TelegraphEscrowReceipt | null,
  authorizedUsd: number
): number {
  if (receipt?.amount_uusdc && /^\d+$/.test(receipt.amount_uusdc)) {
    return Number(receipt.amount_uusdc) / 1_000_000;
  }
  const payment = body.payment as Record<string, unknown> | undefined;
  if (payment && typeof payment.amount_uusdc === "string" && /^\d+$/.test(payment.amount_uusdc)) {
    return Number(payment.amount_uusdc) / 1_000_000;
  }
  if (typeof body.cost_usd === "number" && Number.isFinite(body.cost_usd)) {
    return body.cost_usd;
  }
  return authorizedUsd;
}

export function loadEscrowAccount(
  privateKeyOverride?: `0x${string}`
): PrivateKeyAccount | null {
  const rawKey =
    privateKeyOverride ||
    (process.env.TELEGRAPH_PRIVATE_KEY as `0x${string}` | undefined);
  if (rawKey && /^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
    return privateKeyToAccount(rawKey);
  }
  const walletPath =
    process.env.TELEGRAPH_WALLET_PATH ||
    join(homedir(), ".telegraph", "wallet.json");
  if (existsSync(walletPath)) {
    try {
      const data = JSON.parse(readFileSync(walletPath, "utf8")) as {
        privateKey?: string;
      };
      if (data.privateKey && /^0x[0-9a-fA-F]{64}$/.test(data.privateKey)) {
        return privateKeyToAccount(data.privateKey as `0x${string}`);
      }
    } catch {
      return null;
    }
  }
  return null;
}
