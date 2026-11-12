// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Rewrites player identities inside a raw TDF file — for when someone plays under
 * the wrong codename (logged in as another member, or not logged in at all and so
 * recorded as an `@NNN` guest). The corrected file is what gets archived, so the fix
 * survives every future reingest.
 *
 * Only whole tab-separated fields are compared, never substrings, and only on the
 * line types that carry entity ids (3–13). On the source player's line 3 rows the
 * `desc` (callsign) and `memberId` columns are rewritten too: ingest copies `desc`
 * into `player.current_callsign`, so swapping only the id would rename the target
 * player site-wide to the wrong callsign.
 *
 * All mappings are applied in a single pass through one lookup table, so two players
 * who swapped suits (A→B and B→A) are corrected together without the second mapping
 * undoing the first.
 */

export interface PlayerRemap {
  /** Source entity id as it appears in the TDF: `#xxxxxxx` (member) or `@NNN` (guest). */
  from: string;
  /** Target member id, `#xxxxxxx`. */
  to: string;
  /** Callsign written into the line 3 `desc` column. */
  callsign: string;
  /** Centre member id written into the line 3 `memberId` column; null blanks it. */
  memberId: string | null;
}

export interface RemapLineCount {
  lineType: string;
  fields: number;
}

export interface RemapResult {
  buffer: Buffer;
  /** Per mapping (keyed by `from`), the number of fields rewritten per line type. */
  counts: Map<string, RemapLineCount[]>;
  /** Line 3 callsigns before the rewrite, keyed by `from`. */
  originalCallsigns: Map<string, string>;
}

export class RemapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemapError";
  }
}

const ID_LINE_TYPES = new Set(["3", "4", "5", "6", "7", "9", "10", "11", "12", "13"]);
const BOM = Buffer.from([0xff, 0xfe]);

/** Accepts `8nfsQ93`, `#8nfsQ93` or `@123` and returns the TDF form. */
export function normalizeEntityId(raw: string): string {
  const id = raw.trim();
  if (id.startsWith("#") || id.startsWith("@")) return id;
  return `#${id}`;
}

export function remapTdfPlayers(buffer: Buffer, remaps: PlayerRemap[]): RemapResult {
  validateRemapList(remaps);

  const hasBom = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  const text = new TextDecoder("utf-16le").decode(hasBom ? buffer.subarray(2) : buffer);

  const byFrom = new Map(remaps.map((r) => [r.from, r]));
  const counts = new Map<string, Map<string, number>>(remaps.map((r) => [r.from, new Map()]));
  const originalCallsigns = new Map<string, string>();

  // Pre-scan line 3 so validation sees every entity before anything is rewritten.
  const entityTypes = new Map<string, Set<string>>();
  let line3Columns: string[] = [];
  for (const line of text.split("\r\n")) {
    if (line.startsWith(";3/") || line.startsWith(";3\t")) {
      line3Columns = line.slice(1).split("\t").slice(1);
      continue;
    }
    if (!line.startsWith("3\t")) continue;
    const fields = line.split("\t");
    const id = fields[2] ?? "";
    const types = entityTypes.get(id) ?? new Set<string>();
    types.add(fields[3] ?? "");
    entityTypes.set(id, types);
  }
  if (line3Columns.length === 0) throw new RemapError("TDF has no line 3 schema comment");

  for (const r of remaps) {
    const types = entityTypes.get(r.from);
    if (!types) throw new RemapError(`${r.from} does not appear in this game`);
    if (!types.has("player") || types.size > 1) {
      throw new RemapError(`${r.from} is not a player entity (type: ${[...types].join(", ")})`);
    }
    // A target already in the game is only legitimate when it is itself being
    // moved elsewhere by another mapping (a swap); otherwise two entities would
    // merge into one.
    if (entityTypes.has(r.to) && !byFrom.has(r.to)) {
      throw new RemapError(
        `${r.to} already played in this game; map it to someone else too if they swapped`,
      );
    }
  }

  // Schema comment lines can re-declare columns mid-file; track the latest per type.
  const descIdx = (cols: string[]) => cols.indexOf("desc") + 1;
  const memberIdx = (cols: string[]) => cols.indexOf("memberId") + 1;
  line3Columns = [];

  const out: string[] = [];
  for (const line of text.split("\r\n")) {
    if (line.startsWith(";")) {
      const parts = line.slice(1).split("\t");
      if (parts[0]?.split("/")[0] === "3") line3Columns = parts.slice(1);
      out.push(line);
      continue;
    }

    const fields = line.split("\t");
    const lineType = fields[0] ?? "";
    if (!ID_LINE_TYPES.has(lineType)) {
      out.push(line);
      continue;
    }

    // Line 3 identity columns first, keyed on the row's original id.
    if (lineType === "3") {
      const remap = byFrom.get(fields[2] ?? "");
      if (remap) {
        const d = descIdx(line3Columns);
        const m = memberIdx(line3Columns);
        if (d > 0 && d < fields.length) {
          if (!originalCallsigns.has(remap.from)) originalCallsigns.set(remap.from, fields[d]!);
          fields[d] = remap.callsign;
        }
        if (m > 0 && m < fields.length) fields[m] = remap.memberId ?? "";
      }
    }

    // Then every id-bearing field. Field 0 is the line type and never an id.
    for (let i = 1; i < fields.length; i++) {
      const remap = byFrom.get(fields[i]!);
      if (!remap) continue;
      // Never touch the callsign column, even if a callsign happens to look like an id.
      if (lineType === "3" && i === descIdx(line3Columns)) continue;
      fields[i] = remap.to;
      const perType = counts.get(remap.from)!;
      perType.set(lineType, (perType.get(lineType) ?? 0) + 1);
    }

    out.push(fields.join("\t"));
  }

  const encoded = Buffer.from(out.join("\r\n"), "utf16le");
  return {
    buffer: hasBom ? Buffer.concat([BOM, encoded]) : encoded,
    counts: new Map(
      [...counts].map(([from, perType]) => [
        from,
        [...perType]
          .map(([lineType, fields]) => ({ lineType, fields }))
          .sort((a, b) => Number(a.lineType) - Number(b.lineType)),
      ]),
    ),
    originalCallsigns,
  };
}

function validateRemapList(remaps: PlayerRemap[]): void {
  if (remaps.length === 0) throw new RemapError("No mappings given");
  const froms = new Set<string>();
  const tos = new Set<string>();
  for (const r of remaps) {
    if (!/^[#@]\S+$/.test(r.from)) throw new RemapError(`Bad source id: ${r.from}`);
    if (!/^#\S+$/.test(r.to)) {
      throw new RemapError(`Target must be a member id (#xxxxxxx), got ${r.to}`);
    }
    if (r.from === r.to) throw new RemapError(`${r.from} is mapped to itself`);
    if (froms.has(r.from)) throw new RemapError(`${r.from} is mapped more than once`);
    if (tos.has(r.to)) throw new RemapError(`${r.to} is the target of more than one mapping`);
    if (r.callsign.includes("\t") || r.callsign.includes("\n") || r.callsign === "") {
      throw new RemapError(`Callsign for ${r.to} is empty or contains a tab/newline`);
    }
    froms.add(r.from);
    tos.add(r.to);
  }
}
