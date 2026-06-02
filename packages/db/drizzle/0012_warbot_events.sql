-- Allow non-player entities (warbots) with no assigned game team
ALTER TABLE "sm5_game_target" ALTER COLUMN "game_team_id" DROP NOT NULL;

-- Non-player actor reference for warbot/beacon events in the replay
ALTER TABLE "sm5_game_event" ADD COLUMN "actor_game_target_id" uuid REFERENCES "sm5_game_target"("id") ON DELETE cascade;
