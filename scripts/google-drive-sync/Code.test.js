// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Tests for Code.gs.
//
// Apps Script has no local test runner, so this loads Code.gs into a Node vm context with
// stubbed Apps Script globals (DriveApp, PropertiesService, UrlFetchApp, …) backed by an
// in-memory fake Drive. That exercises the script's real logic — which files get picked
// up, what S3 keys they get, where they get moved, how sites are scheduled — without
// touching Google or AWS.
//
// Run:  node scripts/google-drive-sync/Code.test.js
//
// What this cannot cover: whether the Apps Script APIs actually behave as stubbed. Drive
// permissions, sharing boundaries, quota limits, and SigV4 acceptance by S3 are only
// provable by running syncNewTdfs() against the real project.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert";

const SRC = fs.readFileSync(path.join(import.meta.dirname, "Code.gs"), "utf8");

// ─── In-memory Drive ───────────────────────────────────────────────────────

function makeFile(name, parent) {
  return {
    _name: name,
    _parent: parent,
    getName: () => name,
    getBlob: () => ({ getBytes: () => [1, 2, 3] }),
    moveTo(dest) {
      this._parent._files = this._parent._files.filter((f) => f !== this);
      dest._files.push(this);
      this._parent = dest;
    },
  };
}

function iter(array) {
  let i = 0;
  return { hasNext: () => i < array.length, next: () => array[i++] };
}

function makeFolder(name) {
  return {
    _name: name,
    _files: [],
    _folders: [],
    getName: () => name,
    getFiles() {
      return iter([...this._files]);
    },
    getFolders() {
      return iter([...this._folders]);
    },
    getFoldersByName(n) {
      return iter(this._folders.filter((x) => x._name === n));
    },
    createFolder(n) {
      const nf = makeFolder(n);
      this._folders.push(nf);
      return nf;
    },
  };
}

/** Loads Code.gs into a fresh vm context wired to the given fake Drive and properties. */
function load({ props = {}, folders = {}, failIds = [], onPut = () => {} } = {}) {
  const logs = [];
  const ctx = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => (props[k] = v),
        setProperties: (o) => Object.assign(props, o),
        deleteProperty: (k) => delete props[k],
      }),
    },
    DriveApp: {
      getFolderById: (id) => {
        if (failIds.includes(id)) throw new Error("File not found: " + id);
        if (!folders[id]) throw new Error("no such folder: " + id);
        return folders[id];
      },
    },
    Logger: { log: (m) => logs.push(String(m)) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp: {
      fetch: (url) => {
        onPut(url);
        return { getResponseCode: () => 200, getContentText: () => "" };
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      formatDate: () => "20260808T000000Z",
      newBlob: (s) => ({ getBytes: () => Buffer.from(String(s)) }),
      computeDigest: () => [1, 2],
      computeHmacSha256Signature: () => [3, 4],
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, logs, props };
}

const scriptProps = (ctx) => ctx.PropertiesService.getScriptProperties();

// Objects built inside the vm have a different Object prototype, so deepStrictEqual's
// prototype check fails on them. Compare structurally instead.
const sameShape = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));

const S3 = {
  S3_BUCKET: "b",
  S3_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "k",
  AWS_SECRET_ACCESS_KEY: "s",
};
const url = (key) => "https://b.s3.us-east-1.amazonaws.com/" + key;

// ─── Runner ────────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok    " + name);
  } catch (err) {
    failures.push({ name, err });
    console.log("  FAIL  " + name);
  }
}

// ─── getSites_ ─────────────────────────────────────────────────────────────

console.log("getSites_");

test("parses SITE_FOLDERS JSON", () => {
  const { ctx } = load({ props: { SITE_FOLDERS: '[{"name":"hq","folderId":"A"}]' } });
  sameShape(ctx.getSites_(scriptProps(ctx)), [{ name: "hq", folderId: "A" }]);
});

test("throws when SITE_FOLDERS is absent", () => {
  const { ctx } = load();
  assert.throws(() => ctx.getSites_(scriptProps(ctx)), /No sites configured/);
});

test("ignores a leftover DRIVE_FOLDER_ID rather than silently single-siting", () => {
  const { ctx } = load({ props: { DRIVE_FOLDER_ID: "A" } });
  assert.throws(() => ctx.getSites_(scriptProps(ctx)), /No sites configured/);
});

test("throws when SITE_FOLDERS is an empty array", () => {
  const { ctx } = load({ props: { SITE_FOLDERS: "[]" } });
  assert.throws(() => ctx.getSites_(scriptProps(ctx)), /empty/);
});

test("throws on an entry missing folderId", () => {
  const { ctx } = load({ props: { SITE_FOLDERS: '[{"name":"x"}]' } });
  assert.throws(() => ctx.getSites_(scriptProps(ctx)), /missing "folderId"/);
});

test("defaults a missing name to the folderId", () => {
  const { ctx } = load({ props: { SITE_FOLDERS: '[{"folderId":"A"}]' } });
  assert.strictEqual(ctx.getSites_(scriptProps(ctx))[0].name, "A");
});

// ─── Sync ──────────────────────────────────────────────────────────────────

console.log("sync");

