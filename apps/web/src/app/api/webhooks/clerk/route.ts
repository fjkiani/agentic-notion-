import { NextRequest, NextResponse } from "next/server";
import { callMCPServer } from "@/lib/mcp-server";

// Clerk webhook handler — syncs user data to the database via MCP server.
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

export async function POST(request: NextRequest) {
  const body = await request.json() as ClerkWebhookEvent;
  const { type, data } = body;

  try {
    if (type === "user.created" || type === "user.updated") {
      const email = data.email_addresses[0]?.email_address;
      if (!email) return NextResponse.json({ ok: true });

      const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || email;

      await callMCPServer("user_upsert", {
        clerkId: data.id,
        email,
        name,
        avatarUrl: data.image_url ?? null,
      });
    }

    if (type === "user.deleted") {
      await callMCPServer("user_delete", { clerkId: data.id });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Clerk Webhook] Error:", error);
    // Return 200 to prevent Clerk from retrying — log the error but don't block
    return NextResponse.json({ ok: true, warning: "User sync failed" });
  }
}
