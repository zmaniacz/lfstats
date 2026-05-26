import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const gameOutcomeEnum = pgEnum("game_outcome", [
  "score",
  "elimination",
  "draw",
]);

export const teamResultEnum = pgEnum("team_result", ["win", "loss", "draw"]);

export const destructionMethodEnum = pgEnum("destruction_method", [
  "shot",
  "missile",
  "awarded",
]);

// ---------------------------------------------------------------------------
// Reference & Identity Tables
// ---------------------------------------------------------------------------

export const center = pgTable(
  "center",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: integer("country_code").notNull(),
    siteCode: integer("site_code").notNull(),
    name: text("name").notNull().default("Unknown Center"),
    shortName: text("short_name"),
    city: text("city"),
    countryName: text("country_name"),
    timezone: text("timezone"),
  },
  (t) => [unique().on(t.countryCode, t.siteCode)],
);

export const player = pgTable("player", {
  id: uuid("id").primaryKey().defaultRandom(),
  iplId: text("ipl_id").notNull().unique(),
  memberId: text("member_id"),
  currentCallsign: text("current_callsign").notNull(),
  firstSeenAt: timestamp("first_seen_at").notNull(),
});

export const playerCallsignHistory = pgTable(
  "player_callsign_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id),
    callsign: text("callsign").notNull(),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
  },
  (t) => [unique().on(t.playerId, t.callsign)],
);

export const battlesuit = pgTable(
  "battlesuit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id),
    name: text("name").notNull(),
    hardwareId: text("hardware_id"),
  },
  (t) => [unique().on(t.centerId, t.name)],
);

export const target = pgTable(
  "target",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id),
    hardwareId: text("hardware_id").notNull(),
    name: text("name").notNull(),
  },
  (t) => [unique().on(t.centerId, t.hardwareId)],
);

// ---------------------------------------------------------------------------
// MVP Model (defined before Scorecard — Scorecard holds the FK)
// ---------------------------------------------------------------------------

export const mvpModel = pgTable("mvp_model", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull().unique(),
  releasedAt: timestamp("released_at").notNull(),
  retiredAt: timestamp("retired_at"),
  description: text("description"),
  parameters: jsonb("parameters").notNull(),
});

// ---------------------------------------------------------------------------
// Game Structure Tables
// ---------------------------------------------------------------------------

export const game = pgTable(
  "game",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id),
    startTime: timestamp("start_time").notNull(),
    tdfFilename: text("tdf_filename").notNull(),
    outcome: gameOutcomeEnum("outcome").notNull(),
    scheduledDuration: integer("scheduled_duration").notNull(),
    actualDuration: integer("actual_duration").notNull(),
  },
  (t) => [unique().on(t.centerId, t.startTime)],
);

export const gameTeam = pgTable(
  "game_team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    tdfTeamIndex: integer("tdf_team_index").notNull(),
    isNeutral: boolean("is_neutral").notNull(),
    name: text("name").notNull(),
    colourEnum: integer("colour_enum").notNull(),
    colourRgb: text("colour_rgb"),
    // Null for the Neutral team — concept does not apply
    score: integer("score"),
    eliminationBonus: integer("elimination_bonus"),
    result: teamResultEnum("result"),
    eliminated: boolean("eliminated"),
  },
  (t) => [unique().on(t.gameId, t.tdfTeamIndex)],
);

// ---------------------------------------------------------------------------
// Non-Player Entity Tables
// ---------------------------------------------------------------------------

export const gameTarget = pgTable(
  "game_target",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    targetId: uuid("target_id")
      .notNull()
      .references(() => target.id),
    gameTeamId: uuid("game_team_id")
      .notNull()
      .references(() => gameTeam.id),
    type: text("type").notNull(),
  },
  (t) => [unique().on(t.gameId, t.targetId)],
);

export const gameReferee = pgTable("game_referee", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => game.id),
  // Either player_id+ipl_id (iplId login) or hardware_id — not both
  playerId: uuid("player_id").references(() => player.id),
  iplId: text("ipl_id"),
  callsign: text("callsign").notNull(),
  battlesuitId: uuid("battlesuit_id").references(() => battlesuit.id),
  hardwareId: text("hardware_id"),
});

// ---------------------------------------------------------------------------
// Player Performance Tables
// ---------------------------------------------------------------------------

