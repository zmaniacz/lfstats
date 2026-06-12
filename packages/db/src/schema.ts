// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
  "aborted",
  "forfeit",
  "replay",
]);

export const teamResultEnum = pgEnum("team_result", ["win", "loss", "draw"]);

export const destructionMethodEnum = pgEnum("destruction_method", ["shot", "missile", "awarded"]);

export const competitionTypeEnum = pgEnum("competition_type", ["competitive", "social"]);

export const competitionRoundTypeEnum = pgEnum("competition_round_type", [
  "pool",
  "finals",
  "split-pool",
  "wildcard",
]);

export const competitionStateEnum = pgEnum("competition_state", [
  "preshow",
  "upcoming",
  "active",
  "completed",
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
// SM5 MVP Model (defined before sm5Scorecard — sm5Scorecard holds the FK)
// ---------------------------------------------------------------------------

export const sm5MvpModel = pgTable("sm5_mvp_model", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull().unique(),
  releasedAt: timestamp("released_at").notNull(),
  retiredAt: timestamp("retired_at"),
  description: text("description"),
  parameters: jsonb("parameters").notNull(),
});

// ---------------------------------------------------------------------------
// Game Organization Tables
// ---------------------------------------------------------------------------

export const competition = pgTable("competition", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: competitionTypeEnum("type").notNull(),
  state: competitionStateEnum("state").notNull().default("active"),
  hostCenterId: uuid("host_center_id").references(() => center.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  description: text("description"),
  challongeLink: text("challonge_link"),
  challongeBracketHeight: integer("challonge_bracket_height"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const competitionTeam = pgTable(
  "competition_team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortName: text("short_name"),
    hasLogo: boolean("has_logo").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.competitionId, t.name), unique().on(t.competitionId, t.slug)],
);

export const competitionTeamPlayer = pgTable(
  "competition_team_player",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionTeamId: uuid("competition_team_id")
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    isMercenary: boolean("is_mercenary").notNull().default(false),
    hasProfilePicture: boolean("has_profile_picture").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.competitionTeamId, t.playerId),
    index("competition_team_player_player_id_idx").on(t.playerId),
  ],
);

export const competitionRound = pgTable(
  "competition_round",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    roundNumber: integer("round_number").notNull(),
    type: competitionRoundTypeEnum("type").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.competitionId, t.roundNumber)],
);

export const competitionPool = pgTable(
  "competition_pool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => competitionRound.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.roundId, t.name)],
);

export const competitionRoundTeamPool = pgTable(
  "competition_round_team_pool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => competitionRound.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => competitionPool.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.roundId, t.teamId),
    index("competition_round_team_pool_pool_id_idx").on(t.poolId),
  ],
);

export const competitionMatch = pgTable(
  "competition_match",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => competitionRound.id, { onDelete: "cascade" }),
    poolId: uuid("pool_id").references(() => competitionPool.id, { onDelete: "set null" }),
    matchNumber: integer("match_number").notNull(),
    team1Id: uuid("team1_id").references(() => competitionTeam.id),
    team2Id: uuid("team2_id").references(() => competitionTeam.id),
    scheduledTime: timestamp("scheduled_time"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.roundId, t.matchNumber),
    index("competition_match_competition_id_idx").on(t.competitionId),
  ],
);

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
    competitionId: uuid("competition_id").references(() => competition.id, {
      onDelete: "set null",
    }),
    startTime: timestamp("start_time").notNull(),
    tdfFilename: text("tdf_filename").notNull(),
    outcome: gameOutcomeEnum("outcome").notNull(),
    scheduledDuration: integer("scheduled_duration").notNull(),
    actualDuration: integer("actual_duration").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    exclude: boolean("exclude").notNull().default(false),
  },
  (t) => [
    unique().on(t.centerId, t.startTime),
    index("game_start_time_idx").on(t.startTime),
    index("game_competition_id_idx").on(t.competitionId),
  ],
);

