\i std.sql
\copy (select s.id, extract(epoch from (s.end_time - g.start_time))*1000 end_time, g.actual_duration from sm5_scorecard s join std using (game_id) join game g on g.id=s.game_id where s.position=5) to 'medend.csv' csv header