export const scorecard = pgTable("scorecard", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Identity & Context
  gameId: uuid("game_id")
    .notNull()
    .references(() => game.id),
  playerId: uuid("player_id").references(() => player.id),
  teamId: uuid("team_id")
    .notNull()
    .references(() => gameTeam.id),
  battlesuitId: uuid("battlesuit_id").references(() => battlesuit.id),
  iplId: text("ipl_id"),
  callsign: text("callsign").notNull(),
  position: integer("position").notNull(),
  eliminated: boolean("eliminated").notNull(),
  endTime: timestamp("end_time").notNull(),

  // Shot Stats
  shotsFired: integer("shots_fired").notNull(),
  shotsHit: integer("shots_hit").notNull(),
  shotsHitOpponent: integer("shots_hit_opponent").notNull(),
  shotsHitTeam: integer("shots_hit_team").notNull(),
  shotsHitOpponent3hit: integer("shots_hit_opponent_3hit").notNull(),
  shotsHitOpponentMedic: integer("shots_hit_opponent_medic").notNull(),
  shotsHitTeamMedic: integer("shots_hit_team_medic").notNull(),
  timesHit: integer("times_hit").notNull(),

  // Missile Stats
  missileHits: integer("missile_hits").notNull(),
  missilesHitOpponent: integer("missiles_hit_opponent").notNull(),
  missilesHitTeam: integer("missiles_hit_team").notNull(),
  missilesHitOpponentMedic: integer("missiles_hit_opponent_medic").notNull(),
  missilesHitTeamMedic: integer("missiles_hit_team_medic").notNull(),
  timesHitByMissile: integer("times_hit_by_missile").notNull(),

  // Nuke Stats — Commander only; null for all other positions
  nukesActivated: integer("nukes_activated"),
  nukesDetonated: integer("nukes_detonated"),
  nukesHitMedic: integer("nukes_hit_medic"),
  livesRemovedByNuke: integer("lives_removed_by_nuke"),
  totalNukeActivationTime: integer("total_nuke_activation_time"),
  averageNukeActivationTime: integer("average_nuke_activation_time"),

  // Nuke Cancel Stats — all positions
  nukesCanceled: integer("nukes_canceled").notNull(),
  teamNukesCanceled: integer("team_nukes_canceled").notNull(),

  // Special Ability Stats — position-specific, null where not applicable
  rapidFire: integer("rapid_fire"),                                         // Scout only
  totalRapidTime: integer("total_rapid_time"),                              // Scout only
  averageRapidTime: integer("average_rapid_time"),                          // Scout only
  shotsFiredDuringRapid: integer("shots_fired_during_rapid"),               // Scout only
  shotsHitDuringRapid: integer("shots_hit_during_rapid"),                   // Scout only
  shotsHitOpponentDuringRapid: integer("shots_hit_opponent_during_rapid"),  // Scout only
  shotsHitTeamDuringRapid: integer("shots_hit_team_during_rapid"),          // Scout only
  accuracyDuringRapid: doublePrecision("accuracy_during_rapid"),            // Scout only
  ammoBoost: integer("ammo_boost"),                                         // Ammo Carrier only
  lifeBoost: integer("life_boost"),                                         // Medic only

  // Support Stats — Ammo Carrier and Medic only; null for all other positions
  resuppliesGiven: integer("resupplies_given"),
  doubleResuppliesGiven: integer("double_resupplies_given"),
  // Received stats apply to all positions
  resuppliesReceivedAmmo: integer("resupplies_received_ammo").notNull(),
  resuppliesReceivedLives: integer("resupplies_received_lives").notNull(),

  // Combat Outcomes
  deactivatedOpponent: integer("deactivated_opponent").notNull(),
  deactivatedTeam: integer("deactivated_team").notNull(),
  eliminatedOpponent: integer("eliminated_opponent").notNull(),
  eliminatedTeam: integer("eliminated_team").notNull(),
  eliminatedOpponentMedic: integer("eliminated_opponent_medic").notNull(),
  eliminatedTeamMedic: integer("eliminated_team_medic").notNull(),
  assists: integer("assists").notNull(),
  resetOpponent: integer("reset_opponent").notNull(),
  resetTeam: integer("reset_team").notNull(),
  missileResetOpponent: integer("missile_reset_opponent").notNull(),
  missileResetTeam: integer("missile_reset_team").notNull(),

  // SP Tracking — null for Heavy Weapons only
  spEarned: integer("sp_earned"),
  spSpent: integer("sp_spent"),

  // Targets
  targetsDestroyed: integer("targets_destroyed").notNull(),

  // Penalties
  penalties: integer("penalties").notNull(),

  // End State
  livesLeft: integer("lives_left").notNull(),
  shotsLeft: integer("shots_left").notNull(),

  // Uptime & Downtime (ms; the three always sum to game time for this player)
  uptime: integer("uptime").notNull(),
  resupplyDowntime: integer("resupply_downtime").notNull(),
  otherDowntime: integer("other_downtime").notNull(),

  // Derived Performance
  score: integer("score").notNull(),
  accuracy: doublePrecision("accuracy").notNull(),
  hitDiff: doublePrecision("hit_diff").notNull(),
  mvpPoints: doublePrecision("mvp_points").notNull(),
  mvpModelId: uuid("mvp_model_id")
    .notNull()
    .references(() => mvpModel.id),
});

