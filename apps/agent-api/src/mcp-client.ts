import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  const jitter = Math.floor(Math.random() * 250);
  return BASE_DELAY_MS * 2 ** (attempt - 1) + jitter;
}

export class MCPClient {
  private baseUrl: string;
  private token: string;
  private toolsCache: MCPToolSchema[] | null = null;

  constructor(options: { url: string; token: string }) {
    this.baseUrl = options.url.replace(/\/$/, "");
    this.token = options.token;
  }

  get url(): string {
    return this.baseUrl;
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // MCP HTTP transport requires both JSON and SSE in Accept
            "Accept": "application/json, text/event-stream",
            "Authorization": `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method,
            params,
          }),
        });

        if (!res.ok) {
          if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
            const delay = retryDelayMs(attempt, res.headers.get("Retry-After"));
            console.warn(
              `[MCP Client] ${method} returned ${res.status}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await sleep(delay);
            continue;
          }
          throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
        }

        // MCP HTTP transport returns SSE: "event: message\ndata: {...}\n\n"
        const text = await res.text();
        let jsonStr = text;

        if (text.includes("event: message")) {
          const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) throw new Error("No data line in SSE response");
          jsonStr = dataLine.slice(6);
        }

        const data = JSON.parse(jsonStr) as { result?: unknown; error?: { message: string } };
        if (data.error) throw new Error(data.error.message);
        return data.result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES && !(error instanceof Error && error.message.startsWith("MCP request failed:"))) {
          const delay = retryDelayMs(attempt, null);
          console.warn(
            `[MCP Client] ${method} failed (${lastError.message}), retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`
          );
          await sleep(delay);
          continue;
        }
        if (attempt >= MAX_RETRIES) break;
      }
    }

    throw lastError ?? new Error(`MCP request failed after ${MAX_RETRIES} attempts`);
  }

  async listTools(options?: { refresh?: boolean }): Promise<MCPToolSchema[]> {
    if (this.toolsCache && !options?.refresh) {
      return this.toolsCache;
    }

    const result = await this.request("tools/list", {}) as { tools: MCPToolSchema[] };
    this.toolsCache = result.tools;
    return this.toolsCache;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request("tools/call", {
      name,
      arguments: args,
    }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    if (result.isError) {
      throw new Error(result.content[0]?.text ?? "Tool call failed");
    }
    return result.content[0]?.text ?? "";
  }

  /**
   * Convert MCP tools to LangChain tools for binding to an LLM.
   * Pass preloadedTools to avoid redundant tools/list calls at startup.
   */
  async toLangChainTools(filter?: string[], preloadedTools?: MCPToolSchema[]) {
    const mcpTools = preloadedTools ?? await this.listTools();
    const filtered = filter ? mcpTools.filter((t) => filter.includes(t.name)) : mcpTools;

    return filtered.map((mcpTool) => {
      const properties = mcpTool.inputSchema.properties ?? {};
      const schemaShape: Record<string, z.ZodTypeAny> = {};

      for (const [key, prop] of Object.entries(properties)) {
        let fieldSchema: z.ZodTypeAny;
        if (prop.enum) {
          fieldSchema = z.enum(prop.enum as [string, ...string[]]);
        } else if (prop.type === "number") {
          fieldSchema = z.number();
        } else if (prop.type === "boolean") {
          fieldSchema = z.boolean();
        } else if (prop.type === "array") {
          fieldSchema = z.array(z.string());
        } else {
          fieldSchema = z.string();
        }

        const isRequired = mcpTool.inputSchema.required?.includes(key) ?? false;
        schemaShape[key] = isRequired ? fieldSchema : fieldSchema.optional();
      }

      const client = this;
      return tool(
        async (input: Record<string, unknown>) => {
          try {
            return await client.callTool(mcpTool.name, input);
          } catch (error) {
            return `Error calling ${mcpTool.name}: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: mcpTool.name,
          description: mcpTool.description,
          schema: z.object(schemaShape),
        }
      );
    });
  }
}

let sharedClient: MCPClient | null = null;

export function createMCPClient(): MCPClient {
  const url = process.env.MCP_SERVER_URL ?? "http://localhost:3001";
  const token = process.env.MCP_AUTH_TOKEN ?? "dev-token";
  return new MCPClient({ url, token });
}

export function getSharedMCPClient(): MCPClient {
  if (!sharedClient) {
    sharedClient = createMCPClient();
  }
  return sharedClient;
}

/**
 * Poll MCP /health until the server is reachable (handles Render cold starts).
 */
export async function waitForMCPReady(
  client: MCPClient,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 12;
  const intervalMs = options?.intervalMs ?? 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${client.url}/health`);
      if (res.ok) {
        console.log(`[MCP Client] MCP server ready at ${client.url}`);
        return;
      }
      console.warn(`[MCP Client] Health check returned ${res.status} (attempt ${attempt}/${maxAttempts})`);
    } catch (error) {
      console.warn(
        `[MCP Client] Health check failed (attempt ${attempt}/${maxAttempts}): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(`MCP server not ready after ${maxAttempts} attempts (${client.url})`);
}
