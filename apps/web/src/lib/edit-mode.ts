// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Cookie persisting whether an admin has toggled edit mode on for game detail
 * pages (SM5 and Laserball). Game detail pages default to view-only for admins;
 * this toggle reveals the mutation controls (delete, exclude, tags, penalties,
 * competition/match assignment, etc). Shared by both `games/[slug]` and
 * `laserball/games/[slug]` so the choice carries across game types.
 */
export const EDIT_MODE_COOKIE = "gameEditMode";
