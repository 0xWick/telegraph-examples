/**
 * Direct x402 inference against the NEW litellm miner (id 104, nova-pro).
 * Same flow as examples/04-x402-direct/chat.ts, retargeted.
 */
import { ethers } from "ethers";
import { config, requireAgentKey } from "../../src/lib/config.js";
import { log } from "../../src/lib/log.js";
import { fetchWithPayment } from "../../src/lib/x402.js";
import { provider, findTransfers, pollUntil } from "../../src/lib/chain.js";
import { ADDRESSES, BASESCAN, fmtUSDC } from "../../src/lib/protocol.js";

const prompt = process.argv.slice(2).filter((a) => a !== "--").join(" ")
  || "Reply with exactly one short sentence: what is the capital of France?";

async function main() {
  log.banner("Direct x402 → LiteLLM chat (miner 104, nova-pro)");
  const wallet = new ethers.Wallet(requireAgentKey());
  const p = provider();
  const startBlock = await p.getBlockNumber();
  log.kv("payer", wallet.address);
  log.kv("prompt", prompt);

  const { response, paid, payment } = await fetchWithPayment(
    `${config.dispatcherUrl}/v1/104/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nova-pro", messages: [{ role: "user", content: prompt }] }),
    },
    wallet,
    config.chainId,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const body: any = await response.json();

  const answer = body?.choices?.[0]?.message?.content ?? JSON.stringify(body).slice(0, 300);
  log.ok(`answer (paid: ${paid}):`);
  console.log(`\n   ${answer}\n`);
  log.kv("model", body?.model);
  log.kv("tokens", body?.usage?.total_tokens);

  if (paid && payment) {
    log.banner("On-chain verification");
    const transfer = await pollUntil(async () => {
      const xfers = await findTransfers(ADDRESSES.usdcX402, startBlock, { from: wallet.address, to: payment.accept.payTo }, p);
      return xfers.find((x) => x.value === BigInt(payment.authorization.value)) ?? null;
    }, { timeoutMs: 180_000, intervalMs: 5_000, label: "USDC settlement transfer" });
    log.ok(`paid ${fmtUSDC(transfer.value)} → ${transfer.to}`);
    log.kv("tx", `${BASESCAN}/tx/${transfer.txHash}`);
  }
}

main().catch((e) => { log.fail(String(e?.message ?? e)); process.exit(1); });
