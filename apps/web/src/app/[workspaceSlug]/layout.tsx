"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { ReactNode } from "react";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ workspaceSlug: string }>();
  const slug = params.workspaceSlug ?? "default";

  const isCAID = pathname.includes("/caid");

  // CAID has its own full-page sidebar layout — don't add a top nav on top of it
  if (isCAID) {
    return <>{children}</>;
  }

  const NAV = [
    { href: `/${slug}/caid`, label: "CAID", icon: "🎯", desc: "Grant Intelligence" },
    { href: `/${slug}/agents`, label: "Agents", icon: "🤖", desc: "AI Agents" },
    { href: `/${slug}/archon`, label: "Archon", icon: "⚡", desc: "Orchestrator" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">Z</span>
          </div>
          <span className="font-semibold text-gray-900 text-sm">Zeta CAID</span>
        </div>
        {NAV.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-red-50 text-red-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main>{children}</main>
    </div>
  );
}
