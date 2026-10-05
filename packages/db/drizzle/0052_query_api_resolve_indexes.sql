-- pg_trgm is a trusted extension (PG13+), so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "center_name_trgm_idx" ON "center" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "competition_name_trgm_idx" ON "competition" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "player_member_id_idx" ON "player" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "player_current_callsign_trgm_idx" ON "player" USING gin ("current_callsign" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "player_callsign_history_callsign_trgm_idx" ON "player_callsign_history" USING gin ("callsign" gin_trgm_ops);