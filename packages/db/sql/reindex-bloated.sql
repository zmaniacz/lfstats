-- Rebuild the bloated indexes on the two largest tables.
--
-- Not a migration: REINDEX CONCURRENTLY cannot run inside a transaction, and drizzle wraps
-- each migration in one. Run by hand with psql (not -1/--single-transaction) after
-- 0060_index_space_savings, ideally when chomper is idle. Each statement needs free disk
-- roughly equal to the rebuilt index; the old copy is dropped when it finishes.
--
-- As of 2026-10-27 these indexes were ~2x their packed size (bulk reingest churn);
-- expected reclaim is ~3-4 GB. If a run is interrupted, drop any leftover
-- "<name>_ccnew" invalid index before retrying.

REINDEX INDEX CONCURRENTLY sm5_game_player_state_sc_time_idx;
REINDEX INDEX CONCURRENTLY sm5_game_player_state_event_id_scorecard_id_unique;
REINDEX INDEX CONCURRENTLY sm5_game_player_state_pkey;
REINDEX INDEX CONCURRENTLY sm5_game_player_state_scorecard_id_idx;
REINDEX INDEX CONCURRENTLY sm5_game_event_pkey;
REINDEX INDEX CONCURRENTLY sm5_game_event_game_id_idx;
REINDEX INDEX CONCURRENTLY sm5_game_event_actor_sc_idx;
REINDEX INDEX CONCURRENTLY sm5_scorecard_mvp_scorecard_id_mvp_model_id_component_unique;
REINDEX INDEX CONCURRENTLY sm5_game_player_interaction_unique;
