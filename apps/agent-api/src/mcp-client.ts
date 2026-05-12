import { tool } from "@langchain/core/tools";
import { z } from "zod";

interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export class MCPClient {
  private baseUrl: string;
  private token: string;

  constructor(options: { url: string; token: string }) {
    this.baseUrl = options.url.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request(method: string, params: unknown): Promise<unknown> {
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
      throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
    }

    // MCP HTTP transport returns SSE: "event: message\ndata: {...}\n\n"
    // Parse the data line from the SSE response
    const text = await res.text();
    let jsonStr = text;

    // If SSE format, extract the data line
    if (text.includes("event: message")) {
      const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) throw new Error("No data line in SSE response");
      jsonStr = dataLine.slice(6); // strip "data: "
    }

    const data = JSON.parse(jsonStr) as { result?: unknown; error?: { message: string } };
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async listTools(): Promise<MCPToolSchema[]> {
    const result = await this.request("tools/list", {}) as { tools: MCPToolSchema[] };
    return result.tools;
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
   * Agents call MCP tools via HTTP — when Archon adds a new tool, agents
   * automatically gain access on next restart.
   */
  async toLangChainTools(filter?: string[]) {
    const mcpTools = await this.listTools();
    const filtered = filter ? mcpTools.filter((t) => filter.includes(t.name)) : mcpTools;

    return filtered.map((mcpTool) => {
      // Build a Zod schema from the MCP tool's JSON schema
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

export function createMCPClient(): MCPClient {
  const url = process.env.MCP_SERVER_URL ?? "http://localhost:3001";
  const token = process.env.MCP_AUTH_TOKEN ?? "dev-token";
  return new MCPClient({ url, token });
}
