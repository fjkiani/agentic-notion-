import * as fs from "fs";
import * as path from "path";
import {
  PrismaClient,
  OrgType,
  OrgStatus,
  GrantStatus,
  GrantType,
  ContactRole,
} from "./generated/client/index.js";

const prisma = new PrismaClient();

export interface SeedResult {
  workspaceSlug: string;
  orgCount: number;
  grantCount: number;
  contactCount: number;
  openGrants: number;
  gbmGrants: number;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function parseBudget(s: string | null): number | null {
  if (!s || s === "nan") return null;
  const clean = s.replace(/[£€$,\s]/g, "").toUpperCase();
  const m = clean.match(/^([\d.]+)([KMB]?)\+?/);
  if (!m) return null;
  const val = parseFloat(m[1]!);
  const mult: Record<string, number> = { K: 1_000, M: 1_000_000, B: 1_000_000_000, "": 1 };
  return val * (mult[m[2] ?? ""] ?? 1);
}

function mapOrgType(raw: string): OrgType {
  const r = raw.toLowerCase();
  if (r.includes("government") || r.includes("federal") || r.includes("un agency")) return OrgType.GOVERNMENT;
  if (r.includes("research institute") || r.includes("scientific society")) return OrgType.RESEARCH_INSTITUTE;
  if (r.includes("foundation")) return OrgType.FOUNDATION;
  if (r.includes("patient support") || r.includes("patient advocacy")) return OrgType.PATIENT_GROUP;
  if (r.includes("coalition") || r.includes("alliance") || r.includes("collaborative")) return OrgType.COALITION;
  if (r.includes("industry") || r.includes("corporate")) return OrgType.INDUSTRY;
  return OrgType.NONPROFIT;
}

function parseCancerTypes(focus: string): string[] {
  const f = focus.toLowerCase();
  const tags: string[] = [];
  const map: Record<string, string[]> = {
    gbm: ["GBM", "brain", "glioblastoma"],
    glioblastoma: ["GBM", "brain", "glioblastoma"],
    brain: ["brain", "GBM"],
    breast: ["breast"],
    lung: ["lung"],
    pancreatic: ["pancreatic"],
    pediatric: ["pediatric", "childhood"],
    childhood: ["pediatric", "childhood"],
    blood: ["blood", "hematologic"],
    leukemia: ["leukemia", "blood"],
    lymphoma: ["lymphoma", "blood"],
    myeloma: ["myeloma", "blood"],
    sarcoma: ["sarcoma", "rare"],
    rare: ["rare"],
    "pan-cancer": ["pan-cancer"],
    colorectal: ["colorectal"],
    prostate: ["prostate"],
    ovarian: ["ovarian", "gynecologic"],
    melanoma: ["melanoma", "skin"],
    bladder: ["bladder"],
    kidney: ["kidney", "renal"],
    thyroid: ["thyroid"],
    cervical: ["cervical", "gynecologic"],
    bone: ["bone", "sarcoma"],
    cholangiocarcinoma: ["cholangiocarcinoma", "bile duct", "rare"],
  };
  for (const [key, vals] of Object.entries(map)) {
    if (f.includes(key)) tags.push(...vals);
  }
  return [...new Set(tags.length ? tags : ["pan-cancer"])];
}

function parseCountry(raw: string): string {
  if (raw.includes("USA") || raw.includes("US")) return "USA";
  if (raw.includes("UK") || raw.includes("Wales")) return "UK";
  if (raw.includes("Canada")) return "Canada";
  if (raw.includes("Australia")) return "Australia";
  if (raw.includes("France")) return "France";
  if (raw.includes("Belgium")) return "Belgium";
  if (raw.includes("Switzerland")) return "Switzerland";
  return "Global";
}

const GRANTS = [
  { orgId: "US016", title: "Lustgarten Foundation Innovation & Collaboration Program", fundingAmountMax: null, deadlineRaw: "LOI Jan 5 2026", status: GrantStatus.CLOSED, grantType: GrantType.RESEARCH, cancerTypes: ["pancreatic"], geographicScope: ["USA", "Global"], requiresLOI: true, currency: "USD", eligibilityCriteria: "Open to academic and nonprofit researchers", sourceNotes: "Innovation & Collaboration Program; LOI deadline Jan 5 2026" },
  { orgId: "US017", title: "OCRA Research Grant Program 2027", fundingAmountMax: null, deadlineRaw: "LOI Feb 25 2026", status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["ovarian", "gynecologic"], geographicScope: ["USA", "Global"], requiresLOI: true, loiDeadlineRaw: "Feb 25 2026", currency: "USD", eligibilityCriteria: "Academic researchers; $140M+ awarded in 400+ grants historically", sourceNotes: "2027 grant cycle LOI opens Feb 25 2026" },
  { orgId: "US019", title: "LUNGevity RETpositive Pan-Cancer RET Grant", fundingAmountMax: null, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["lung", "pan-cancer"], geographicScope: ["USA", "Global"], requiresLOI: false, currency: "USD", sourceNotes: "RETpositive/LUNGevity pan-cancer RET grant program" },
  { orgId: "US021", title: "NBTS Sharpe-NBTS GBM Research Awards", fundingAmountMax: null, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["GBM", "brain", "glioblastoma"], geographicScope: ["USA", "Global"], requiresLOI: false, currency: "USD", eligibilityCriteria: "GBM-focused research; $52M+ in research grants awarded", sourceNotes: "Sharpe-NBTS GBM Awards" },
  { orgId: "US022", title: "ABTA Discovery Grant for GBM", fundingAmountMax: 1_300_000, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["GBM", "brain", "glioblastoma"], geographicScope: ["USA", "Global"], requiresLOI: false, currency: "USD", eligibilityCriteria: "Brain tumor researchers; $1.3M+ in 31 grants in 2025", sourceNotes: "Discovery Grant for GBM" },
  { orgId: "US023", title: "Ben & Catherine Ivy Foundation Research Grant", fundingAmountMax: null, deadlineRaw: null, status: GrantStatus.CLOSED, grantType: GrantType.RESEARCH, cancerTypes: ["GBM", "brain", "glioblastoma"], geographicScope: ["USA"], requiresLOI: false, currency: "USD", eligibilityCriteria: "NOT accepting grant proposals in 2026", sourceNotes: "$179M invested; NOT accepting grant proposals in 2026" },
  { orgId: "US024", title: "Sontag Foundation Distinguished Scientist Award", fundingAmountMax: 750_000, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.FELLOWSHIP, cancerTypes: ["GBM", "brain", "glioblastoma"], geographicScope: ["USA", "Global"], requiresLOI: false, currency: "USD", eligibilityCriteria: "Distinguished scientists in GBM research; $750K annually", sourceNotes: "Distinguished Scientist Award $750K annually" },
  { orgId: "US028", title: "Gray for Glioblastoma Research Grant", fundingAmountMax: null, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["GBM", "brain", "glioblastoma"], geographicScope: ["USA"], requiresLOI: false, currency: "USD", sourceNotes: "Open grant applications; see website for PDF requirements" },
  { orgId: "US031", title: "CureSearch Young Investigator Award", fundingAmountMax: 225_000, fundingAmountMin: 75_000, deadlineRaw: "LOI Apr 14 2026", status: GrantStatus.OPEN, grantType: GrantType.FELLOWSHIP, cancerTypes: ["pediatric", "childhood"], geographicScope: ["USA", "Global"], requiresLOI: true, loiDeadlineRaw: "Apr 14 2026", currency: "USD", awardDuration: "3 years", sourceNotes: "Young Investigator Award ($75K/yr x3); LOI due Apr 14 2026" },
  { orgId: "US031", title: "CureSearch Catapult Award", fundingAmountMax: 2_500_000, fundingAmountMin: 500_000, deadlineRaw: "LOI Apr 14 2026", status: GrantStatus.OPEN, grantType: GrantType.INNOVATION, cancerTypes: ["pediatric", "childhood"], geographicScope: ["USA", "Global"], requiresLOI: true, loiDeadlineRaw: "Apr 14 2026", currency: "USD", sourceNotes: "Catapult Award ($500K-$2.5M); LOI due Apr 14 2026" },
  { orgId: "US032", title: "CCRF Hard-to-Treat Pediatric Cancer Grant", fundingAmountMax: null, deadlineRaw: "LOI Mar 2 2026", status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["pediatric", "childhood"], geographicScope: ["USA"], requiresLOI: true, loiDeadlineRaw: "Mar 2 2026", currency: "USD", sourceNotes: "Hard-to-Treat LOI 3/2/2026" },
  { orgId: "US032", title: "CCRF Survivorship Grant", fundingAmountMax: null, deadlineRaw: "LOI Apr 24 2026", status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["pediatric", "childhood"], geographicScope: ["USA"], requiresLOI: true, loiDeadlineRaw: "Apr 24 2026", currency: "USD", sourceNotes: "Survivorship LOI 4/24/2026" },
  { orgId: "US033", title: "NPCF Fusion-Positive Rhabdomyosarcoma RFA", fundingAmountMax: null, deadlineRaw: "Feb 6 2026", status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["pediatric", "sarcoma", "rare"], geographicScope: ["USA", "Global"], requiresLOI: false, currency: "USD", sourceNotes: "RFA: Fusion-Positive Rhabdomyosarcoma" },
  { orgId: "US035", title: "Hyundai Hope on Wheels Scholar Hope Grant", fundingAmountMax: 400_000, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.FELLOWSHIP, cancerTypes: ["pediatric", "childhood"], geographicScope: ["USA"], requiresLOI: false, currency: "USD", sourceNotes: "Scholar Hope $400K" },
  { orgId: "US035", title: "Hyundai Hope on Wheels Young Investigator Grant", fundingAmountMax: 300_000, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.FELLOWSHIP, cancerTypes: ["pediatric", "childhood"], geographicScope: ["USA"], requiresLOI: false, currency: "USD", sourceNotes: "Young Investigator $300K" },
  { orgId: "US036", title: "Cannonball Kids Cancer Clinical Trial Grant", fundingAmountMax: 200_000, deadlineRaw: "LOI Jun 1", status: GrantStatus.OPEN, grantType: GrantType.CLINICAL_TRIAL, cancerTypes: ["pediatric", "childhood"], geographicScope: ["USA"], requiresLOI: true, loiDeadlineRaw: "Jun 1", currency: "USD", awardDuration: "3 years", sourceNotes: "Clinical Trial Grant $200K/3yr" },
  { orgId: "US043", title: "Fibrolamellar Cancer Foundation Rolling Research Grant", fundingAmountMax: null, deadlineRaw: "Rolling: Mar 1, Jul 1, Nov 1", status: GrantStatus.ROLLING, grantType: GrantType.RESEARCH, cancerTypes: ["rare", "liver"], geographicScope: ["USA", "Global"], requiresLOI: false, currency: "USD", sourceNotes: "Rolling grants 3x/year: Mar 1, Jul 1, Nov 1 deadlines" },
  { orgId: "UK002", title: "Macmillan CARE Grants Programme", fundingAmountMax: 150_000, fundingAmountMin: 50_000, deadlineRaw: "Jan 23 2026", status: GrantStatus.CLOSED, grantType: GrantType.PATIENT_SUPPORT, cancerTypes: ["pan-cancer"], geographicScope: ["UK"], requiresLOI: false, currency: "GBP", sourceNotes: "CARE Grants Programme: £50K-£150K; deadline Jan 23 2026 (closed)" },
  { orgId: "UK008", title: "Children with Cancer UK Research Grant 2026", fundingAmountMax: 350_000, deadlineRaw: "May 28 2026", status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["pediatric", "childhood"], geographicScope: ["UK", "Europe"], requiresLOI: false, currency: "GBP", eligibilityCriteria: "UK-based researchers; open Mar 6 - May 28 2026", sourceNotes: "2026 Grant Call: up to £350K; open Mar 6 - May 28 2026" },
  { orgId: "UK009", title: "CCLG-BCRT Idea Grants", fundingAmountMax: 50_000, deadlineRaw: "Jul 31 2026", status: GrantStatus.OPEN, grantType: GrantType.SEED, cancerTypes: ["pediatric", "childhood", "bone", "sarcoma"], geographicScope: ["UK"], requiresLOI: false, currency: "GBP", sourceNotes: "Idea Grants with BCRT: up to £50K; deadline Jul 31 2026" },
  { orgId: "UK013", title: "Brain Tumour Research UK Centres of Excellence Grant", fundingAmountMax: null, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["GBM", "brain", "glioblastoma", "brain tumors"], geographicScope: ["UK", "Europe"], requiresLOI: false, currency: "GBP", eligibilityCriteria: "UK-based researchers and institutions; funds Centres of Excellence at UK universities", sourceNotes: "Funds Centres of Excellence at UK universities" },
  { orgId: "GL001", title: "UICC Reimagining Cancer Research in Europe Grant", fundingAmountMax: 500_000, deadlineRaw: "Feb 16 2026", status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["pan-cancer"], geographicScope: ["Europe", "UK"], requiresLOI: false, currency: "EUR", eligibilityCriteria: "UK institutions eligible; up to €500K/2yr; 2nd call Nov 14 2025 - Feb 16 2026", sourceNotes: "2nd call: Nov 14 2025 - Feb 16 2026; up to €500K/2yr; UK institutions eligible" },
  { orgId: "GL004", title: "WCRF Regular Grant Programme", fundingAmountMax: 500_000, deadlineRaw: "Nov 4 2025", status: GrantStatus.CLOSED, grantType: GrantType.RESEARCH, cancerTypes: ["pan-cancer"], geographicScope: ["Global", "UK"], requiresLOI: true, loiDeadlineRaw: "Nov 4 2025", currency: "GBP", awardDuration: "4 years", sourceNotes: "Regular Grant Programme: up to £500K/4yr; deadline Nov 4 2025 (outline)" },
  { orgId: "GL004", title: "WCRF INSPIRE Grant", fundingAmountMax: 60_000, deadlineRaw: "Nov 4 2025", status: GrantStatus.CLOSED, grantType: GrantType.SEED, cancerTypes: ["pan-cancer"], geographicScope: ["Global", "UK"], requiresLOI: true, loiDeadlineRaw: "Nov 4 2025", currency: "GBP", awardDuration: "1 year", sourceNotes: "INSPIRE: up to £60K/1yr; deadline Nov 4 2025" },
  { orgId: "GL006", title: "Reimagining Cancer Research in Europe Grant (UICC)", fundingAmountMax: 500_000, deadlineRaw: "Feb 16 2026", status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["pan-cancer"], geographicScope: ["Europe", "UK"], requiresLOI: false, currency: "EUR", eligibilityCriteria: "UK institutions eligible; up to €500K/2yr", sourceNotes: "2nd call: Nov 14 2025 - Feb 16 2026; up to €500K/2yr; UK institutions eligible" },
  { orgId: "GL011", title: "Brain Tumor Funders Collaborative Liquid Biopsy Grant", fundingAmountMax: null, deadlineRaw: null, status: GrantStatus.OPEN, grantType: GrantType.RESEARCH, cancerTypes: ["GBM", "brain", "glioblastoma"], geographicScope: ["USA", "Global"], requiresLOI: false, currency: "USD", sourceNotes: "2024-2025 Liquid Biopsy Grants; partnership of private philanthropic orgs" },
];

function defaultCsvPath(): string {
  const candidates = [
    path.join(process.cwd(), "data/caid_enriched.csv"),
    path.join(process.cwd(), "../../data/caid_enriched.csv"),
    path.join(process.cwd(), "../../../data/caid_enriched.csv"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`caid_enriched.csv not found. Tried: ${candidates.join(", ")}`);
}

export async function seedCAID(options?: {
  csvPath?: string;
  client?: PrismaClient;
}): Promise<SeedResult> {
  const db = options?.client ?? prisma;
  const csvPath = options?.csvPath ?? defaultCsvPath();

  const workspace = await db.workspace.upsert({
    where: { slug: "caid-demo" },
    update: {},
    create: {
      slug: "caid-demo",
      name: "CAID Intelligence Platform",
      description: "Cancer Advocacy Intelligence Database — Bloomberg Terminal for Biotech & Oncology Capital",
    },
  });

  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const vals: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        vals.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    vals.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] ?? "").replace(/^"|"$/g, "");
    });
    rows.push(row);
  }

  const orgIdMap: Record<string, string> = {};
  let orgCount = 0;

  for (const row of rows) {
    const slug = slugify(row.Organization_Name ?? "unknown");
    const cancerTypes = parseCancerTypes(row.Cancer_Type_Focus ?? "");
    const country = parseCountry(row.Country ?? "");
    const orgId = row.Org_ID ?? "";

    const org = await db.advocacyOrg.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
      update: {
        annualBudget: parseBudget(row.Annual_Budget_USD_approx ?? null),
        researchSpend: parseBudget(row.Research_Spend_USD_approx ?? null),
        country,
        metadata: {
          csvOrgId: row.Org_ID,
          geographyRegion: row.Geography_Region,
          charityRegNumber: row.Charity_Reg_Number,
          strategicPriorities: row.Strategic_Priorities,
          partnershipPrograms: row.Partnership_Programs,
          datasetsMaintained: row.Datasets_Maintained,
          notes: row.Notes,
        },
      },
      create: {
        workspaceId: workspace.id,
        slug,
        name: row.Organization_Name ?? slug,
        website: row.Website ? `https://${row.Website.replace(/^https?:\/\//, "")}` : null,
        cancerTypes,
        orgType: mapOrgType(row.Org_Type ?? ""),
        status: OrgStatus.ACTIVE,
        annualBudget: parseBudget(row.Annual_Budget_USD_approx ?? null),
        researchSpend: parseBudget(row.Research_Spend_USD_approx ?? null),
        country,
        externalId: orgId,
        headquarters: row.Country,
        metadata: {
          csvOrgId: row.Org_ID,
          geographyRegion: row.Geography_Region,
          charityRegNumber: row.Charity_Reg_Number,
          strategicPriorities: row.Strategic_Priorities,
          partnershipPrograms: row.Partnership_Programs,
          datasetsMaintained: row.Datasets_Maintained,
          notes: row.Notes,
        },
      },
    });

    orgIdMap[orgId] = org.id;
    orgCount++;

    const contacts: Array<{ name: string; title: string; role: ContactRole; isPrimary: boolean; email?: string }> = [];
    const ceo = row.CEO_Executive_Director;
    if (ceo && !ceo.includes("Unknown") && !ceo.includes("See ")) {
      const nameMatch = ceo.match(/^([^(]+)/);
      const titleMatch = ceo.match(/\(([^)]+)\)/);
      contacts.push({
        name: (nameMatch?.[1]?.trim() ?? ceo) || "Unknown",
        title: titleMatch?.[1] ?? "Chief Executive Officer",
        role: ContactRole.EXECUTIVE,
        isPrimary: true,
        email: row.Contact_Email_General || undefined,
      });
    }

    const cso = row.CSO_Head_of_Research;
    if (cso && !cso.includes("Unknown") && !cso.includes("See ") && cso.trim()) {
      const nameMatch = cso.match(/^([^(]+)/);
      const titleMatch = cso.match(/\(([^)]+)\)/);
      contacts.push({
        name: (nameMatch?.[1]?.trim() ?? cso) || "Unknown",
        title: titleMatch?.[1] ?? "Chief Scientific Officer",
        role: ContactRole.SCIENTIFIC,
        isPrimary: false,
      });
    }

    const grantsContact = row.Head_of_Grants;
    if (grantsContact && !grantsContact.includes("Unknown") && !grantsContact.includes("See ") && grantsContact.trim()) {
      const nameMatch = grantsContact.match(/^([^(]+)/);
      contacts.push({
        name: (nameMatch?.[1]?.trim() ?? grantsContact) || "Unknown",
        title: "Head of Grants",
        role: ContactRole.FUNDRAISING,
        isPrimary: false,
      });
    }

    for (const c of contacts) {
      await db.orgContact.upsert({
        where: { id: `${org.id}-${slugify(c.name)}-${c.role}`.slice(0, 25) + "-seed" },
        update: {},
        create: {
          id: `${org.id}-${slugify(c.name)}-${c.role}`.slice(0, 25) + "-seed",
          orgId: org.id,
          name: c.name,
          title: c.title,
          role: c.role,
          isPrimary: c.isPrimary,
          email: c.email || null,
          phone: null,
        },
      });
    }
  }

  let grantCount = 0;
  for (const g of GRANTS) {
    const orgDbId = orgIdMap[g.orgId];
    if (!orgDbId) continue;

    await db.openGrant.upsert({
      where: { id: `grant-${slugify(g.title)}-${g.orgId}`.slice(0, 30) + "-seed" },
      update: {},
      create: {
        id: `grant-${slugify(g.title)}-${g.orgId}`.slice(0, 30) + "-seed",
        orgId: orgDbId,
        workspaceId: workspace.id,
        title: g.title,
        description: g.sourceNotes || null,
        fundingAmountMax: (g as { fundingAmountMax?: number | null }).fundingAmountMax ?? null,
        fundingAmountMin: (g as { fundingAmountMin?: number | null }).fundingAmountMin ?? null,
        currency: g.currency,
        deadlineRaw: g.deadlineRaw || null,
        status: g.status,
        grantType: g.grantType,
        cancerTypes: g.cancerTypes,
        geographicScope: g.geographicScope,
        eligibilityCriteria: (g as { eligibilityCriteria?: string }).eligibilityCriteria ?? null,
        requiresLOI: g.requiresLOI,
        loiDeadlineRaw: (g as { loiDeadlineRaw?: string }).loiDeadlineRaw ?? null,
        awardDuration: (g as { awardDuration?: string }).awardDuration ?? null,
        sourceNotes: g.sourceNotes || null,
      },
    });
    grantCount++;
  }

  const [orgTotal, grantTotal, contactTotal, openGrants, gbmGrants] = await Promise.all([
    db.advocacyOrg.count({ where: { workspaceId: workspace.id } }),
    db.openGrant.count({ where: { workspaceId: workspace.id } }),
    db.orgContact.count(),
    db.openGrant.count({ where: { workspaceId: workspace.id, status: GrantStatus.OPEN } }),
    db.openGrant.count({ where: { workspaceId: workspace.id, cancerTypes: { has: "GBM" } } }),
  ]);

  return {
    workspaceSlug: workspace.slug,
    orgCount: orgTotal,
    grantCount: grantTotal,
    contactCount: contactTotal,
    openGrants,
    gbmGrants,
  };
}
