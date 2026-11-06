\i std.sql
\copy (select g.id game_id, g.scheduled_duration, g.actual_duration from game g join std on std.game_id=g.id) to 'gdur.csv' csv header
