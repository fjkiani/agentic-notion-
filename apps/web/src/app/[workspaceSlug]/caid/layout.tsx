"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/caid", label: "Dashboard", icon: "📊", exact: true },
  { href: "/caid/orgs", label: "All Orgs", icon: "🏢", exact: false },
  { href: "/caid/pipeline", label: "Pipeline", icon: "🎯", exact: false },
  { href: "/caid/generate", label: "Generate", icon: "✨", exact: false },
];

export default function CAIDLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ workspaceSlug: string }>();
  const slug = params.workspaceSlug ?? "default";

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">C</span>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm leading-none">CAID</div>
              <div className="text-xs text-gray-400 mt-0.5">Intelligence</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Grant Intelligence
          </div>
          {NAV_ITEMS.map((item) => {
            const href = `/${slug}${item.href}`;
            const isActive = item.exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-red-50 text-red-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-1">
            Platform
          </div>
          <Link
            href={`/${slug}/agents`}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <span className="text-base">🤖</span>
            Agents
          </Link>
          <Link
            href={`/${slug}/archon`}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <span className="text-base">⚡</span>
            Archon
          </Link>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="text-xs text-gray-400">88 orgs · 26 grants</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
