// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { logApiRequest } from "@lfstats/db";
import {
  fromZodError,
  mapDatabaseError,
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  mcpTools,
  metricsMarkdown,
  QueryApiError,
  toolInputSchema,
  withAnalyticsSlot,
} from "@lfstats/db/analytics";
import { authorizeMcpRequest, type McpPrincipal } from "@/lib/query-api/handler";
import { protectedResourceMetadataUrl, siteOrigin } from "@/lib/oauth/server";

// The LFstats MCP server (docs/Query_API_Spec.md "MCP server"), served over Streamable HTTP
// at /mcp. Stateless: every HTTP request gets a fresh server and transport, so nothing is
// held in memory between requests and any web process can serve any request.
//
// The credential (an API key or an OAuth access token) and the rate limit apply per HTTP
// request, exactly as for /api/query/v1. Tool
// calls then go through the same validation, concurrency slot, error shape and request log
// as the HTTP endpoints, so the two surfaces cannot drift apart.

const METRICS_RESOURCE_URI = "lfstats://docs/metrics";

function toolResult(body: unknown, isError = false): CallToolResult {
  // Compact JSON: every byte of a tool result is read by the model.
  return { content: [{ type: "text", text: JSON.stringify(body) }], ...(isError && { isError }) };
}

async function callTool(
  principal: McpPrincipal,
  name: string,
  args: unknown,
): Promise<CallToolResult> {
  const started = performance.now();
  let status = 200;
  let errorCode: string | null = null;
  let rowCount: number | undefined;

  try {
    const tool = mcpTools().find((t) => t.name === name);
    if (!tool) {
      throw new QueryApiError("invalid_request", `Unknown tool '${name}'.`, {
        validValues: mcpTools().map((t) => t.name),
      });
    }
    const parsed = tool.schema.safeParse(args ?? {});
    if (!parsed.success) throw fromZodError(parsed.error);

    const result = await withAnalyticsSlot(() => tool.run(parsed.data as never));
    if (Array.isArray(result.data)) rowCount = result.data.length;
    return toolResult(result);
  } catch (err) {
    const apiError = mapDatabaseError(err);
    if (!apiError) console.error(`[mcp] ${name} failed`, err);
    const error =
      apiError ?? new QueryApiError("invalid_request", "The query could not be completed.");
    status = error.status;
    errorCode = apiError?.code ?? "internal_error";
    return toolResult({ error: error.toBody() }, true);
  } finally {
    logApiRequest({
      ...principal.log,
      endpoint: `mcp:${name}`,
      status,
      durationMs: Math.round(performance.now() - started),
      rowCount,
      errorCode,
    }).catch((err) => console.error("[mcp] request log failed", err));
  }
}

function buildServer(principal: McpPrincipal): Server {
  const server = new Server(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions: MCP_INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpTools().map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: toolInputSchema(t) as { type: "object" },
      annotations: { title: t.title, readOnlyHint: true, openWorldHint: false },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callTool(principal, req.params.name, req.params.arguments),
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: METRICS_RESOURCE_URI,
        name: "metrics",
        title: "LFstats metrics",
        description: "Every metric the tools accept, with its definition.",
        mimeType: "text/markdown",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== METRICS_RESOURCE_URI) {
      throw new Error(`Unknown resource ${req.params.uri}`);
    }
    return {
      contents: [{ uri: METRICS_RESOURCE_URI, mimeType: "text/markdown", text: metricsMarkdown() }],
    };
  });

  return server;
}

/**
 * RFC 9728 §5.1: a 401 names the protected resource metadata, which is how an MCP client
 * discovers the OAuth server and starts sign-in. API-key clients ignore it.
 */
async function wwwAuthenticate(error: QueryApiError): Promise<string> {
  const params = [
    'realm="lfstats"',
    `resource_metadata="${protectedResourceMetadataUrl(await siteOrigin())}"`,
    'scope="query:read"',
  ];
  // RFC 6750 §3.1. A missing credential carries no error code.
  if (error.code === "invalid_api_key") params.push('error="invalid_token"');
  if (error.code === "insufficient_scope") params.push('error="insufficient_scope"');
  return `Bearer ${params.join(", ")}`;
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  let principal: McpPrincipal;
  try {
    principal = await authorizeMcpRequest(request);
  } catch (err) {
    const error =
      err instanceof QueryApiError
        ? err
        : new QueryApiError("invalid_request", "The request could not be authorized.");
    if (!(err instanceof QueryApiError)) console.error("[mcp] authorization failed", err);
    const headers: Record<string, string> = {};
    if (error.status === 401 || error.status === 403) {
      headers["WWW-Authenticate"] = await wwwAuthenticate(error);
    }
    if (error.retryAfterSeconds !== undefined) {
      headers["Retry-After"] = String(error.retryAfterSeconds);
    }
    return Response.json({ error: error.toBody() }, { status: error.status, headers });
  }

  const server = buildServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON response mode: the response is complete once handleRequest resolves.
    await transport.close();
    await server.close();
  }
}
