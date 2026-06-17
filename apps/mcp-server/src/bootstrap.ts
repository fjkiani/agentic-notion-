import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, seedCAID } from "@zeta/db";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function prismaCli(): string {
  return path.join(repoRoot(), "node_modules/.bin/prisma");
}

function runDbPush(): void {
  const root = repoRoot();
  const dbDir = path.join(root, "packages/db");
  console.log("[CAID MCP] Applying database schema...");
  const result = spawnSync(
    prismaCli(),
    [
      "db",
      "push",
      "--schema=prisma/schema.prisma",
      "--skip-generate",
      "--accept-data-loss",
    ],
    { cwd: dbDir, env: process.env, stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`prisma db push failed with exit code ${result.status ?? "unknown"}`);
  }
  console.log("[CAID MCP] Database schema applied");
}

export async function bootstrapDatabase(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const host = dbUrl.replace(/^postgres(ql)?:\/\/[^@]+@([^/]+).*/, "$2");
  console.log(`[CAID MCP] Database host: ${host}`);

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
