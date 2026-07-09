import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b:free";

async function llmCall(systemPrompt: string, userPrompt: string, maxTokens = 3000): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://caid.onrender.com",
      "X-Title": "CAID Intelligence Platform",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function buildOrgContext(org: Record<string, unknown>): string {
  const contacts = (org.contacts as Array<Record<string, unknown>>) ?? [];
  const grants = (org.openGrants as Array<Record<string, unknown>>) ?? [];

  const ceo = contacts.find((c) => c.role === "EXECUTIVE");
  const scientific = contacts.find((c) => c.role === "SCIENTIFIC");
  const grantsContact = contacts.find((c) => c.role === "POLICY" || c.title?.toString().toLowerCase().includes("grant"));

  return `
ORGANIZATION: ${org.name} (${org.externalId ?? org.id})
Country: ${org.country ?? "Unknown"}
Type: ${org.orgType}
Cancer Focus: ${(org.cancerTypes as string[])?.join(", ") ?? "Pan-cancer"}
Annual Budget: ${org.annualBudget ? `$${(org.annualBudget as number).toLocaleString()}` : "Unknown"}
Research Spend: ${org.researchSpend ? `$${(org.researchSpend as number).toLocaleString()}` : "Unknown"}
Website: ${org.website ?? "N/A"}
Mission: ${org.mission ?? org.description ?? "N/A"}
Strategic Priorities: ${(org.metadata as Record<string, unknown>)?.strategicPriorities ?? "N/A"}
Partnership Programs: ${(org.metadata as Record<string, unknown>)?.partnershipPrograms ?? "N/A"}

KEY CONTACTS:
- CEO/Executive: ${ceo ? `${ceo.name} (${ceo.title ?? "Executive"}) — ${ceo.email ?? "no email"}` : "Unknown"}
- Scientific Lead: ${scientific ? `${scientific.name} (${scientific.title ?? "Scientific"})` : "Unknown"}
- Grants Contact: ${grantsContact ? `${grantsContact.name} (${grantsContact.title ?? "Grants"}) — ${grantsContact.email ?? "no email"}` : "See website"}

OPEN GRANTS (${grants.length}):
${grants.slice(0, 5).map((g) => `- ${g.title}: ${g.fundingAmountMax ? `up to $${(g.fundingAmountMax as number).toLocaleString()}` : "amount TBD"} | Status: ${g.status} | Deadline: ${g.deadlineRaw ?? g.deadline ?? "TBD"}`).join("\n") || "No open grants currently listed"}
`.trim();
}

// ─── Standard 3-step chain (PITCH, LOI, EMAIL) ───────────────────────────────

