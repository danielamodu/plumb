import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  verifyDossierHash,
  type DossierStore,
  type PayoutDossier,
} from "../policy/dossier.js";

export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export interface CosignResult {
  dossierId: string;
  dossierHash: string;
  verdict: PayoutDossier["verdict"];
  signedByAgent: boolean;
  signedByCosigner: boolean;
  missingCosignature: boolean;
  broadcast: boolean;
  memoText: string | null;
  solanaSignature: string | null;
  solanaExplorerUrl: string | null;
  agentPubkey: string;
  cosignerPubkey: string;
  reason: string;
}

export function buildCosignedMemoTransaction(params: {
  agentPubkey: PublicKey;
  cosignerPubkey: PublicKey;
  recipientPubkey: PublicKey;
  lamports: number;
  dossierHash: string;
  recentBlockhash?: string;
}): { transaction: Transaction; memoText: string } {
  const memoText = `plumb:v1:${params.dossierHash}`;
  const tx = new Transaction();
  if (params.recentBlockhash) {
    tx.recentBlockhash = params.recentBlockhash as Transaction["recentBlockhash"];
  }
  tx.feePayer = params.cosignerPubkey;

  // Instruction 1: Agent transfers payout lamports to vendor recipient
  tx.add(
    SystemProgram.transfer({
      fromPubkey: params.agentPubkey,
      toPubkey: params.recipientPubkey,
      lamports: params.lamports,
    })
  );

  // Instruction 2: SPL Memo requiring BOTH Agent and plumb Policy Co-Signer signatures
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [
        { pubkey: params.cosignerPubkey, isSigner: true, isWritable: false },
        { pubkey: params.agentPubkey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from(memoText, "utf8"),
    })
  );

  return { transaction: tx, memoText };
}

export async function cosignPayoutDossier(
  dossier: PayoutDossier,
  deps: {
    agentKeypair: Keypair;
    cosignerKeypair: Keypair;
    amountSol: number;
    rpcUrl?: string;
    broadcastTx?: (
      tx: Transaction,
      signers: [Keypair, Keypair]
    ) => Promise<string>;
  }
): Promise<CosignResult> {
  const agentPubkey = deps.agentKeypair.publicKey.toBase58();
  const cosignerPubkey = deps.cosignerKeypair.publicKey.toBase58();

  // Cryptographic policy enforcement: refuse co-signature unless ALLOW + valid canonical hash
  if (dossier.verdict !== "ALLOW" || !verifyDossierHash(dossier)) {
    return {
      dossierId: dossier.id,
      dossierHash: dossier.dossierHash,
      verdict: dossier.verdict,
      signedByAgent: true,
      signedByCosigner: false,
      missingCosignature: true,
      broadcast: false,
      memoText: null,
      solanaSignature: null,
      solanaExplorerUrl: null,
      agentPubkey,
      cosignerPubkey,
      reason: `plumb Policy Co-Signer refused co-signature (verdict=${dossier.verdict}, rules=${dossier.triggeredRules.join(",") || "hash_invalid"})`,
    };
  }

  const recipientPubkey = new PublicKey(dossier.invoice.recipientPubkey);
  const lamports = Math.max(1, Math.round(deps.amountSol * Number(LAMPORTS_PER_SOL)));
  const { transaction, memoText } = buildCosignedMemoTransaction({
    agentPubkey: deps.agentKeypair.publicKey,
    cosignerPubkey: deps.cosignerKeypair.publicKey,
    recipientPubkey,
    lamports,
    dossierHash: dossier.dossierHash,
  });

  let signature: string;
  if (deps.broadcastTx) {
    signature = await deps.broadcastTx(transaction, [
      deps.cosignerKeypair,
      deps.agentKeypair,
    ]);
  } else {
    const conn = new Connection(
      deps.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
      "confirmed"
    );
    signature = await sendAndConfirmTransaction(conn, transaction, [
      deps.cosignerKeypair,
      deps.agentKeypair,
    ], { commitment: "confirmed" });
  }

  return {
    dossierId: dossier.id,
    dossierHash: dossier.dossierHash,
    verdict: dossier.verdict,
    signedByAgent: true,
    signedByCosigner: true,
    missingCosignature: false,
    broadcast: true,
    memoText,
    solanaSignature: signature,
    solanaExplorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    agentPubkey,
    cosignerPubkey,
    reason: `2-of-2 co-signed by Agent + plumb Policy Co-Signer with on-chain Memo ${memoText}`,
  };
}

