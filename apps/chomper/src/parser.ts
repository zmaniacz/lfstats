import type {
  ParsedTdf,
  ParsedTeam,
  ParsedEntity,
  ParsedEvent,
  ParsedScore,
  ParsedEntityEnd,
  ParsedSm5Stats,
  ParsedPlayerState,
} from "./types.js";

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseTdf(buffer: Buffer): ParsedTdf {
  const text = decodeUtf16Le(buffer);
  const lines = text.split("\r\n").filter((l) => l.length > 0);

  // Track the most recently seen schema comment per line type
  const schemaColumns = new Map<string, string[]>();

  let meta: ParsedTdf["meta"] | null = null;
  const teams: ParsedTeam[] = [];
  const entities: ParsedEntity[] = [];
  const events: ParsedEvent[] = [];
  const scores: ParsedScore[] = [];
  const entityEnds: ParsedEntityEnd[] = [];
  const sm5Stats: ParsedSm5Stats[] = [];
  const playerStateLog: ParsedPlayerState[] = [];

  for (const line of lines) {
    // Schema comment line — update column list for the following line type
    if (line.startsWith(";")) {
      const parts = line.slice(1).split("\t");
      const lineType = parts[0];
      if (lineType !== undefined) {
        schemaColumns.set(lineType, parts.slice(1));
      }
      continue;
    }

    const fields = line.split("\t");
    const lineType = fields[0];

    switch (lineType) {
      case "0":
        meta = parseLine0(fields);
        break;
      case "1":
        if (meta === null)
          throw new ParseError("Line type 1 before line type 0");
        parseLine1(fields, schemaColumns.get("1") ?? [], meta);
        break;
      case "2":
        teams.push(parseLine2(fields, schemaColumns.get("2") ?? []));
        break;
      case "3":
        entities.push(parseLine3(fields, schemaColumns.get("3") ?? []));
        break;
      case "4":
        events.push(parseLine4(fields));
        break;
      case "5":
        scores.push(parseLine5(fields));
        break;
      case "6":
        entityEnds.push(parseLine6(fields));
        break;
      case "7":
        sm5Stats.push(parseLine7(fields));
        break;
      case "9":
        playerStateLog.push(parseLine9(fields));
        break;
      // Ignore unknown line types
    }
  }

  if (meta === null) throw new ParseError("Missing line type 0 (info)");

  // Detect mid-game position changes: same entity ID appearing more than once
  // with a different category (position). Each subsequent registration becomes a
  // new "generation" with a disambiguated internal ID. The external ID routing
  // table lets the simulator resolve the correct state by event timestamp.
  const entityRouting = buildEntityRouting(entities, sm5Stats);

  return {
    meta,
    teams,
    entities,
    events,
    scores,
    entityEnds,
    sm5Stats: mergeDuplicateSm5Stats(sm5Stats),
    playerStateLog,
    entityRouting,
  };
}

// When hardware glitches, a player's section 7 scorecard can appear twice in
// the same TDF. The accumulated counters (shots fired, hits, etc.) reflect only
// one of the two periods, while section 4 events cover both. Merge duplicates
// by summing accumulated fields and keeping the last entry's residuals
// (livesLeft, shotsLeft), which represent the true end-of-game state.
function mergeDuplicateSm5Stats(stats: ParsedSm5Stats[]): ParsedSm5Stats[] {
  const seen = new Map<string, ParsedSm5Stats>();
  for (const s of stats) {
    const existing = seen.get(s.id);
    if (!existing) {
      seen.set(s.id, { ...s });
    } else {
      existing.shotsHit += s.shotsHit;
      existing.shotsFired += s.shotsFired;
      existing.timesZapped += s.timesZapped;
      existing.timesMissiled += s.timesMissiled;
      existing.missileHits += s.missileHits;
      existing.nukesDetonated += s.nukesDetonated;
      existing.nukesActivated += s.nukesActivated;
      existing.nukeCancels += s.nukeCancels;
      existing.medicHits += s.medicHits;
      existing.ownMedicHits += s.ownMedicHits;
      existing.medicNukes += s.medicNukes;
      existing.scoutRapid += s.scoutRapid;
      existing.lifeBoost += s.lifeBoost;
      existing.ammoBoost += s.ammoBoost;
      existing.penalties += s.penalties;
      existing.shot3Hit += s.shot3Hit;
      existing.ownNukeCancels += s.ownNukeCancels;
      existing.shotOpponent += s.shotOpponent;
      existing.shotTeam += s.shotTeam;
      existing.missiledOpponent += s.missiledOpponent;
      existing.missiledTeam += s.missiledTeam;
      // Residuals: last entry wins (true end-of-game state)
      existing.livesLeft = s.livesLeft;
      existing.shotsLeft = s.shotsLeft;
    }
  }
  return [...seen.values()];
}

