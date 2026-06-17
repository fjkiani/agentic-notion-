import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma, seedCAID } from "@zeta/db";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function runCommand(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, env: process.env, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function databaseHost(): string {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const match = dbUrl.match(/^postgres(?:ql)?:\/\/[^@]+@([^/?]+)/);
  return match?.[1] ?? "unknown";
}

/** Render free Postgres can take 30–60s to accept connections after wake. */
async function waitForDatabase(maxAttempts = 12): Promise<void> {
  const host = databaseHost();
  console.log(`[CAID MCP] Waiting for Postgres at ${host}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`[CAID MCP] Postgres connected (attempt ${attempt})`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[CAID MCP] Postgres not ready (${attempt}/${maxAttempts}): ${message}`);
      if (attempt === maxAttempts) {
        throw new Error(
          `Postgres unreachable at ${host} after ${maxAttempts} attempts. ` +
            "On Render: confirm zeta-caid-db is Available, linked to this service, and in Oregon."
        );
      }
      await sleep(Math.min(5000 * attempt, 30000));
    }
  }
}

function runDbPush(): void {
  const root = repoRoot();
  console.log("[CAID MCP] Applying database schema...");
  // Use pnpm filter so Prisma resolves from @zeta/db (devDependency), not a bare binary path.
  runCommand(
    "pnpm",
    ["--filter", "@zeta/db", "exec", "prisma", "db", "push", "--accept-data-loss"],
    root
  );
  console.log("[CAID MCP] Database schema applied");
}

export async function bootstrapDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  if (databaseHost().startsWith("dpg-") && !databaseHost().includes(".render.com")) {
    console.log("[CAID MCP] Using Render internal database URL");
  }

  await waitForDatabase();
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
