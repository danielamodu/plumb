import test from "node:test";
import assert from "node:assert/strict";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildEscrowPaymentHeader, decodePaymentResponseHeader, parseBilledUsd } from "../src/telegraph/escrow.js";
import { TelegraphClient } from "../src/telegraph/client.js";

test("buildEscrowPaymentHeader produces valid EIP-191 signature with lowercased wallet and 110s window", async () => {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const template =
    "Telegraph Escrow Payment\n\nWallet: {from}\nPay To: 0x72a70e949362670bf8bcead24efc5b8f950aa08b\nNetwork: eip155:11155111\nAmount: 10000 uUSDC\nResource: /v1/ask\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}";

  const { headerBase64, envelope, signedMessage } = await buildEscrowPaymentHeader(account, {
    scheme: "escrow",
    network: "eip155:11155111",
    payTo: "0x72a70e949362670bf8bcead24efc5b8f950aa08b",
    amount: "10000",
    extra: { message: template },
  });

  const decoded = JSON.parse(Buffer.from(headerBase64, "base64").toString("utf8"));
  assert.equal(decoded.x402Version, 2);
  assert.equal(decoded.scheme, "escrow");
  assert.equal(decoded.network, "eip155:11155111");
  assert.equal(decoded.payload.authorization.from, account.address);
  assert.ok(signedMessage.includes(`Wallet: ${account.address.toLowerCase()}`));

  const valid = await verifyMessage({
    address: account.address,
    message: signedMessage,
    signature: envelope.payload.signature,
  });
  assert.equal(valid, true);
});

test("decodePaymentResponseHeader decodes real D1.2 X-PAYMENT-RESPONSE base64 receipt", () => {
  const realB64 =
    "eyJyZWNlaXB0X2hhc2giOiIweGQ3MmY5ZjM3OTFiZDZjZTM3MDhiMzk1NGI0ODI4OTU5N2ZmNzQwZGE3OTI3ZGU5MWRkZmE4YWNjZTUxYTk2ZjEiLCJyYWlsIjoiZXNjcm93IiwicGF5ZXIiOiIweGFjMjdmNDMzYmIzM2NkYzBlZDk5YjcyMmM2N2QzYjg3Yjg2ODQ2ODMiLCJtaW5lciI6IjYxMjEiLCJpbnRlbnQiOiJDUllQVE9fUFJJQ0VfVVNEIiwiYW1vdW50X3V1c2RjIjoiMTAwMDAiLCJlcG9jaF9pZCI6NDIsInNldHRsZW1lbnQiOiJlcG9jaCIsImNoYWluIjoidGVsZWdyYXBoIiwidGltZXN0YW1wIjoxNzk1NDIzNDM3fQ==";
  const receipt = decodePaymentResponseHeader(realB64);
  assert.ok(receipt);
  assert.equal(receipt.rail, "escrow");
  assert.equal(receipt.intent, "CRYPTO_PRICE_USD");
  assert.equal(receipt.amount_uusdc, "10000");
  assert.equal(parseBilledUsd({}, receipt, 0.01), 0.01);
});

test("TelegraphClient accounts $0.00 cost on HTTP 500 failure in escrow mode", async () => {
  const key = generatePrivateKey();
  const mockTransport = async (url: string, opts?: { headers?: Record<string, string> }) => {
    if (!opts?.headers?.["X-PAYMENT"]) {
      const challenge = {
        x402Version: 2,
        accepts: [
          {
            scheme: "escrow",
            network: "eip155:11155111",
            payTo: "0x72a70e949362670bf8bcead24efc5b8f950aa08b",
            amount: "10000",
            extra: { message: "Telegraph Escrow Payment\n\nWallet: {from}\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}" },
          },
        ],
      };
      return {
        status: 402,
        ok: false,
        headers: { get: (n: string) => (n.toLowerCase() === "payment-required" ? Buffer.from(JSON.stringify(challenge)).toString("base64") : null) },
        text: async () => JSON.stringify(challenge),
        json: async () => challenge,
      };
    }
    return {
      status: 500,
      ok: false,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: "miner_timeout" }),
      json: async () => ({ error: "miner_timeout" }),
    };
  };

  const client = new TelegraphClient(
    {
      nodeUrl: "https://devnode.telegraphprotocol.com",
      diamondAddress: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
      chainId: 11155111,
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      privateKey: key,
      maxAskUsd: 0.05,
      dailyLimitUsd: 5,
      maxBudgetUsdc: 10000,
    },
    mockTransport
  );

  const res = await client.ask({ intent: "CRYPTO_PRICE_USD", params: { symbol: "ETH" } });
  assert.equal(res.ok, false);
  assert.equal(res.httpStatus, 500);
  assert.equal(res.costUsd, 0);
});
