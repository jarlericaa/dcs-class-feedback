/**
 * Development scheduler loop: runs the reconciliation sweep every 60 seconds.
 * Production deployments may run this same script, or hit
 * POST /api/internal/scheduler/tick from an external cron.
 */
export {};

const INTERVAL_MS = 60_000;

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — rely on real environment variables
  }
  const { reconcile } = await import("../src/modules/scheduling");

  while (true) {
    try {
      const result = await reconcile();
      console.log(new Date().toISOString(), "reconcile", result);
    } catch (err) {
      console.error(new Date().toISOString(), "reconcile failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
