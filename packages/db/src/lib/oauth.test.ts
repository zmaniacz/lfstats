// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedRedirectUri,
  isValidCodeChallenge,
  parseScopes,
  sameResource,
  verifyPkceS256,
} from "./oauth";

describe("verifyPkceS256", () => {
  // RFC 7636 Appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("accepts the RFC 7636 example pair", () => {
    assert.equal(isValidCodeChallenge(challenge), true);
    assert.equal(verifyPkceS256(verifier, challenge), true);
  });

  it("rejects a different verifier", () => {
    assert.equal(verifyPkceS256(verifier.replace("d", "e"), challenge), false);
  });

  it("rejects verifiers outside 43–128 unreserved characters", () => {
    assert.equal(verifyPkceS256("short", challenge), false);
    assert.equal(verifyPkceS256(`${verifier}!`, challenge), false);
  });

  it("rejects a plain challenge", () => {
    assert.equal(isValidCodeChallenge(verifier.slice(0, 40)), false);
  });
});

describe("isAllowedRedirectUri", () => {
  it("allows https, loopback http and private-use schemes", () => {
    assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
    assert.equal(isAllowedRedirectUri("http://localhost:6274/oauth/callback"), true);
    assert.equal(isAllowedRedirectUri("http://127.0.0.1:33418/"), true);
    assert.equal(isAllowedRedirectUri("http://[::1]:8080/cb"), true);
    assert.equal(isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback"), true);
  });

  it("refuses remote http, fragments and dangerous schemes", () => {
    assert.equal(isAllowedRedirectUri("http://evil.example/cb"), false);
    assert.equal(isAllowedRedirectUri("https://claude.ai/cb#frag"), false);
    assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
    assert.equal(isAllowedRedirectUri("data:text/html,hi"), false);
    assert.equal(isAllowedRedirectUri("file:///etc/passwd"), false);
    assert.equal(isAllowedRedirectUri("localhost:3000/cb"), false);
    assert.equal(isAllowedRedirectUri("c:\\temp"), false);
    assert.equal(isAllowedRedirectUri("not a url"), false);
  });
});

describe("parseScopes", () => {
  it("defaults to every supported scope", () => {
    assert.deepEqual(parseScopes(null), ["query:read"]);
    assert.deepEqual(parseScopes(""), ["query:read"]);
  });

  it("dedupes known scopes and rejects unknown ones", () => {
    assert.deepEqual(parseScopes("query:read  query:read"), ["query:read"]);
    assert.equal(parseScopes("query:read video:write"), null);
  });
});

describe("sameResource", () => {
  it("ignores a trailing slash", () => {
    assert.equal(sameResource("https://lfstats.com/mcp/", "https://lfstats.com/mcp"), true);
    assert.equal(sameResource("https://lfstats.com/api", "https://lfstats.com/mcp"), false);
  });
});
