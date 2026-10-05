// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { z } from "zod";

// Errors are read by a model, which acts on them in its next call, so every error
// names the offending field and says how to fix it. See docs/Query_API_Spec.md "Errors".

export type QueryApiErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "insufficient_scope"
  | "invalid_request"
  | "unknown_field"
  | "invalid_metric"
  | "metric_not_applicable"
  | "invalid_scope"
  | "too_many_items"
  | "player_not_found"
  | "ambiguous_player"
  | "center_not_found"
  | "competition_not_found"
  | "game_not_found"
  | "scope_too_broad"
  | "rate_limited"
  | "server_busy"
  | "query_timeout";

const STATUS_BY_CODE: Record<QueryApiErrorCode, number> = {
  missing_api_key: 401,
  invalid_api_key: 401,
  insufficient_scope: 403,
  invalid_request: 400,
  unknown_field: 400,
  invalid_metric: 400,
  metric_not_applicable: 400,
  invalid_scope: 400,
  too_many_items: 400,
  player_not_found: 404,
  ambiguous_player: 400,
  center_not_found: 404,
  competition_not_found: 404,
  game_not_found: 404,
  scope_too_broad: 422,
  rate_limited: 429,
  server_busy: 429,
  query_timeout: 504,
};

export type QueryApiErrorBody = {
  code: QueryApiErrorCode;
  message: string;
  field?: string;
  hint?: string;
  valid_values?: string[];
  retry_after_seconds?: number;
  /** Per-input candidate lists, for ambiguous or unmatched names. */
  candidates?: Record<string, unknown[]>;
};

export class QueryApiError extends Error {
  readonly code: QueryApiErrorCode;
  readonly status: number;
  readonly field?: string;
  readonly hint?: string;
  readonly validValues?: string[];
  readonly retryAfterSeconds?: number;
  readonly candidates?: Record<string, unknown[]>;

  constructor(
    code: QueryApiErrorCode,
    message: string,
    details: {
      field?: string;
      hint?: string;
      validValues?: readonly string[];
      retryAfterSeconds?: number;
      candidates?: Record<string, unknown[]>;
    } = {},
  ) {
    super(message);
    this.name = "QueryApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.field = details.field;
    this.hint = details.hint;
    this.validValues = details.validValues ? [...details.validValues] : undefined;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.candidates = details.candidates;
  }

  toBody(): QueryApiErrorBody {
    return {
      code: this.code,
      message: this.message,
      ...(this.field !== undefined && { field: this.field }),
      ...(this.hint !== undefined && { hint: this.hint }),
      ...(this.validValues !== undefined && { valid_values: this.validValues }),
      ...(this.retryAfterSeconds !== undefined && {
        retry_after_seconds: this.retryAfterSeconds,
      }),
      ...(this.candidates !== undefined && { candidates: this.candidates }),
    };
  }
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      prev[j] = Math.min(above + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = above;
    }
  }
  return prev[b.length]!;
}

/**
 * Closest candidates to `input`, best first, within a distance that scales with length.
 * Substring matches count as close, so "mvp" suggests "avg_mvp".
 */
export function didYouMean(input: string, candidates: readonly string[], max = 3): string[] {
  const needle = input.toLowerCase();
  const threshold = Math.max(2, Math.floor(needle.length / 3));
  return candidates
    .map((c) => {
      const hay = c.toLowerCase();
      const distance = hay.includes(needle) || needle.includes(hay) ? 0 : levenshtein(needle, hay);
      return { c, distance };
    })
    .filter((x) => x.distance <= threshold)
    .sort((a, b) => a.distance - b.distance || a.c.localeCompare(b.c))
    .slice(0, max)
    .map((x) => x.c);
}

/** "Did you mean 'a' or 'b'? " — or an empty string when nothing is close. */
export function suggestionPrefix(input: string, candidates: readonly string[]): string {
  const close = didYouMean(input, candidates);
  if (close.length === 0) return "";
  return `Did you mean ${close.map((c) => `'${c}'`).join(" or ")}? `;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join("");
}

/** Converts the first zod issue into a QueryApiError the model can act on. */
export function fromZodError(error: z.ZodError): QueryApiError {
  const issue = error.issues[0];
  if (!issue) return new QueryApiError("invalid_request", "Invalid request body.");
  const path = formatPath(issue.path);

  if (issue.code === "unrecognized_keys") {
    const keys = issue.keys.map((k) => (path ? `${path}.${k}` : k));
    return new QueryApiError(
      "unknown_field",
      `Unknown field${keys.length > 1 ? "s" : ""}: ${keys.join(", ")}.`,
      {
        field: keys[0],
        hint: "Remove the field. Unknown fields are rejected so a filter is never silently ignored. Valid fields are listed in the tool's input schema.",
      },
    );
  }

  if (issue.code === "invalid_value") {
    const valid = issue.values.map(String);
    return new QueryApiError("invalid_request", `Invalid value for ${path || "body"}.`, {
      field: path || undefined,
      validValues: valid,
    });
  }

  return new QueryApiError("invalid_request", `${path ? `${path}: ` : ""}${issue.message}`, {
    field: path || undefined,
  });
}

/**
 * The Postgres SQLSTATE of an error. Drizzle wraps driver errors (DrizzleQueryError), so
 * the code is usually on `cause`, not the error itself.
 */
function pgErrorCode(err: unknown): string | undefined {
  for (let e = err, depth = 0; typeof e === "object" && e !== null && depth < 5; depth++) {
    if ("code" in e && typeof e.code === "string") return e.code;
    e = "cause" in e ? e.cause : undefined;
  }
  return undefined;
}

/** Postgres `query_canceled`, raised when statement_timeout fires. */
const PG_QUERY_CANCELED = "57014";

/**
 * Maps database errors to API errors. Raw database text never reaches the client:
 * anything unrecognised is logged by the caller and returned as a generic error.
 */
export function mapDatabaseError(err: unknown): QueryApiError | null {
  if (err instanceof QueryApiError) return err;
  if (pgErrorCode(err) === PG_QUERY_CANCELED) {
    return new QueryApiError("query_timeout", "The query took too long and was cancelled.", {
      hint: "Narrow the scope: add a date_range, a center, or fewer breakdown dimensions.",
    });
  }
  return null;
}