test("uploads from every site with unprefixed keys, then moves to _processed", () => {
  const a = makeFolder("A");
  const b = makeFolder("B");
  a._files.push(makeFile("3-3_1_x.tdf", a));
  b._files.push(makeFile("4-9_2_y.tdf", b));
  const urls = [];
  const { ctx } = load({
    props: {
      ...S3,
      SITE_FOLDERS: '[{"name":"hq","folderId":"A"},{"name":"west","folderId":"B"}]',
    },
    folders: { A: a, B: b },
    onPut: (u) => urls.push(u),
  });

  ctx.syncNewTdfs();

  assert.deepStrictEqual(urls.sort(), [url("3-3_1_x.tdf"), url("4-9_2_y.tdf")].sort());
  assert.strictEqual(a._files.length, 0, "moved out of the watched root");
  assert.strictEqual(a._folders[0]._name, "_processed");
  assert.strictEqual(a._folders[0]._files.length, 1);
  assert.strictEqual(b._folders[0]._files.length, 1);
});

test("competition subfolder becomes the S3 key prefix and is mirrored in _processed", () => {
  const a = makeFolder("A");
  const comp = a.createFolder("summer-2026");
  comp._files.push(makeFile("3-3_1_x.tdf", comp));
  const urls = [];
  const { ctx } = load({
    props: { ...S3, SITE_FOLDERS: '[{"name":"hq","folderId":"A"}]' },
    folders: { A: a },
    onPut: (u) => urls.push(u),
  });

  ctx.syncNewTdfs();

  assert.deepStrictEqual(urls, [url("summer-2026/3-3_1_x.tdf")]);
  const processed = a._folders.find((f) => f._name === "_processed");
  assert.strictEqual(processed._folders[0]._name, "summer-2026");
  assert.strictEqual(processed._folders[0]._files.length, 1);
});

test("an unreachable site does not stop the others", () => {
  const b = makeFolder("B");
  b._files.push(makeFile("4-9_2_y.tdf", b));
  const urls = [];
  const { ctx, logs } = load({
    props: {
      ...S3,
      SITE_FOLDERS: '[{"name":"revoked","folderId":"GONE"},{"name":"west","folderId":"B"}]',
    },
    folders: { B: b },
    failIds: ["GONE"],
    onPut: (u) => urls.push(u),
  });

  ctx.syncNewTdfs();

  assert.strictEqual(urls.length, 1, "healthy site still synced");
  assert.ok(
    logs.some((l) => /ERROR syncing site "revoked"/.test(l)),
    "expected an error log naming the site, got:\n" + logs.join("\n"),
  );
});

test("SITE_CURSOR advances each run and wraps at the site count", () => {
  const folders = { A: makeFolder("A"), B: makeFolder("B"), C: makeFolder("C") };
  const props = {
    ...S3,
    SITE_FOLDERS:
      '[{"name":"a","folderId":"A"},{"name":"b","folderId":"B"},{"name":"c","folderId":"C"}]',
  };
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const { ctx } = load({ props, folders });
    seen.push(Number(props.SITE_CURSOR ?? 0));
    ctx.syncNewTdfs();
  }
  assert.deepStrictEqual(seen, [0, 1, 2, 0]);
});

test("a failed upload leaves the file in place for the next run", () => {
  const a = makeFolder("A");
  a._files.push(makeFile("3-3_1_x.tdf", a));
  const { ctx, logs } = load({
    props: { ...S3, SITE_FOLDERS: '[{"name":"hq","folderId":"A"}]' },
    folders: { A: a },
    onPut: () => {
      throw new Error("network down");
    },
  });

  ctx.syncNewTdfs();

  assert.strictEqual(a._files.length, 1, "must not be moved to _processed");
  assert.ok(
    logs.some((l) => /ERROR uploading/.test(l)),
    logs.join("\n"),
  );
});

test("non-tdf files are ignored and left alone", () => {
  const a = makeFolder("A");
  a._files.push(makeFile("notes.txt", a));
  const urls = [];
  const { ctx } = load({
    props: { ...S3, SITE_FOLDERS: '[{"name":"hq","folderId":"A"}]' },
    folders: { A: a },
    onPut: (u) => urls.push(u),
  });

  ctx.syncNewTdfs();

  assert.strictEqual(urls.length, 0);
  assert.strictEqual(a._files.length, 1);
});

test("_processed is skipped by the competition walk, so files never re-upload", () => {
  const a = makeFolder("A");
  const processed = a.createFolder("_processed");
  processed._files.push(makeFile("3-3_old_x.tdf", processed));
  const urls = [];
  const { ctx } = load({
    props: { ...S3, SITE_FOLDERS: '[{"name":"hq","folderId":"A"}]' },
    folders: { A: a },
    onPut: (u) => urls.push(u),
  });

  ctx.syncNewTdfs();

  assert.strictEqual(urls.length, 0);
});

test("missing S3 properties fail loudly", () => {
  const { ctx } = load({ props: { SITE_FOLDERS: '[{"name":"hq","folderId":"A"}]' } });
  assert.throws(() => ctx.syncNewTdfs(), /Missing S3 script properties/);
});

// ─── Summary ───────────────────────────────────────────────────────────────

console.log("");
if (failures.length === 0) {
  console.log(passed + " passed");
} else {
  for (const { name, err } of failures) {
    console.error("\n" + name + "\n  " + (err && err.message));
  }
  console.error("\n" + passed + " passed, " + failures.length + " failed");
  process.exit(1);
}
