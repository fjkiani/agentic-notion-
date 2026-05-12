import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@zeta/db";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Get or create default workspace for this user
  let workspace = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: { advocacyOrgs: true, agentRuns: true },
      },
    },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "My Workspace",
        slug: "my-workspace",
        description: "Cancer Advocacy Intelligence Database",
      },
      include: {
        _count: { select: { advocacyOrgs: true, agentRuns: true } },
      },
    });
  }

  const stats = await Promise.all([
    prisma.advocacyOrg.count({ where: { workspaceId: workspace.id } }),
    prisma.campaign.count({ where: { org: { workspaceId: workspace.id } } }),
    prisma.task.count({ where: { initiative: { campaign: { org: { workspaceId: workspace.id } } } } }),
    prisma.evidence.count(),
    prisma.clinicalTrial.count(),
    prisma.biomarker.count(),
  ]);

  const [orgs, campaigns, tasks, evidence, trials, biomarkers] = stats;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900">CAID</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-gray-600">
            <Link href="/dashboard" className="text-red-600 font-medium">Dashboard</Link>
            <Link href={`/${workspace.slug}/orgs`} className="hover:text-gray-900">Organizations</Link>
            <Link href={`/${workspace.slug}/agents`} className="hover:text-gray-900">Agents</Link>
            <Link href={`/${workspace.slug}/archon`} className="hover:text-gray-900">Archon</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Cancer Advocacy Intelligence Database</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: "Organizations", value: orgs, icon: "🏢", href: `/${workspace.slug}/orgs` },
            { label: "Campaigns", value: campaigns, icon: "📣", href: `/${workspace.slug}/campaigns` },
            { label: "Tasks", value: tasks, icon: "✅", href: `/${workspace.slug}/tasks` },
            { label: "Evidence", value: evidence, icon: "📄", href: `/${workspace.slug}/evidence` },
            { label: "Trials", value: trials, icon: "🔬", href: `/${workspace.slug}/trials` },
            { label: "Biomarkers", value: biomarkers, icon: "🧬", href: `/${workspace.slug}/biomarkers` },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-white rounded-xl p-4 border border-gray-200 hover:border-red-200 hover:shadow-sm transition-all"
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { label: "Run Advocacy PM Agent", href: `/${workspace.slug}/agents?role=ADVOCACY_PM`, icon: "🤖" },
                { label: "Research Intelligence", href: `/${workspace.slug}/agents?role=RESEARCH_INTELLIGENCE`, icon: "🔬" },
                { label: "Coalition Builder", href: `/${workspace.slug}/agents?role=COALITION_BUILDER`, icon: "🤝" },
                { label: "Daily Standup Report", href: `/${workspace.slug}/agents?role=STANDUP_REPORTER`, icon: "📊" },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  <span>{action.icon}</span>
                  <span className="text-gray-700">{action.label}</span>
                  <span className="ml-auto text-gray-400">→</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Extend with Archon</h2>
            <p className="text-sm text-gray-600 mb-4">
              Use Archon to add new features to CAID. Describe what you want and Archon will plan, implement, and PR it.
            </p>
            <Link
              href={`/${workspace.slug}/archon`}
              className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              <span>⚡</span>
              Open Archon Launcher
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