export const sm5GameTeam = pgTable(
  "sm5_game_team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
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

export const competitionMatchGame = pgTable(
  "competition_match_game",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => competitionMatch.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    gameNumber: integer("game_number").notNull(),
    team1GameTeamId: uuid("team1_game_team_id")
      .notNull()
      .references(() => sm5GameTeam.id),
    team2GameTeamId: uuid("team2_game_team_id")
      .notNull()
      .references(() => sm5GameTeam.id),
  },
  (t) => [unique().on(t.matchId, t.gameNumber), unique().on(t.gameId)],
);

// ---------------------------------------------------------------------------
// Non-Player Entity Tables
// ---------------------------------------------------------------------------

export const sm5GameTarget = pgTable(
  "sm5_game_target",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => target.id),
    gameTeamId: uuid("game_team_id").references(() => sm5GameTeam.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
  },
  (t) => [
    unique().on(t.gameId, t.targetId),
    index("sm5_game_target_game_team_id_idx").on(t.gameTeamId),
  ],
);

export const gameReferee = pgTable(
  "game_referee",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    // Either player_id+ipl_id (iplId login) or hardware_id — not both
    playerId: uuid("player_id").references(() => player.id),
    iplId: text("ipl_id"),
    callsign: text("callsign").notNull(),
    battlesuitId: uuid("battlesuit_id").references(() => battlesuit.id),
    hardwareId: text("hardware_id"),
  },
  (t) => [index("game_referee_game_id_idx").on(t.gameId)],
);

// ---------------------------------------------------------------------------
// SM5 Player Performance Tables
// ---------------------------------------------------------------------------

export const sm5Scorecard = pgTable(
  "sm5_scorecard",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Identity & Context
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").references(() => player.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => sm5GameTeam.id, { onDelete: "cascade" }),
    battlesuitId: uuid("battlesuit_id").references(() => battlesuit.id),
    iplId: text("ipl_id"),
    callsign: text("callsign").notNull(),
    position: integer("position").notNull(),
    eliminated: boolean("eliminated").notNull(),
    endTime: timestamp("end_time").notNull(),
    isMercenary: boolean("is_mercenary").notNull().default(false),

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
    medicHits: integer("medic_hits").notNull().default(0),
    teamMedicHits: integer("team_medic_hits").notNull().default(0),

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

    // Nuke-cancelled-by-nuke stats — Commander only
    nukesCanceledByNuke: integer("nukes_canceled_by_nuke"),
    ownNukesCanceledByNuke: integer("own_nukes_canceled_by_nuke"),

    // Special Ability Stats — position-specific, null where not applicable
    rapidFire: integer("rapid_fire"), // Scout only
    totalRapidTime: integer("total_rapid_time"), // Scout only
    averageRapidTime: integer("average_rapid_time"), // Scout only
    shotsFiredDuringRapid: integer("shots_fired_during_rapid"), // Scout only
    shotsHitDuringRapid: integer("shots_hit_during_rapid"), // Scout only
    shotsHitOpponentDuringRapid: integer("shots_hit_opponent_during_rapid"), // Scout only
    shotsHitTeamDuringRapid: integer("shots_hit_team_during_rapid"), // Scout only
    accuracyDuringRapid: doublePrecision("accuracy_during_rapid"), // Scout only
    ammoBoost: integer("ammo_boost"), // Ammo Carrier only
    lifeBoost: integer("life_boost"), // Medic only

    // Support Stats — Ammo Carrier and Medic only; null for all other positions
    resuppliesGiven: integer("resupplies_given"),
    doubleResuppliesGiven: integer("double_resupplies_given"),
    // Received stats apply to all positions
    resuppliesReceivedAmmo: integer("resupplies_received_ammo").notNull(),
    resuppliesReceivedLives: integer("resupplies_received_lives").notNull(),
    emergencyResuppliesReceivedAmmo: integer("emergency_resupplies_received_ammo")
      .notNull()
      .default(0),
    emergencyResuppliesReceivedLives: integer("emergency_resupplies_received_lives")
      .notNull()
      .default(0),
    doubleResuppliesReceived: integer("double_resupplies_received").notNull(),

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
      .references(() => sm5MvpModel.id),
  },
  (t) => [
    index("sm5_scorecard_game_id_idx").on(t.gameId),
    index("sm5_scorecard_team_id_idx").on(t.teamId),
    index("sm5_scorecard_player_id_idx").on(t.playerId),
    index("sm5_scorecard_ipl_id_idx").on(t.iplId),
  ],
);

