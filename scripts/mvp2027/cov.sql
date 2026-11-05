\i std.sql
select count(*) std_games, count(*) filter (where exists (select 1 from sm5_game_player_state p where p.game_id=std.game_id)) with_state from std;
select pg_size_pretty(pg_total_relation_size('sm5_game_player_state')) ps_size, (select reltuples::bigint from pg_class where relname='sm5_game_player_state') ps_rows, (select reltuples::bigint from pg_class where relname='sm5_game_event') ev_rows;
