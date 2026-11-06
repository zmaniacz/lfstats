// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Model-aware MVP reads.
//
// sm5_scorecard.mvp_points holds the DEFAULT model's total (penalties included) and is the
// fast path every query used before multiple models existed. Every non-retired model also
// has its own breakdown rows in sm5_scorecard_mvp, so a non-default model's total is the
// sum of that model's rows for the scorecard. Queries that show MVP take an optional
// `MvpModelRef`; leaving it out (or passing the default) keeps the exact pre-existing SQL.
// The public API and MCP never pass one, so they always report the default model.

import {
  asc,
  Column,
  desc,
  eq,
  getTableName,
  is,
  isNull,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "../client";
import { sm5MvpModel, sm5Scorecard, sm5ScorecardMvp } from "../schema";

/** The minimum a query needs to know about the selected MVP model. */
export type MvpModelRef = { id: string; isDefault: boolean };

export type MvpModelOption = {
  id: string;
  version: string;
  status: "released" | "development";
  isDefault: boolean;
  description: string | null;
};

/** Non-retired MVP models, default first then newest. */
export async function listActiveMvpModels(): Promise<MvpModelOption[]> {
  return db
    .select({
      id: sm5MvpModel.id,
      version: sm5MvpModel.version,
      status: sm5MvpModel.status,
      isDefault: sm5MvpModel.isDefault,
      description: sm5MvpModel.description,
    })
    .from(sm5MvpModel)
    .where(isNull(sm5MvpModel.retiredAt))
    .orderBy(desc(sm5MvpModel.isDefault), asc(sm5MvpModel.releasedAt));
}

/** True when `model` selects something other than the stored mvp_points column. */
export function isNonDefaultMvpModel(model: MvpModelRef | null | undefined): model is MvpModelRef {
  return model != null && !model.isDefault;
}

/**
 * A scorecard's MVP total under `model`, as a SQL expression usable anywhere
 * `sm5Scorecard.mvpPoints` was (select, aggregate, order by, percentile).
 *
 * Default model → the stored column. Other models → the sum of that model's breakdown rows
 * (0 for a scorecard the model has not been backfilled for). Pass the columns explicitly when
 * the query reads sm5_scorecard through an alias.
 */
export function mvpPointsSql(
  model: MvpModelRef | null | undefined,
  columns: { scorecardId: AnyColumn | SQL; mvpPoints: AnyColumn | SQL } = {
    scorecardId: sm5Scorecard.id,
    mvpPoints: sm5Scorecard.mvpPoints,
  },
): SQL<number> {
  if (!isNonDefaultMvpModel(model)) return sql<number>`${columns.mvpPoints}`;
  // Drizzle renders a column unqualified in a single-table query, where a bare "id" inside
  // this subquery would bind to sm5_scorecard_mvp.id; always qualify the outer reference.
  const scorecardId = is(columns.scorecardId, Column)
    ? sql`${sql.identifier(getTableName(columns.scorecardId.table))}.${sql.identifier(columns.scorecardId.name)}`
    : columns.scorecardId;
  return sql<number>`(
    select coalesce(sum(mvp_alt.points), 0)::float
    from sm5_scorecard_mvp mvp_alt
    where mvp_alt.scorecard_id = ${scorecardId}
      and mvp_alt.mvp_model_id = ${model.id}
  )`;
}

/**
 * Restricts sm5_scorecard_mvp breakdown rows to one model. With no model (or the default),
 * the row's model must be the scorecard's own `mvp_model_id` — the query must join
 * sm5_scorecard for that case.
 */
export function mvpComponentModelCondition(model: MvpModelRef | null | undefined): SQL {
  return isNonDefaultMvpModel(model)
    ? eq(sm5ScorecardMvp.mvpModelId, model.id)
    : eq(sm5ScorecardMvp.mvpModelId, sm5Scorecard.mvpModelId);
}
