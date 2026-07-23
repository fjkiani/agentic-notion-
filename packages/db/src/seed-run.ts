// One-off seed runner: runs seedCAID then applies the UK013 (Brain Tumour Research UK) correction.
// Usage: DATABASE_URL=... tsx src/seed-run.ts
import { PrismaClient, ContactRole } from "./generated/client";
import { seedCAID } from "./seed-caid";

const prisma = new PrismaClient();

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function applyUK013Correction() {
  // Find Brain Tumour Research UK org (externalId UK013).
  const org = await prisma.advocacyOrg.findFirst({
    where: { externalId: "UK013" },
  });
  if (!org) {
    console.log("[UK013] org not found; skipping correction");
    return;
  }
  console.log(`[UK013] correcting contacts for org ${org.id} (${org.name})`);

  // The seed creates "Hugh Adams" as EXECUTIVE (from CSV "Hugh Adams (Chief Executive)").
  // Correction: Dan Knowles is CEO; Hugh Adams -> Head of Stakeholder Relations;
  // add Rachael Clayton-Fish as Director of Income Generation.

  // Clear ALL existing contacts for this org, then re-create the corrected set.
  // (The seed's deterministic id scheme `${orgId}-${slug}-${role}`.slice(0,25) collides
  // when the org id is already ~25 chars, so we can't rely on per-contact upsert ids here.)
  await prisma.orgContact.deleteMany({ where: { orgId: org.id } });

  // Correction: Dan Knowles is CEO; Hugh Adams -> Head of Stakeholder Relations;
  // add Rachael Clayton-Fish as Director of Income Generation.
  async function createContact(name: string, title: string, role: ContactRole, isPrimary: boolean, email?: string) {
    // Unique, collision-safe id: slug/role kept intact, org id suffix shortened.
    const id = `uk013-${slugify(name)}-${role.toLowerCase()}`.slice(0, 60);
    await prisma.orgContact.create({
      data: { id, orgId: org!.id, name, title, role, isPrimary, email: email ?? null, phone: null },
    });
    console.log(`[UK013]   created ${name} — ${title} (${role})`);
  }

  await createContact("Dan Knowles", "Chief Executive", ContactRole.EXECUTIVE, true);
  await createContact("Hugh Adams", "Head of Stakeholder Relations", ContactRole.COMMUNICATIONS, false);
  await createContact("Rachael Clayton-Fish", "Director of Income Generation", ContactRole.FUNDRAISING, false);
}

async function main() {
  console.log("=== Running seedCAID ===");
  const result = await seedCAID({ client: prisma });
  console.log("[seedCAID] result:", JSON.stringify(result, null, 2));

  console.log("=== Applying UK013 correction ===");
  await applyUK013Correction();

  // Final verification counts.
  const orgCount = await prisma.advocacyOrg.count();
  const grantCount = await prisma.openGrant.count();
  const contactCount = await prisma.orgContact.count();
  const uk013Contacts = await prisma.orgContact.findMany({
    where: { org: { externalId: "UK013" } },
    select: { name: true, title: true, role: true, isPrimary: true },
    orderBy: { isPrimary: "desc" },
  });
  console.log("=== FINAL COUNTS ===");
  console.log(`orgs=${orgCount} grants=${grantCount} contacts=${contactCount}`);
  console.log("UK013 contacts:", JSON.stringify(uk013Contacts, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("SEED FAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
