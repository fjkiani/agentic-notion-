import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAID — Cancer Advocacy Intelligence Database",
  description: "AI-native platform for cancer advocacy organizations. Powered by Zeta.",
  keywords: ["cancer advocacy", "clinical trials", "biomarkers", "policy", "AI"],
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );

  // During build (static generation), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY may not be set.
  // Skip ClerkProvider in that case — it will be present at runtime on Render.
  if (!clerkPublishableKey) {
    return content;
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {content}
    </ClerkProvider>
  );
}