async function runStandardChain(
  org: Record<string, unknown>,
  type: string,
  orgContext: string,
  userContext: string,
  sendEvent: (event: string, data: string) => void
): Promise<string> {
  // Step 1: Eligibility Analysis
  sendEvent("step", JSON.stringify({ step: "eligibility", detail: "🔍 Step 1/3: Analysing eligibility and strategic fit..." }));
  const eligibilityAnalysis = await llmCall(
    `You are a senior grant strategist specialising in cancer research funding. Analyse the eligibility and strategic fit of a research institution applying to this funder. Be specific, cite the funder's stated priorities, and give a confidence percentage and strategic fit score out of 10.`,
    `${orgContext}${userContext}\n\nProvide a structured eligibility analysis covering: (1) Likely eligible? Yes/No/Conditional with confidence %, (2) Strategic fit score /10 with justification, (3) Key eligibility risks, (4) Recommended programme/grant type to target, (5) Timing considerations.`
  );
  sendEvent("step_done", JSON.stringify({ step: "eligibility", summary: eligibilityAnalysis.slice(0, 120) }));

  // Step 2: Intelligence Brief
  sendEvent("step", JSON.stringify({ step: "intelligence", detail: "🧠 Step 2/3: Building intelligence brief on leadership and entry points..." }));
  const intelligenceBrief = await llmCall(
    `You are a relationship intelligence analyst. Build a concise intelligence brief on this funder's leadership, strategy, and the best entry points for a new partnership. Be specific about named individuals, their stated priorities, and tactical hooks.`,
    `${orgContext}${userContext}\n\nEligibility analysis:\n${eligibilityAnalysis}\n\nProvide: (1) CEO/leadership profile and stated 2025-2026 priorities, (2) Best entry point sequence (who to contact first, second, third), (3) Tactical hooks — recent news, campaigns, or statements to reference, (4) Competitive landscape — who else is funded by this org, (5) Recommended ask and framing.`
  );
  sendEvent("step_done", JSON.stringify({ step: "intelligence", summary: "Intelligence brief complete." }));

  // Step 3: Generate the document
  const docTypeLabel = type === "PITCH" ? "Pitch Dossier" : type === "LOI" ? "Letter of Intent" : "Outreach Email";
  sendEvent("step", JSON.stringify({ step: "document", detail: `📝 Step 3/3: Drafting ${docTypeLabel}...` }));

  const docSystemPrompt = type === "EMAIL"
    ? `You are an expert grant writer drafting a concise, personalised outreach email. The email should be warm, specific, and under 300 words. Reference the recipient by name. Do not use generic phrases.`
    : type === "LOI"
    ? `You are an expert grant writer drafting a Letter of Intent (LOI) for a cancer research grant. The LOI should be 600-800 words, professionally structured, and directly address the funder's stated priorities. Include: programme title, scientific rationale, team credentials, budget overview, and a specific ask.`
    : `You are an expert grant strategist creating a comprehensive pitch dossier. Structure it with clear sections: Executive Summary, Funder Intelligence, Eligibility Assessment, Strategic Positioning, Recommended Approach, Draft LOI, and Next Steps.`;

  const document = await llmCall(
    docSystemPrompt,
    `${orgContext}${userContext}\n\nEligibility analysis:\n${eligibilityAnalysis}\n\nIntelligence brief:\n${intelligenceBrief}\n\nNow write the complete ${docTypeLabel}. Address it to the named CEO/executive contact. Be specific, personalised, and compelling.`
  );
  sendEvent("step_done", JSON.stringify({ step: "document", summary: `${docTypeLabel} drafted.` }));

  const title = `${docTypeLabel} — ${org.name} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  return `# ${title}\n\n## Eligibility Analysis\n\n${eligibilityAnalysis}\n\n---\n\n## Intelligence Brief\n\n${intelligenceBrief}\n\n---\n\n## ${docTypeLabel}\n\n${document}`;
}

// ─── 5-step APPLICATION chain ─────────────────────────────────────────────────

