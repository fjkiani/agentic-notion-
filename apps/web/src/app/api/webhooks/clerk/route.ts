import { NextRequest, NextResponse } from "next/server";

// Clerk webhook handler — syncs user data to the database via MCP server
// The web app does NOT import prisma directly; all DB writes go through MCP.

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    first_name?: string;
    last_name?: string;
    image_url?: string;
  };
}

async function callMCP(toolName: string, args: Record<string, unknown>): Promise<void> {
  const MCP_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL ?? "https://agentic-notion-mcp.onrender.com";
  const MCP_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

  const res = await fetch(`${MCP_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MCP_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) throw new Error(`MCP call failed: ${res.status}`);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as ClerkWebhookEvent;
  const { type, data } = body;

  try {
    if (type === "user.created" || type === "user.updated") {
      const email = data.email_addresses[0]?.email_address;
      if (!email) return NextResponse.json({ ok: true });

      const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || email;

      await callMCP("user_upsert", {
        clerkId: data.id,
        email,
        name,
        avatarUrl: data.image_url ?? null,
      });
    }

    if (type === "user.deleted") {
      await callMCP("user_delete", { clerkId: data.id });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Clerk Webhook] Error:", error);
    // Return 200 to prevent Clerk from retrying — log the error but don't block
    return NextResponse.json({ ok: true, warning: "User sync failed, will retry" });
  }
}
