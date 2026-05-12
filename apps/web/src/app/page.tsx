import Link from "next/link";
import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-blue-50">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">CAID</span>
          <span className="text-gray-400 text-sm hidden sm:block">Cancer Advocacy Intelligence Database</span>
        </div>
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium">
                Get started
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Go to dashboard
            </Link>
          </SignedIn>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-8 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            AI-native cancer advocacy platform
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Intelligence for<br />
            <span className="text-red-600">Cancer Advocacy</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            CAID gives cancer advocacy organizations AI agents that research evidence,
            build coalitions, track policy targets, and manage campaigns — all in one platform.
          </p>
          <div className="flex items-center justify-center gap-4">
            <SignedOut>
              <SignUpButton mode="modal">
                <button className="bg-red-600 text-white px-8 py-3 rounded-xl font-semibold text-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-200">
                  Start free
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="bg-red-600 text-white px-8 py-3 rounded-xl font-semibold text-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Open dashboard
              </Link>
            </SignedIn>
            <a
              href="https://github.com/fjkiani/agentic-notion-"
              className="text-gray-600 px-8 py-3 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-colors border border-gray-200"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: "🔬",
              title: "Research Intelligence",
              description: "AI agent searches PubMed and ClinicalTrials.gov, synthesizes evidence, and builds advocacy briefs automatically.",
            },
            {
              icon: "🏛️",
              title: "Policy Tracking",
              description: "Track FDA guidance, Congressional bills, and CMS coverage decisions with deadline alerts and engagement status.",
            },
            {
              icon: "🤝",
              title: "Coalition Builder",
              description: "AI maps stakeholders, identifies coalition partners, and generates engagement strategies with outreach tasks.",
            },
            {
              icon: "📊",
              title: "Campaign Kanban",
              description: "Manage advocacy campaigns with a full Kanban board. Tasks can be created by AI agents or your team.",
            },
            {
              icon: "🧬",
              title: "Biomarker Database",
              description: "Track cancer biomarkers, FDA-approved companion diagnostics, and advocacy priorities by cancer type.",
            },
            {
              icon: "📖",
              title: "Patient Stories",
              description: "Collect, organize, and publish patient testimonies with consent tracking and advocacy theme tagging.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-red-200 hover:shadow-md transition-all"
            >
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* MCP badge */}
        <div className="mt-16 text-center">
          <p className="text-sm text-gray-500">
            Built on{" "}
            <span className="font-medium text-gray-700">Model Context Protocol (MCP)</span>
            {" "}·{" "}
            <span className="font-medium text-gray-700">LangGraph</span>
            {" "}·{" "}
            <span className="font-medium text-gray-700">OpenRouter</span>
            {" "}·{" "}
            <span className="font-medium text-gray-700">Archon</span>
          </p>
        </div>
      </main>
    </div>
  );
}
