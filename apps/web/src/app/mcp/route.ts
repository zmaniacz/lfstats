// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { handleMcpRequest } from "@/lib/mcp/server";

// /mcp — the LFstats MCP server over Streamable HTTP (stateless, JSON responses).
// Requires `Authorization: Bearer …` with either an `lfs_` API key that has the query:read
// permission or an OAuth access token from /oauth/token.
// See docs/Query_API_Spec.md "MCP server".
export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
