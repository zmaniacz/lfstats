\timing on
\i std.sql
create temp table st as
select p.game_id, p.scorecard_id, p.event_id, p.time, p.shots, p.lives, p.state, p.is_eliminated,
  lag(p.shots) over w prev_shots, lag(p.lives) over w prev_lives, lead(p.time) over w next_time
from sm5_game_player_state p join std using (game_id)
window w as (partition by p.scorecard_id order by p.time, p.event_id);
create index on st(event_id);
create temp table ev as select e.id, e.game_id, e.time, e.event_type, e.actor_scorecard_id, e.target_scorecard_id from sm5_game_event e join std using (game_id) where e.event_type in ('0500','0510','0502','0512');
create index on ev(id);
analyze st; analyze ev;
-- resupply tags by ammo
create temp table tags as
select ev.actor_scorecard_id ammo, ev.game_id, ev.time, t.position tpos, st.prev_shots, st.shots, st.shots-st.prev_shots added
from ev join sm5_scorecard a on a.id=ev.actor_scorecard_id and a.position=4
join sm5_scorecard t on t.id=ev.target_scorecard_id and t.team_id=a.team_id
join st on st.event_id=ev.id and st.scorecard_id=ev.target_scorecard_id
where ev.event_type='0500';
select tpos, count(*), round(avg(added),1) avg_added, round(avg(prev_shots),1) avg_before, percentile_cont(0.5) within group (order by added) med_added, round(100.0*avg((added<=0)::int),1) pct_zero from tags group by 1 order by 1;
-- boosts
create temp table boosts as
select ev.id, ev.actor_scorecard_id ammo, ev.game_id, ev.time,
  count(st.scorecard_id) filter (where st.scorecard_id<>ev.actor_scorecard_id and st.shots>coalesce(st.prev_shots,st.shots)) recipients,
  coalesce(sum(st.shots-st.prev_shots) filter (where st.scorecard_id<>ev.actor_scorecard_id and st.shots>st.prev_shots),0) shots_added
from ev join sm5_scorecard a on a.id=ev.actor_scorecard_id and a.position=4
left join st on st.event_id=ev.id
where ev.event_type='0510' group by 1,2,3,4;
select count(*) boosts, round(avg(recipients),2) avg_recip, round(avg(shots_added),1) avg_shots, round(100.0*avg((recipients=0)::int),1) pct_zero_recip from boosts;
select recipients, count(*) from boosts group by 1 order by 1;
\copy tags to 'tags.csv' csv header
\copy boosts to 'boosts.csv' csv header
-- teammate dry time: shots=0, alive, per team (excluding ammo itself)
create temp table dry as
select s.team_id, sum(case when st.shots=0 and not st.is_eliminated then coalesce(st.next_time,(g.actual_duration))-st.time else 0 end) dry_ms,
  sum(case when st.shots<=5 and not st.is_eliminated then coalesce(st.next_time,(g.actual_duration))-st.time else 0 end) low_ms
from st join sm5_scorecard s on s.id=st.scorecard_id join game g on g.id=st.game_id where s.position<>4 group by 1;
\copy dry to 'dry.csv' csv header
