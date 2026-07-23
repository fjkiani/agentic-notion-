/**
 * Integration test for the KB pipeline against the live DB.
 * Ingests one file per supported type, verifies chunks + embeddings,
 * then runs a semantic search. Run with:
 *   tsx src/kb/test-ingest.ts
 */
import { ingest, search, retrieveContext } from "./service.js";
import { prisma } from "@zeta/db";
import * as XLSX from "xlsx";

const WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || "cmrws2ddd00005z7zfdrgku07";
const ORG_ID = process.env.TEST_ORG_ID || "cmrws2po3000y5z7z20tu7ork"; // OCRA

function makeXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Grant Program", "Max Award", "Focus Area"],
    ["OCRA Early Career", 75000, "Ovarian cancer early detection biomarkers"],
    ["OCRA Collaborative", 300000, "Ovarian cancer immunotherapy combinations"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Grants");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function makePdf(): Buffer {
  const body =
    "OCRA Research Grant Guidelines. The Ovarian Cancer Research Alliance funds " +
    "innovative early detection and immunotherapy projects. Applicants must be " +
    "within seven years of their first faculty appointment. Maximum award is 75000 dollars.";
  const content = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${body.length + 40}>>stream
BT /F1 11 Tf 50 700 Td (${body}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Size 6/Root 1 0 R>>
%%EOF`;
  return Buffer.from(content, "latin1");
}

async function main() {
  console.log("=== KB pipeline integration test ===");

  // Clean up any previous test docs.
  const prior = await prisma.knowledgeDoc.findMany({
    where: { workspaceId: WORKSPACE_ID, title: { startsWith: "TEST_" } },
    select: { id: true },
  });
  for (const d of prior) await prisma.knowledgeDoc.delete({ where: { id: d.id } });
  console.log(`Cleaned ${prior.length} prior test docs`);

  const fixtures: Array<{ title: string; fileName: string; mime: string; buf: Buffer; orgId?: string }> = [
    {
      title: "TEST_md_guidelines",
      fileName: "guidelines.md",
      mime: "text/markdown",
      buf: Buffer.from(
        "# NBTS Funding Priorities\n\nThe National Brain Tumor Society prioritizes glioblastoma " +
          "clinical trials and pediatric brain tumor research. Grants range from 50000 to 200000 dollars. " +
          "Letters of intent are due each spring.",
        "utf-8"
      ),
    },
    {
      title: "TEST_csv_funders",
      fileName: "funders.csv",
      mime: "text/csv",
      buf: Buffer.from(
        "org,cancer_type,budget\nLUNGevity,lung cancer,5000000\nOCRA,ovarian cancer,12000000\n",
        "utf-8"
      ),
    },
    {
      title: "TEST_xlsx_grants",
      fileName: "grants.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buf: makeXlsx(),
      orgId: ORG_ID,
    },
    {
      title: "TEST_pdf_ocra",
      fileName: "ocra-guidelines.pdf",
      mime: "application/pdf",
      buf: makePdf(),
      orgId: ORG_ID,
    },
  ];

  for (const f of fixtures) {
    const t0 = Date.now();
    try {
      const { docId, chunks } = await ingest({
        workspaceId: WORKSPACE_ID,
        orgId: f.orgId ?? null,
        title: f.title,
        fileName: f.fileName,
        mimeType: f.mime,
        buffer: f.buf,
        tags: ["test"],
      });
      // verify embeddings exist
      const withEmbedding = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*)::bigint AS n FROM "KnowledgeChunk"
        WHERE "docId" = ${docId} AND "embedding" IS NOT NULL
      `;
      const embCount = Number(withEmbedding[0]?.n ?? 0);
      console.log(
        `  ${f.fileName.padEnd(24)} → doc=${docId.slice(-8)} chunks=${chunks} embedded=${embCount} (${Date.now() - t0}ms)`
      );
    } catch (e) {
      console.log(`  ${f.fileName.padEnd(24)} → FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n=== semantic search tests ===");
  const queries = [
    { q: "early detection biomarkers for ovarian cancer", orgId: null as string | null },
    { q: "glioblastoma clinical trial funding", orgId: null },
    { q: "grants for ovarian cancer immunotherapy", orgId: ORG_ID },
  ];
  for (const { q, orgId } of queries) {
    const hits = await search(q, { workspaceId: WORKSPACE_ID, orgId, k: 3 });
    console.log(`\n  Query: "${q}"${orgId ? ` [org-scoped]` : ""}`);
    for (const h of hits) {
      console.log(`    ${h.score.toFixed(3)} | ${h.docTitle} | ${h.content.slice(0, 70).replace(/\n/g, " ")}...`);
    }
  }

  console.log("\n=== retrieveContext (org-scoped) ===");
  const ctx = await retrieveContext(WORKSPACE_ID, "OCRA grant eligibility and award amount", {
    orgId: ORG_ID,
    k: 3,
  });
  console.log(`  hits=${ctx.hits.length}, context length=${ctx.text.length} chars`);
  console.log("  preview:", ctx.text.slice(0, 200).replace(/\n/g, " "));

  await prisma.$disconnect();
  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
