-- 0056 let drizzle name this FK, and Postgres truncated the 68-character name to 63.
ALTER TABLE "sm5_pdf_game_player_interaction" RENAME CONSTRAINT "sm5_pdf_game_player_interaction_scorecard_id_sm5_pdf_scorecard_" TO "sm5_pdf_gpi_scorecard_id_fk";
