import { z } from "zod";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<unknown>;
}

export class MCPToolRegistry {
  private tools = new Map<string, MCPToolDefinition>();

  register(tool: MCPToolDefinition): void {
    this.tools.set(tool.name, tool);
    console.log(`[MCP Registry] Registered tool: ${tool.name}`);
  }

  registerAll(tools: MCPToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  getAll(): MCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  get(name: string): MCPToolDefinition | undefined {
    return this.tools.get(name);
  }

  get size(): number {
    return this.tools.size;
  }

  /**
   * Wire this registry into an MCP Server instance.
   * Call this after all tools are registered.
   */
  wireToServer(server: Server): void {
    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getAll().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    }));

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const tool = this.get(name);

      if (!tool) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        const parsed = tool.inputSchema.parse(args);
        const result = await tool.handler(parsed);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }
}

// Minimal Zod → JSON Schema converter (avoids heavy dependency)
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodFieldToJsonSchema(value);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return { type: "object", properties, required };
  }
  return { type: "object" };
}

function zodFieldToJsonSchema(field: z.ZodTypeAny): Record<string, unknown> {
  if (field instanceof z.ZodOptional) return zodFieldToJsonSchema(field.unwrap());
  if (field instanceof z.ZodDefault) return zodFieldToJsonSchema(field._def.innerType);
  if (field instanceof z.ZodString) return { type: "string" };
  if (field instanceof z.ZodNumber) return { type: "number" };
  if (field instanceof z.ZodBoolean) return { type: "boolean" };
  if (field instanceof z.ZodArray) return { type: "array", items: zodFieldToJsonSchema(field.element) };
  if (field instanceof z.ZodEnum) return { type: "string", enum: field.options };
  if (field instanceof z.ZodObject) return zodToJsonSchema(field);
  return {};
}

export const registry = new MCPToolRegistry();
