// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { AuthError } from "next-auth";

// Auth.js wraps causes two ways: `new AuthError(err)` puts it at cause.err, and
// `new AuthError(message, { cause: err })` puts it directly at cause.
function rootCause(error: Error): Error | null {
  const { cause } = error;
  if (cause instanceof Error) return cause;
  if (typeof cause === "object" && cause !== null && "err" in cause) {
    return cause.err instanceof Error ? cause.err : null;
  }
  return null;
}

/**
 * Replaces the default Auth.js error logger, which has two problems: it drops the cause
 * of errors like InvalidCheck, the only clue to why a sign-in failed, and it prints the
 * decoded JWT of an expired session, including the user's name and email. This logs every
 * cause and only the cause's own message and stack, never the rest of cause.
 */
export function logAuthError(error: Error) {
  const type = error instanceof AuthError ? error.type : error.name;
  console.error(`[auth][error] ${type}: ${error.message}`);

  const cause = rootCause(error);
  if (!cause) {
    console.error(error.stack);
    return;
  }
  // Production builds minify class names, so jose's error code is the readable identifier.
  const code = "code" in cause ? ` (${String(cause.code)})` : "";
  console.error(`[auth][cause]${code}:`, cause.stack ?? cause.message);
}
