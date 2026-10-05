// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { handleMcpRequest } from "@/lib/mcp/server";

// /mcp — the LFstats MCP server over Streamable HTTP (stateless, JSON responses).
// Requires `Authorization: Bearer lfs_…` with the query:read permission.
// See docs/Query_API_Spec.md "MCP server".
export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
