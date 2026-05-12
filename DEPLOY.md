# CAID — Deployment Guide

Complete instructions for deploying Zeta CAID to Render.

---

## Prerequisites

You need three things before deploying:

| Credential | Where to get it | Time |
|---|---|---|
| Clerk publishable + secret key | [dashboard.clerk.com](https://dashboard.clerk.com) → Create app → API Keys | 3 min |
| OpenRouter API key | [openrouter.ai/keys](https://openrouter.ai/keys) → Create key | 2 min |
| Two random tokens (MCP + Agent) | Run `openssl rand -hex 32` twice in your terminal | 30 sec |

---

## Step 1 — Render Blueprint Deploy

1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Click **New** → **Blueprint**
3. Connect your GitHub account if not already connected
4. Select the repo: `fjkiani/agentic-notion-`
5. Render detects `render.yaml` and shows a preview of 4 resources:
   - `zeta-caid-db` — PostgreSQL (free)
   - `agentic-notion-mcp` — MCP server (free)
   - `agentic-notion-agents` — Agent API (free)
   - `agentic-notion-web` — Next.js web app (free)
6. Click **Apply** — Render provisions the database and queues all 3 service builds

> The database is provisioned first. The MCP server build runs `prisma db push` to apply the schema. Agent API and Web build in parallel after.

---

## Step 2 — Set Environment Variables

After Blueprint apply, go to each service in the Render dashboard and set the variables below. Variables marked `sync: false` in `render.yaml` must be set manually — Render will show them as "missing" with a warning.

### agentic-notion-mcp

| Variable | Value |
|---|---|
| `MCP_AUTH_TOKEN` | Your generated token (same value used in all services) |

### agentic-notion-agents

| Variable | Value |
|---|---|
| `OPENROUTER_API_KEY` | `sk-or-v1-...` from openrouter.ai |
| `MCP_SERVER_URL` | `https://agentic-notion-mcp.onrender.com` |
| `MCP_AUTH_TOKEN` | Same token as above |
| `AGENT_API_TOKEN` | Your second generated token |
| `APP_URL` | `https://agentic-notion-web.onrender.com` |

### agentic-notion-web

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` from Clerk dashboard |
| `CLERK_SECRET_KEY` | `sk_test_...` from Clerk dashboard |
| `CLERK_WEBHOOK_SECRET` | See Step 3 below |
| `MCP_AUTH_TOKEN` | Same token as above |
| `NEXT_PUBLIC_MCP_SERVER_URL` | `https://agentic-notion-mcp.onrender.com` |
| `AGENT_API_TOKEN` | Same second token as above |
| `NEXT_PUBLIC_AGENT_API_URL` | `https://agentic-notion-agents.onrender.com` |
| `APP_URL` | `https://agentic-notion-web.onrender.com` |

> `DATABASE_URL` is auto-injected by Render from `zeta-caid-db` — you do not need to set it.

---

## Step 3 — Clerk Webhook Setup

1. In the [Clerk Dashboard](https://dashboard.clerk.com), go to your app → **Webhooks**
2. Click **Add Endpoint**
3. URL: `https://agentic-notion-web.onrender.com/api/webhooks/clerk`
4. Subscribe to events: `user.created`, `user.updated`, `user.deleted`
5. Click **Create** → copy the **Signing Secret** (starts with `whsec_...`)
6. Set `CLERK_WEBHOOK_SECRET` = that signing secret in the `agentic-notion-web` service

---

## Step 4 — Trigger Deploys

After all env vars are set, trigger manual deploys **in this order**:

1. **agentic-notion-mcp** → Dashboard → Manual Deploy → wait for:
   ```
   [CAID MCP] Registered 45 tools
   Server listening on port 3001
   ```

2. **agentic-notion-agents** → Manual Deploy → wait for:
   ```
   [Agent Registry] 4 agents ready
   Agent API listening on port 3002
   ```

3. **agentic-notion-web** → Manual Deploy → wait for health check to pass (green dot)

---

## Step 5 — Smoke Test

Run these from your terminal to verify all services are live:

```bash
# Replace with your actual tokens
MCP_TOKEN="your-mcp-auth-token"
AGENT_TOKEN="your-agent-api-token"

# 1. MCP server health
curl https://agentic-notion-mcp.onrender.com/health
# Expected: {"status":"ok","tools":45,"version":"1.0.0","service":"zeta-caid-mcp"}

# 2. Agent API health
curl -H "Authorization: Bearer $AGENT_TOKEN" \
  https://agentic-notion-agents.onrender.com/health
# Expected: {"status":"ok","agents":["ADVOCACY_PM","RESEARCH_INTELLIGENCE","COALITION_BUILDER","STANDUP_REPORTER"],"ready":true}

# 3. Web app
curl -I https://agentic-notion-web.onrender.com/
# Expected: HTTP/2 200

# 4. Live MCP tool list (45 tools)
curl -X POST https://agentic-notion-mcp.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
# Expected: SSE response with 45 tool names

# 5. Live workspace create (writes to DB)
curl -X POST https://agentic-notion-mcp.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"workspace_create","arguments":{"name":"Test Workspace","slug":"test-workspace"}}}'
# Expected: SSE response with workspace id (cuid)
```

---

## Step 6 — Cursor MCP Integration

The `.cursor/mcp.json` is already committed to the repo. To activate:

1. Open Cursor → **Settings** → **MCP**
2. The `zeta-caid` server entry is already present pointing to `https://agentic-notion-mcp.onrender.com/mcp`
3. Replace `${MCP_AUTH_TOKEN}` with your actual token in your local `.cursor/mcp.json` (do **not** commit the real token)
4. Restart Cursor — all 45 CAID tools are now available in the editor

For local development (STDIO transport, no network):
```json
{
  "mcpServers": {
    "zeta-caid-local": {
      "command": "node",
      "args": ["apps/mcp-server/dist/index.js", "--transport", "stdio"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "MCP_AUTH_TOKEN": "dev-token",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

---

## Render Free Tier Notes

- Services **spin down after 15 minutes of inactivity** — first request after idle takes ~30 seconds (cold start)
- To keep services warm, use [UptimeRobot](https://uptimerobot.com) (free) to ping `/health` every 10 minutes
- Postgres free tier: 1 GB storage, 97 connections max — sufficient for MVP

---

## Extending CAID with Archon

Once deployed, use the Archon Launcher at `https://agentic-notion-web.onrender.com/[workspace-slug]/archon` to extend the platform:

```
"Add a calendar view for policy deadlines"
→ Archon runs add-view workflow
→ Plans, implements, validates, creates PR
→ You review and merge
→ Render auto-deploys
```

Available workflows in `.archon/workflows/`:
- `add-feature` — any new capability
- `add-mcp-tool` — new MCP tool (auto-registered to all agents)
- `add-agent-role` — new LangGraph agent
- `add-view` — new UI view (timeline, calendar, table, map)
- `add-integration` — Slack, Linear, GitHub, etc.
- `extend-schema` — new Prisma models/fields
- `fix-issue` — bug fixes with PR

---

## Architecture Reference

```
https://agentic-notion-web.onrender.com      Next.js 15 + Clerk auth
https://agentic-notion-mcp.onrender.com      45 MCP tools (HTTP + STDIO)
https://agentic-notion-agents.onrender.com   4 LangGraph agents (OpenRouter free)
                                              └── ADVOCACY_PM      (Gemma 4 26B)
                                              └── RESEARCH_INTEL   (Qwen3 Coder 480B)
                                              └── COALITION_BUILDER (Arcee Trinity)
                                              └── STANDUP_REPORTER  (Qwen3 Next 80B)
```
