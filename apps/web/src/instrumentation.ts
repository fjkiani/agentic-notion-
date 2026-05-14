// Next.js instrumentation hook — runs once at server startup
// Used here to start a keep-alive self-ping that prevents Render free-tier sleep

export async function register() {
  // Only run in Node.js runtime (not edge), and only in production
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const APP_URL = process.env.APP_URL ?? "https://agentic-notion-web.onrender.com";
    const PING_INTERVAL_MS = 9 * 60 * 1000; // 9 minutes

    // Delay first ping by 30s to let the server fully start
    setTimeout(() => {
      setInterval(async () => {
        try {
          // Ping the root page — always responds even without DB
          const res = await fetch(`${APP_URL}/`, { method: "HEAD" });
          console.log(`[CAID Web] keep-alive ping → ${res.status}`);
        } catch (err) {
          console.warn(`[CAID Web] keep-alive ping failed: ${err}`);
        }
      }, PING_INTERVAL_MS);
      console.log(`[CAID Web] Keep-alive enabled (ping every 9 min)`);
    }, 30_000);
  }
}
