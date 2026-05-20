export const TEMPLATES: Record<string, string> = {
  block: `// Runs on every Nth block
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  const block = await rpc.getBlock(event.blockNumber);
  console.log("Block", event.blockNumber, "has", block.transactionCount, "txs");
}`,
  event: `// Runs when a matching contract event is emitted
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  console.log("Matched", event.matchCount, "logs in block", event.blockNumber);

  for (const log of event.matchedLogs) {
    console.log("Log from tx:", log.transactionHash);
  }
}`,
  periodic: `// Runs at a fixed interval
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  const count = (storage.get("runCount") || 0) + 1;
  storage.set("runCount", count);

  const block = await rpc.getBlock();
  console.log("Run #" + count + " at block", block.number);
}`,
  webhook: `// Runs when the webhook URL receives a POST request
async function handler(context) {
  const { event, rpc, secrets, storage } = context;

  console.log("Webhook received:", JSON.stringify(event.body));

  // Example: forward to an external API
  // const res = await fetch(secrets.WEBHOOK_URL, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ data: event.body }),
  // });
}`,
};