// Detects mid-game position changes where the same entity ID re-registers with
// a different category. Each additional registration becomes a new generation:
//   gen 0 keeps the original entity ID
//   gen 1+ gets id = "{originalId}_gen{N}"
//
// The entities and sm5Stats arrays are mutated in place to use the internal IDs.
// sm5Stats entries are matched to generations by order of appearance (the
// hardware emits a separate section 7 entry per registration in order).
//
// Same-position duplicates (hardware glitches) are left unchanged so
// mergeDuplicateSm5Stats can still merge them.
function buildEntityRouting(
  entities: import("./types.js").ParsedEntity[],
  sm5Stats: import("./types.js").ParsedSm5Stats[],
): import("./types.js").ParsedTdf["entityRouting"] {
  // Group player entities by external ID (preserve insertion order = time order)
  const groups = new Map<string, import("./types.js").ParsedEntity[]>();
  for (const entity of entities) {
    if (entity.type !== "player" || entity.category === 0) continue;
    const arr = groups.get(entity.originalId) ?? [];
    arr.push(entity);
    groups.set(entity.originalId, arr);
  }

  const routing: import("./types.js").ParsedTdf["entityRouting"] = [];

  for (const [externalId, group] of groups) {
    if (group.length <= 1) continue;
    // Only create separate generations when the position actually changes
    const categories = group.map((e) => e.category);
    if (categories.every((c) => c === categories[0])) continue; // same position = hardware glitch

    const generations: { internalId: string; startTime: number }[] = [];
    for (let i = 0; i < group.length; i++) {
      const internalId = i === 0 ? externalId : `${externalId}_gen${i}`;
      group[i]!.id = internalId;
      generations.push({ internalId, startTime: group[i]!.time });
    }
    routing.push({ externalId, generations });

    // Rename corresponding sm5Stats entries by order of appearance
    let genIdx = 0;
    for (const stat of sm5Stats) {
      if (stat.id !== externalId) continue;
      if (genIdx > 0 && genIdx < generations.length) {
        stat.id = generations[genIdx]!.internalId;
      }
      genIdx++;
    }
  }

  return routing;
}

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

function decodeUtf16Le(buffer: Buffer): string {
  // Skip BOM if present (0xFF 0xFE for UTF-16 LE)
  let start = 0;
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    start = 2;
  }
  const decoder = new TextDecoder("utf-16le");
  return decoder.decode(buffer.subarray(start));
}

// ---------------------------------------------------------------------------
// Line parsers
// ---------------------------------------------------------------------------

function parseLine0(fields: string[]): ParsedTdf["meta"] {
  // fields: [0, file-version, program-version, centre]
  const [, fileVersionStr, , centre] = fields;
  if (!fileVersionStr || !centre) throw new ParseError("Malformed line type 0");

  const [countryStr, siteStr] = centre.split("-");
  const countryCode = parseInt(countryStr ?? "0", 10);
  const siteCode = parseInt(siteStr ?? "0", 10);

  return {
    fileVersion: parseFloat(fileVersionStr),
    centre,
    countryCode,
    siteCode,
    startTime: "", // filled in by parseLine1
    duration: 900000, // default, overwritten by line 1
    penalty: 0, // default, overwritten by line 1
    missionType: 0,
    missionDesc: "",
  };
}

function parseLine1(
  fields: string[],
  columns: string[],
  meta: ParsedTdf["meta"],
): void {
  // Minimal schema (2.000): [1, type, desc, start]
  // columns will be populated from the schema comment line
  const getValue = makeColReader(fields, columns);

  meta.missionType = parseInt(fields[1] ?? "0", 10);
  meta.missionDesc = fields[2] ?? "";
  meta.startTime = fields[3] ?? "";

  const durationStr = getValue("duration");
  if (durationStr !== null) {
    meta.duration = parseInt(durationStr, 10);
  }

  const penaltyStr = getValue("penalty");
  if (penaltyStr !== null) {
    meta.penalty = parseInt(penaltyStr, 10);
  }
}