export const sm5GameTargetDestruction = pgTable(
  "sm5_game_target_destruction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameTargetId: uuid("game_target_id").notNull(),
    scorecardId: uuid("scorecard_id").notNull(),
    method: destructionMethodEnum("method").notNull(),
    time: integer("time").notNull(),
  },
  (t) => [
    foreignKey({
      name: "sm5_gtd_game_target_id_fk",
      columns: [t.gameTargetId],
      foreignColumns: [sm5GameTarget.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "sm5_gtd_scorecard_id_fk",
      columns: [t.scorecardId],
      foreignColumns: [sm5Scorecard.id],
    }).onDelete("cascade"),
    index("sm5_gtd_game_target_id_idx").on(t.gameTargetId),
    index("sm5_gtd_scorecard_id_idx").on(t.scorecardId),
  ],
);

export const sm5GamePenalty = pgTable(
  "sm5_game_penalty",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    // set null so gameReferee cascade-delete doesn't conflict with gameId cascade-delete ordering
    refereeId: uuid("referee_id").references(() => gameReferee.id, {
      onDelete: "set null",
    }),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => sm5Scorecard.id, { onDelete: "cascade" }),
    scoreValue: integer("score_value").notNull(),
    description: text("description").notNull(),
    time: integer("time"),
    type: text("type").notNull().default("Common Foul"),
    mvpValue: doublePrecision("mvp_value").notNull().default(0),
    inGame: boolean("in_game").notNull().default(true),
    rescinded: boolean("rescinded").notNull().default(false),
  },
  (t) => [
    index("sm5_game_penalty_scorecard_id_idx").on(t.scorecardId),
    index("sm5_game_penalty_game_id_idx").on(t.gameId),
    index("sm5_game_penalty_referee_id_idx").on(t.refereeId),
  ],
);

export const sm5GamePlayerInteraction = pgTable(
  "sm5_game_player_interaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => sm5Scorecard.id, { onDelete: "cascade" }),
    targetScorecardId: uuid("target_scorecard_id").notNull(),
    shotsHit: integer("shots_hit").notNull(),
    shotDeactivations: integer("shot_deactivations").notNull(),
    missileHits: integer("missile_hits").notNull(),
  },
  (t) => [
    unique("sm5_game_player_interaction_unique").on(t.gameId, t.scorecardId, t.targetScorecardId),
    foreignKey({
      name: "sm5_gpi_tgt_scorecard_id_fk",
      columns: [t.targetScorecardId],
      foreignColumns: [sm5Scorecard.id],
    }).onDelete("cascade"),
    index("sm5_gpi_scorecard_id_idx").on(t.scorecardId),
    index("sm5_gpi_target_scorecard_id_idx").on(t.targetScorecardId),
  ],
);

// ---------------------------------------------------------------------------
// SM5 MVP Scoring Tables
// ---------------------------------------------------------------------------

export const sm5ScorecardMvp = pgTable(
  "sm5_scorecard_mvp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => sm5Scorecard.id, { onDelete: "cascade" }),
    mvpModelId: uuid("mvp_model_id")
      .notNull()
      .references(() => sm5MvpModel.id),
    component: text("component").notNull(),
    inputValue: doublePrecision("input_value").notNull(),
    points: doublePrecision("points").notNull(),
  },
  (t) => [unique().on(t.scorecardId, t.mvpModelId, t.component)],
);

// ---------------------------------------------------------------------------
// SM5 Replay Data Tables
// ---------------------------------------------------------------------------

