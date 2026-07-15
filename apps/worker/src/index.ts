import { PgBoss } from "pg-boss";
import { config } from "@class-feedback/config";

async function start(): Promise<void> {
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
  });

  await boss.start();

  boss.on("error", (error: Error) => {
    console.error("pg-boss error:", error);
  });

  console.log("Background worker started");

  const gracefulShutdown = async (): Promise<void> => {
    console.log("Shutting down worker...");
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}

start().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