function parseLine2(fields: string[], columns: string[]): ParsedTeam {
  // [2, index, desc, colour-enum, colour-desc, ?colour-rgb]
  const getValue = makeColReader(fields, columns);

  return {
    index: parseInt(fields[1] ?? "0", 10),
    desc: fields[2] ?? "",
    colourEnum: parseInt(fields[3] ?? "0", 10),
    colourDesc: fields[4] ?? "",
    colourRgb: getValue("colour-rgb"),
  };
}

function parseLine3(fields: string[], columns: string[]): ParsedEntity {
  // [3, time, id, type, desc, team, level, category, ?battlesuit, ?memberId]
  const getValue = makeColReader(fields, columns);

  const id = fields[2] ?? "";
  return {
    time: parseInt(fields[1] ?? "0", 10),
    id,
    originalId: id,
    type: fields[3] ?? "",
    desc: fields[4] ?? "",
    team: parseInt(fields[5] ?? "0", 10),
    level: parseInt(fields[6] ?? "0", 10),
    category: parseInt(fields[7] ?? "0", 10),
    battlesuit: getValue("battlesuit"),
    memberId: getValue("memberId"),
  };
}

function parseLine4(fields: string[]): ParsedEvent {
  // [4, time, type, ...description tokens]
  const time = parseInt(fields[1] ?? "0", 10);
  const type = fields[2] ?? "";
  const tokens = fields.slice(3);

  // Description tokens: actor, verb(s), [target]
  // For 0100/0101: just a fixed string phrase, no actor/target
  let actor: string | null = null;
  let target: string | null = null;
  let description = tokens.join(" ").trim();

  if (tokens.length >= 3) {
    actor = tokens[0] ?? null;
    target = tokens[tokens.length - 1] ?? null;
    description = tokens.slice(1, -1).join(" ").trim();
  } else if (tokens.length === 2) {
    actor = tokens[0] ?? null;
    description = tokens[1] ?? "";
  } else if (tokens.length === 1) {
    // e.g. "* Mission Start *" is a single token after the type
    description = tokens[0] ?? "";
  }

  // For mission lifecycle events, actor and target are always null
  if (type === "0100" || type === "0101") {
    actor = null;
    target = null;
  }

  return { time, type, actor, target, description };
}

function parseLine5(fields: string[]): ParsedScore {
  return {
    time: parseInt(fields[1] ?? "0", 10),
    entity: fields[2] ?? "",
    old: parseInt(fields[3] ?? "0", 10),
    delta: parseInt(fields[4] ?? "0", 10),
    new: parseInt(fields[5] ?? "0", 10),
  };
}

function parseLine6(fields: string[]): ParsedEntityEnd {
  return {
    time: parseInt(fields[1] ?? "0", 10),
    id: fields[2] ?? "",
    exitType: fields[3] ?? "02",
    score: parseInt(fields[4] ?? "0", 10),
  };
}

function parseLine7(fields: string[]): ParsedSm5Stats {
  const n = (idx: number) => parseInt(fields[idx] ?? "0", 10);
  return {
    id: fields[1] ?? "",
    shotsHit: n(2),
    shotsFired: n(3),
    timesZapped: n(4),
    timesMissiled: n(5),
    missileHits: n(6),
    nukesDetonated: n(7),
    nukesActivated: n(8),
    nukeCancels: n(9),
    medicHits: n(10),
    ownMedicHits: n(11),
    medicNukes: n(12),
    scoutRapid: n(13),
    lifeBoost: n(14),
    ammoBoost: n(15),
    livesLeft: n(16),
    shotsLeft: n(17),
    penalties: n(18),
    shot3Hit: n(19),
    ownNukeCancels: n(20),
    shotOpponent: n(21),
    shotTeam: n(22),
    missiledOpponent: n(23),
    missiledTeam: n(24),
  };
}

function parseLine9(fields: string[]): ParsedPlayerState {
  return {
    time: parseInt(fields[1] ?? "0", 10),
    entity: fields[2] ?? "",
    state: parseInt(fields[3] ?? "0", 10),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeColReader(
  fields: string[],
  columns: string[],
): (colName: string) => string | null {
  // fields[0] is the line type, fields[1..] are the values
  // columns[0] is the first column name (after line type)
  return (colName: string) => {
    const idx = columns.indexOf(colName);
    if (idx === -1) return null;
    const value = fields[idx + 1]; // +1 because fields[0] is line type
    return value !== undefined && value !== "" ? value : null;
  };
}