export const sm5GameEvent = pgTable(
  "sm5_game_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    time: integer("time").notNull(),
    eventType: text("event_type").notNull(),
    // Null for events with no actor (0100/0101).
    // actorScorecardId (player) and actorGameTargetId (non-player) are mutually exclusive.
    actorScorecardId: uuid("actor_scorecard_id").references(() => sm5Scorecard.id, {
      onDelete: "cascade",
    }),
    actorGameTargetId: uuid("actor_game_target_id").references(() => sm5GameTarget.id, {
      onDelete: "cascade",
    }),
    // target_scorecard_id and target_game_target_id are mutually exclusive
    targetScorecardId: uuid("target_scorecard_id").references(() => sm5Scorecard.id, {
      onDelete: "cascade",
    }),
    targetGameTargetId: uuid("target_game_target_id").references(() => sm5GameTarget.id, {
      onDelete: "cascade",
    }),
    description: text("description").notNull(),
  },
  (t) => [
    index("sm5_game_event_game_id_idx").on(t.gameId),
    index("sm5_game_event_actor_sc_idx").on(t.actorScorecardId),
    index("sm5_game_event_target_sc_idx").on(t.targetScorecardId),
    index("sm5_game_event_actor_gt_idx").on(t.actorGameTargetId),
    index("sm5_game_event_target_gt_idx").on(t.targetGameTargetId),
  ],
);

// ---------------------------------------------------------------------------
// Chomper Job Tracking
// ---------------------------------------------------------------------------

export const chomperJob = pgTable(
  "chomper_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    s3Key: text("s3_key").notNull(),
    status: text("status").notNull(), // 'processing' | 'completed' | 'failed' | 'rejected' | 'skipped'
    lambdaRequestId: text("lambda_request_id"),
    gameId: uuid("game_id").references(() => game.id, { onDelete: "cascade" }),
    skipReason: text("skip_reason"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("chomper_job_game_id_idx").on(t.gameId),
    index("chomper_job_status_idx").on(t.status),
  ],
);

export const sm5GamePlayerState = pgTable(
  "sm5_game_player_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => sm5GameEvent.id, { onDelete: "cascade" }),
    scorecardId: uuid("scorecard_id")
      .notNull()
      .references(() => sm5Scorecard.id, { onDelete: "cascade" }),
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
    isEliminated: boolean("is_eliminated").notNull().default(false),
    // Live running values for replay scoreboard — Scorecard columns are authoritative
    accuracy: doublePrecision("accuracy").notNull(),
    hitDiff: doublePrecision("hit_diff").notNull(),
  },
  (t) => [
    unique().on(t.eventId, t.scorecardId),
    // Primary read pattern: reconstruct player state at time T
    index("sm5_game_player_state_sc_time_idx").on(t.gameId, t.scorecardId, t.time),
    index("sm5_game_player_state_scorecard_id_idx").on(t.scorecardId),
  ],
);

// ---------------------------------------------------------------------------
// Auth Tables (NextAuth.js v5 / Auth.js + custom RBAC)
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["admin", "centerAdmin", "uploader", "superAdmin"]);

export const authUser = pgTable("auth_user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const authAccount = pgTable(
  "auth_account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("auth_account_user_id_idx").on(t.userId),
  ],
);

export const authSession = pgTable("auth_session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationToken = pgTable(
  "auth_verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const userRole = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    centerId: uuid("center_id").references(() => center.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [unique().on(t.userId, t.role, t.centerId)],
);

// ---------------------------------------------------------------------------
// Game Tagging (center-scoped)
// ---------------------------------------------------------------------------

export const gameTag = pgTable(
  "game_tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => center.id),
    name: text("name").notNull(),
    color: text("color"),
    description: text("description"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.centerId, t.name)],
);

export const gameTagAssignment = pgTable(
  "game_tag_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => gameTag.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by"),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.gameId, t.tagId), index("game_tag_assignment_tag_id_idx").on(t.tagId)],
);

// ---------------------------------------------------------------------------
// User Favorites (auth-user scoped, not player-scoped)
// ---------------------------------------------------------------------------

export const userFavoriteGame = pgTable(
  "user_favorite_game",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.gameId)],
);

export const userFavoritePlayer = pgTable(
  "user_favorite_player",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.playerId)],
);
