import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, seedCAID } from "@zeta/db";

function repoRoot(): string {
  // dist/bootstrap.js -> apps/mcp-server/dist -> repo root
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function runDbPush(): void {
  const dbDir = path.join(repoRoot(), "packages/db");
  console.log("[CAID MCP] Applying database schema...");
  const result = spawnSync(
    "npx",
    ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
    { cwd: dbDir, env: process.env, stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`prisma db push failed with exit code ${result.status ?? "unknown"}`);
  }
  console.log("[CAID MCP] Database schema applied");
}

export async function bootstrapDatabase(): Promise<void> {
  runDbPush();

  const orgCount = await prisma.advocacyOrg.count();
  if (orgCount === 0 || process.env.SEED_ON_START === "true") {
    console.log("[CAID MCP] Running database seed...");
    const result = await seedCAID();
    console.log("[CAID MCP] Seed complete:", result);
  } else {
    console.log(`[CAID MCP] Database has ${orgCount} orgs — skipping seed`);
  }
}
