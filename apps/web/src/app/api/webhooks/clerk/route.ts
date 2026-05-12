import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zeta/db";

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

      await prisma.user.upsert({
        where: { clerkId: data.id },
        create: {
          clerkId: data.id,
          email,
          name: [data.first_name, data.last_name].filter(Boolean).join(" ") || email,
          avatarUrl: data.image_url,
        },
        update: {
          email,
          name: [data.first_name, data.last_name].filter(Boolean).join(" ") || email,
          avatarUrl: data.image_url,
        },
      });
    }

    if (type === "user.deleted") {
      await prisma.user.deleteMany({ where: { clerkId: data.id } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Clerk Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