async function runApplicationChain(
  org: Record<string, unknown>,
  orgContext: string,
  userContext: string,
  sendEvent: (event: string, data: string) => void
): Promise<string> {
  // Step 1: Eligibility & Strategic Fit
  sendEvent("step", JSON.stringify({ step: "eligibility", detail: "🔍 Step 1/5: Analysing eligibility and strategic fit..." }));
  const eligibility = await llmCall(
    `You are a senior grant strategist. Produce a detailed eligibility and strategic fit analysis for a full grant application. Be rigorous — this will guide the entire application.`,
    `${orgContext}${userContext}\n\nProvide: (1) Eligibility verdict with confidence %, (2) Strategic fit score /10 with detailed justification, (3) Recommended programme and specific grant type, (4) Recommended ask amount with justification, (5) Key eligibility risks and how to mitigate them, (6) Recommended submission date (2 weeks before deadline), (7) Funder's top 3 stated priorities this cycle.`,
    2000
  );
  sendEvent("step_done", JSON.stringify({ step: "eligibility", summary: eligibility.slice(0, 120) }));

  // Step 2: Intelligence Brief
  sendEvent("step", JSON.stringify({ step: "intelligence", detail: "🧠 Step 2/5: Building funder intelligence brief..." }));
  const intelligence = await llmCall(
    `You are a relationship intelligence analyst specialising in cancer research funding. Build a comprehensive intelligence brief to inform a grant application.`,
    `${orgContext}${userContext}\n\nEligibility:\n${eligibility}\n\nProvide: (1) Funder leadership profile (CEO, CSO, grants director — names, backgrounds, stated priorities), (2) Funder's current strategic focus and 2025-2026 priorities, (3) Recent grants awarded (who, how much, for what), (4) Best entry point sequence, (5) Tactical hooks to reference in the application, (6) What makes applications succeed with this funder.`,
    2000
  );
  sendEvent("step_done", JSON.stringify({ step: "intelligence", summary: "Intelligence brief complete." }));

  // Step 3: Specific Aims
  sendEvent("step", JSON.stringify({ step: "specific_aims", detail: "🎯 Step 3/5: Drafting Specific Aims and Executive Summary..." }));
  const specificAims = await llmCall(
    `You are an expert grant writer. Write the Specific Aims / Executive Summary section of a grant application. This is the most important section — it must be compelling, specific, and directly address the funder's priorities. Maximum 1 page (approximately 600 words).`,
    `${orgContext}${userContext}\n\nEligibility:\n${eligibility}\n\nFunder intelligence:\n${intelligence}\n\nWrite the Specific Aims section with: (1) Opening hook (1 paragraph — the problem and why it matters now), (2) Long-term goal and overall objective, (3) Three specific, measurable aims with clear outcomes (Aim 1, Aim 2, Aim 3), (4) Expected impact on patients and the field, (5) Why this team is uniquely positioned. Reference the funder's specific programme name and priorities.`,
    2000
  );
  sendEvent("step_done", JSON.stringify({ step: "specific_aims", summary: "Specific Aims drafted." }));

  // Step 4: Research Narrative
  sendEvent("step", JSON.stringify({ step: "narrative", detail: "📖 Step 4/5: Writing Research Narrative (Background, Innovation, Approach)..." }));
  const narrative = await llmCall(
    `You are an expert grant writer. Write the Research Narrative section of a grant application. This should be detailed, evidence-based, and compelling. Approximately 1,500-2,000 words.`,
    `${orgContext}${userContext}\n\nSpecific Aims:\n${specificAims}\n\nWrite three subsections:\n\n**A. Background & Significance** (400-500 words): Current state of the field, the specific gap, why this matters for patients, key statistics and evidence.\n\n**B. Innovation** (300-400 words): What is genuinely new about this approach, how it differs from existing work, why now is the right time.\n\n**C. Approach** (700-900 words): Methodology for each aim, timeline with milestones (Year 1, Year 2, Year 3), key techniques, expected outcomes, and risk mitigation for the top 2-3 technical risks.`,
    3500
  );
  sendEvent("step_done", JSON.stringify({ step: "narrative", summary: "Research Narrative complete." }));

  // Step 5: Budget + Cover Letter
  sendEvent("step", JSON.stringify({ step: "budget_cover", detail: "💰 Step 5/5: Drafting Budget Outline and Cover Letter..." }));
  const budgetAndCover = await llmCall(
    `You are an expert grant writer. Write two final sections: a budget outline and a cover letter. The cover letter should be addressed to the named grants contact by name and be under 400 words.`,
    `${orgContext}${userContext}\n\nEligibility:\n${eligibility}\n\nSpecific Aims:\n${specificAims}\n\nWrite:\n\n**BUDGET OUTLINE**\nPersonnel (PI at X% effort, co-investigators, postdocs, students — with justification for each), Equipment and consumables, Travel and dissemination, Indirect costs/overheads, Total ask. Justify why this amount is appropriate for the scope of work.\n\n**COVER LETTER**\nAddressed to the named grants contact. Opening hook referencing the funder's specific mission or a recent initiative. 3-sentence summary of the application. Why this funder is the right partner. Clear ask and next step. Professional close with PI name and institution.`,
    2500
  );
  sendEvent("step_done", JSON.stringify({ step: "budget_cover", summary: "Budget and Cover Letter complete." }));

  const title = `Full Application — ${org.name} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  return `# ${title}

---

## Section 1: Eligibility & Strategic Fit Analysis

${eligibility}

---

## Section 2: Funder Intelligence Brief

${intelligence}

---

## Section 3: Specific Aims / Executive Summary

${specificAims}

---

## Section 4: Research Narrative

${narrative}

---

## Section 5: Budget Outline & Cover Letter

${budgetAndCover}

---

## Submission Checklist

- [ ] Internal scientific review completed
- [ ] Budget approved by finance team
- [ ] PI signature obtained
- [ ] All attachments prepared (CVs, letters of support, preliminary data)
- [ ] Application portal account created
- [ ] Submitted at least 2 weeks before deadline
`;
}

// ─── Main POST handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgId, type, context, stream: doStream } = body;

    if (!orgId || !type) {
      return NextResponse.json({ error: "orgId and type required" }, { status: 400 });
    }

    const org = await prisma.advocacyOrg.findFirst({
      where: { OR: [{ id: orgId }, { externalId: orgId }, { slug: orgId }] },
      include: {
        contacts: true,
        openGrants: { where: { status: "OPEN" } },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    const orgContext = buildOrgContext(org as unknown as Record<string, unknown>);
    const userContext = context ? `\n\nADDITIONAL CONTEXT FROM USER:\n${context}` : "";
    const isApplication = type === "APPLICATION";

    // Streaming SSE response
    if (doStream) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: string) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
          };

          try {
            let fullContent: string;

            if (isApplication) {
              fullContent = await runApplicationChain(
                org as unknown as Record<string, unknown>,
                orgContext,
                userContext,
                send
              );
            } else {
              fullContent = await runStandardChain(
                org as unknown as Record<string, unknown>,
                type,
                orgContext,
                userContext,
                send
              );
            }

            // Save to DB
            const docTypeLabel = isApplication ? "Full Application"
              : type === "PITCH" ? "Pitch Dossier"
              : type === "LOI" ? "Letter of Intent"
              : "Outreach Email";
            const title = `${docTypeLabel} — ${org.name} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

            const saved = await prisma.dossier.create({
              data: {
                orgId: org.id,
                type: type as "PITCH" | "LOI" | "EMAIL" | "APPLICATION",
                title,
                content: fullContent,
                model: MODEL,
                context: context ?? null,
              },
            });

            send("done", JSON.stringify({ id: saved.id, title, content: fullContent }));
            controller.close();
          } catch (err) {
            send("error", JSON.stringify({ message: err instanceof Error ? err.message : "Generation failed" }));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming fallback
    let fullContent: string;
    const noop = () => {};

    if (isApplication) {
      fullContent = await runApplicationChain(
        org as unknown as Record<string, unknown>,
        orgContext,
        userContext,
        noop
      );
    } else {
      fullContent = await runStandardChain(
        org as unknown as Record<string, unknown>,
        type,
        orgContext,
        userContext,
        noop
      );
    }

    const docTypeLabel = isApplication ? "Full Application"
      : type === "PITCH" ? "Pitch Dossier"
      : type === "LOI" ? "Letter of Intent"
      : "Outreach Email";
    const title = `${docTypeLabel} — ${org.name} — ${new Date().toLocaleDateString("en-GB")}`;

    const saved = await prisma.dossier.create({
      data: {
        orgId: org.id,
        type: type as "PITCH" | "LOI" | "EMAIL" | "APPLICATION",
        title,
        content: fullContent,
        model: MODEL,
        context: context ?? null,
      },
    });

    return NextResponse.json({ id: saved.id, title, content: fullContent });
  } catch (err) {
    console.error("[/api/caid/dossier] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate dossier" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("orgId");
  try {
    const dossiers = await prisma.dossier.findMany({
      where: orgId ? { OR: [{ orgId }, { org: { externalId: orgId } }] } : undefined,
      orderBy: { createdAt: "desc" },
      include: { org: { select: { name: true, id: true, externalId: true } } },
    });
    return NextResponse.json({ dossiers });
  } catch {
    return NextResponse.json({ error: "Failed to fetch dossiers" }, { status: 500 });
  }
}