export const gameTargetDestruction = pgTable("game_target_destruction", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameTargetId: uuid("game_target_id")
    .notNull()
    .references(() => gameTarget.id),
  scorecardId: uuid("scorecard_id")
    .notNull()
    .references(() => scorecard.id),
  method: destructionMethodEnum("method").notNull(),
  time: integer("time").notNull(),
});

export const gamePenalty = pgTable("game_penalty", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => game.id),
  refereeId: uuid("referee_id").references(() => gameReferee.id),
  scorecardId: uuid("scorecard_id")
    .notNull()
    .references(() => scorecard.id),
  scoreValue: integer("score_value").notNull(),
  description: text("description").notNull(),
  time: integer("time"),
});

export const gamePlayerInteraction = pgTable(
  "game_player_interaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => scorecard.id),
    targetScorecardId: uuid("target_scorecard_id")
      .notNull()
      .references(() => scorecard.id),
    shotsHit: integer("shots_hit").notNull(),
    shotDeactivations: integer("shot_deactivations").notNull(),
    missileHits: integer("missile_hits").notNull(),
  },
  (t) => [unique().on(t.gameId, t.scorecardId, t.targetScorecardId)],
);

// ---------------------------------------------------------------------------
// MVP Scoring Tables
// ---------------------------------------------------------------------------

export const scorecardMvp = pgTable(
  "scorecard_mvp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => scorecard.id),
    mvpModelId: uuid("mvp_model_id")
      .notNull()
      .references(() => mvpModel.id),
    component: text("component").notNull(),
    inputValue: doublePrecision("input_value").notNull(),
    points: doublePrecision("points").notNull(),
  },
  (t) => [unique().on(t.scorecardId, t.mvpModelId, t.component)],
);

// ---------------------------------------------------------------------------
// Replay Data Tables
// ---------------------------------------------------------------------------

export const gameEvent = pgTable(
  "game_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    time: integer("time").notNull(),
    eventType: text("event_type").notNull(),
    // Null for events with no actor (0100/0101)
    actorScorecardId: uuid("actor_scorecard_id").references(
      () => scorecard.id,
    ),
    // target_scorecard_id and target_game_target_id are mutually exclusive
    targetScorecardId: uuid("target_scorecard_id").references(
      () => scorecard.id,
    ),
    targetGameTargetId: uuid("target_game_target_id").references(
      () => gameTarget.id,
    ),
    description: text("description").notNull(),
  },
  (t) => [unique().on(t.gameId, t.time, t.eventType, t.actorScorecardId)],
);

export const gamePlayerState = pgTable(
  "game_player_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => gameEvent.id),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => scorecard.id),
    time: integer("time").notNull(),
    score: integer("score").notNull(),
    lives: integer("lives").notNull(),
    shots: integer("shots").notNull(),
    missiles: integer("missiles").notNull(),
    sp: integer("sp").notNull(),
    hitPoints: integer("hit_points").notNull(),
    state: integer("state").notNull(),
    isRapidFire: boolean("is_rapid_fire").notNull(),
    isNuking: boolean("is_nuking").notNull(),
    // Live running values for replay scoreboard — Scorecard columns are authoritative
    accuracy: doublePrecision("accuracy").notNull(),
    hitDiff: doublePrecision("hit_diff").notNull(),
  },
  (t) => [
    unique().on(t.eventId, t.scorecardId),
    // Primary read pattern: reconstruct player state at time T
    index("game_player_state_game_scorecard_time_idx").on(
      t.gameId,
      t.scorecardId,
      t.time,
    ),
  ],
);
