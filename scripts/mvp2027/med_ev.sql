\i std.sql
create temp table st as
select p.game_id, p.scorecard_id, p.event_id, p.time, p.lives, lag(p.lives) over w prev_lives
from sm5_game_player_state p join std using (game_id)
window w as (partition by p.scorecard_id order by p.time, p.event_id);
create index on st(event_id);
create temp table mb as
select e.id, e.actor_scorecard_id medic, e.time,
  count(st.scorecard_id) filter (where st.scorecard_id<>e.actor_scorecard_id and st.lives>coalesce(st.prev_lives,st.lives)) recipients,
  coalesce(sum(st.lives-st.prev_lives) filter (where st.scorecard_id<>e.actor_scorecard_id and st.lives>st.prev_lives),0) lives_added
from sm5_game_event e join std using (game_id) join sm5_scorecard m on m.id=e.actor_scorecard_id and m.position=5
left join st on st.event_id=e.id
where e.event_type='0512' group by 1,2,3;
select count(*), round(avg(recipients),2), round(avg(lives_added),1) from mb;
select recipients, count(*) from mb group by 1 order by 1;
\copy mb to 'medboosts.csv' csv header
\copy (select s.id, s.end_time, g.actual_duration from sm5_scorecard s join std using (game_id) join game g on g.id=s.game_id where s.position=5) to 'medend.csv' csv header
