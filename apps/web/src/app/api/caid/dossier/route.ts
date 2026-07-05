import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

export const dynamic = "force-dynamic";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b:free";

async function llmCall(systemPrompt: string, userPrompt: string): Promise<string> {
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
      max_tokens: 3000,
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

    // Streaming SSE response
    if (doStream) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: string) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify({ text: data })}\n\n`));
          };

          try {
            // Step 1: Eligibility Analysis
            send("step", "🔍 Step 1/3: Analysing eligibility and strategic fit...");
            const eligibilityAnalysis = await llmCall(
              `You are a senior grant strategist specialising in cancer research funding. Analyse the eligibility and strategic fit of a research institution applying to this funder. Be specific, cite the funder's stated priorities, and give a confidence percentage and strategic fit score out of 10.`,
              `${orgContext}${userContext}\n\nProvide a structured eligibility analysis covering: (1) Likely eligible? Yes/No/Conditional with confidence %, (2) Strategic fit score /10 with justification, (3) Key eligibility risks, (4) Recommended programme/grant type to target, (5) Timing considerations.`
            );
            send("step_done", `✅ Eligibility: ${eligibilityAnalysis.slice(0, 100)}...`);

            // Step 2: Intelligence Brief
            send("step", "🧠 Step 2/3: Building intelligence brief on leadership and entry points...");
            const intelligenceBrief = await llmCall(
              `You are a relationship intelligence analyst. Build a concise intelligence brief on this funder's leadership, strategy, and the best entry points for a new partnership. Be specific about named individuals, their stated priorities, and tactical hooks.`,
              `${orgContext}${userContext}\n\nEligibility analysis:\n${eligibilityAnalysis}\n\nProvide: (1) CEO/leadership profile and stated 2025-2026 priorities, (2) Best entry point sequence (who to contact first, second, third), (3) Tactical hooks — recent news, campaigns, or statements to reference, (4) Competitive landscape — who else is funded by this org, (5) Recommended ask and framing.`
            );
            send("step_done", `✅ Intelligence brief complete.`);

            // Step 3: Generate the document
            const docTypeLabel = type === "PITCH" ? "Pitch Dossier" : type === "LOI" ? "Letter of Intent" : "Outreach Email";
            send("step", `📝 Step 3/3: Drafting ${docTypeLabel}...`);

            const docSystemPrompt = type === "EMAIL"
              ? `You are an expert grant writer drafting a concise, personalised outreach email. The email should be warm, specific, and under 300 words. Reference the recipient by name. Do not use generic phrases.`
              : type === "LOI"
              ? `You are an expert grant writer drafting a Letter of Intent (LOI) for a cancer research grant. The LOI should be 600-800 words, professionally structured, and directly address the funder's stated priorities. Include: programme title, scientific rationale, team credentials, budget overview, and a specific ask.`
              : `You are an expert grant strategist creating a comprehensive pitch dossier. Structure it with clear sections: Executive Summary, Funder Intelligence, Eligibility Assessment, Strategic Positioning, Recommended Approach, Draft LOI, and Next Steps.`;

            const document = await llmCall(
              docSystemPrompt,
              `${orgContext}${userContext}\n\nEligibility analysis:\n${eligibilityAnalysis}\n\nIntelligence brief:\n${intelligenceBrief}\n\nNow write the complete ${docTypeLabel}. Address it to the named CEO/executive contact. Be specific, personalised, and compelling.`
            );

            // Save to DB
            const title = `${docTypeLabel} — ${org.name} — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
            const fullContent = `# ${title}\n\n## Eligibility Analysis\n\n${eligibilityAnalysis}\n\n---\n\n## Intelligence Brief\n\n${intelligenceBrief}\n\n---\n\n## ${docTypeLabel}\n\n${document}`;

            const saved = await prisma.dossier.create({
              data: {
                orgId: org.id,
                type: type as "PITCH" | "LOI" | "EMAIL",
                title,
                content: fullContent,
                model: MODEL,
                context: context ?? null,
              },
            });

            send("done", JSON.stringify({ id: saved.id, title, content: fullContent }));
            controller.close();
          } catch (err) {
            send("error", err instanceof Error ? err.message : "Generation failed");
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
    const eligibilityAnalysis = await llmCall(
      `You are a senior grant strategist. Analyse eligibility and strategic fit.`,
      `${orgContext}${userContext}\n\nProvide eligibility analysis with confidence % and strategic fit score /10.`
    );
    const intelligenceBrief = await llmCall(
      `You are a relationship intelligence analyst. Build an intelligence brief on this funder.`,
      `${orgContext}${userContext}\n\nEligibility:\n${eligibilityAnalysis}\n\nProvide leadership profile, entry points, tactical hooks, competitive landscape.`
    );
    const docTypeLabel = type === "PITCH" ? "Pitch Dossier" : type === "LOI" ? "Letter of Intent" : "Outreach Email";
    const document = await llmCall(
      `You are an expert grant writer. Write a ${docTypeLabel}.`,
      `${orgContext}${userContext}\n\nEligibility:\n${eligibilityAnalysis}\n\nIntelligence:\n${intelligenceBrief}\n\nWrite the complete ${docTypeLabel}.`
    );

    const title = `${docTypeLabel} — ${org.name} — ${new Date().toLocaleDateString("en-GB")}`;
    const fullContent = `# ${title}\n\n## Eligibility Analysis\n\n${eligibilityAnalysis}\n\n---\n\n## Intelligence Brief\n\n${intelligenceBrief}\n\n---\n\n## ${docTypeLabel}\n\n${document}`;

    const saved = await prisma.dossier.create({
      data: {
        orgId: org.id,
        type: type as "PITCH" | "LOI" | "EMAIL",
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
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch dossiers" }, { status: 500 });
  }
}