export function extractMemoDossierHash(logMessages: string[]): string | null {
  for (const line of logMessages) {
    const m = line.match(/plumb:v1:([0-9a-f]{64})/i);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export interface OnChainTxSnapshot {
  slot: number;
  blockTime: number | null;
  logMessages: string[];
  signerPubkeys: string[];
}

export interface PayoutVerificationResult {
  verified: boolean;
  solanaSignature: string;
  solanaExplorerUrl: string;
  slot?: number;
  blockTimeUtc?: string | null;
  onChainMemoHash: string | null;
  dossierFound: boolean;
  canonicalHashValid: boolean;
  cosignerSignaturePresent: boolean;
  telegraphReceiptHashes: string[];
  dossier?: PayoutDossier;
  error?: string;
}

export async function verifySolanaPayout(
  signature: string,
  store: DossierStore,
  options?: {
    rpcUrl?: string;
    expectedCosignerPubkey?: string;
    fetchOnChainTx?: (sig: string) => Promise<OnChainTxSnapshot | null>;
  }
): Promise<PayoutVerificationResult> {
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  let snap: OnChainTxSnapshot | null = null;

  try {
    if (options?.fetchOnChainTx) {
      snap = await options.fetchOnChainTx(signature);
    } else {
      const conn = new Connection(
        options?.rpcUrl ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
        "confirmed"
      );
      const tx = await conn.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (tx) {
        const msg = tx.transaction.message;
        const staticKeys = msg.staticAccountKeys.map((k) => k.toBase58());
        const numSigners = msg.header.numRequiredSignatures;
        snap = {
          slot: Number(tx.slot),
          blockTime: tx.blockTime ? Number(tx.blockTime) : null,
          logMessages: tx.meta?.logMessages ?? [],
          signerPubkeys: staticKeys.slice(0, numSigners),
        };
      }
    }
  } catch (err) {
    return {
      verified: false,
      solanaSignature: signature,
      solanaExplorerUrl: explorerUrl,
      onChainMemoHash: null,
      dossierFound: false,
      canonicalHashValid: false,
      cosignerSignaturePresent: false,
      telegraphReceiptHashes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!snap) {
    return {
      verified: false,
      solanaSignature: signature,
      solanaExplorerUrl: explorerUrl,
      onChainMemoHash: null,
      dossierFound: false,
      canonicalHashValid: false,
      cosignerSignaturePresent: false,
      telegraphReceiptHashes: [],
      error: "Transaction not found on Solana Devnet",
    };
  }

  const onChainMemoHash = extractMemoDossierHash(snap.logMessages);
  const dossier =
    (onChainMemoHash ? store.getByHash(onChainMemoHash) : undefined) ??
    store.getBySolanaSignature(signature);
  const canonicalHashValid = Boolean(
    dossier && onChainMemoHash && dossier.dossierHash === onChainMemoHash && verifyDossierHash(dossier)
  );
  const cosignerSignaturePresent = options?.expectedCosignerPubkey
    ? snap.signerPubkeys.includes(options.expectedCosignerPubkey)
    : snap.signerPubkeys.length >= 2;
  const telegraphReceiptHashes = (dossier?.checks ?? [])
    .map((c) => c.receiptHash)
    .filter((h): h is string => Boolean(h));

  return {
    verified: Boolean(dossier && canonicalHashValid && cosignerSignaturePresent),
    solanaSignature: signature,
    solanaExplorerUrl: explorerUrl,
    slot: snap.slot,
    blockTimeUtc: snap.blockTime ? new Date(snap.blockTime * 1000).toISOString() : null,
    onChainMemoHash,
    dossierFound: Boolean(dossier),
    canonicalHashValid,
    cosignerSignaturePresent,
    telegraphReceiptHashes,
    dossier,
  };
}
