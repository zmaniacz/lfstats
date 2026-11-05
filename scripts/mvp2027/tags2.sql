\i std.sql
create temp table t as
select e.actor_scorecard_id ammo, e.time, tg.position tpos,
  (select p.shots from sm5_game_player_state p where p.game_id=e.game_id and p.scorecard_id=e.target_scorecard_id and p.time<e.time order by p.time desc limit 1) before
from sm5_game_event e join std using (game_id)
join sm5_scorecard a on a.id=e.actor_scorecard_id and a.position=4
join sm5_scorecard tg on tg.id=e.target_scorecard_id and tg.team_id=a.team_id
where e.event_type='0500';
select tpos, count(*), round(avg(before),1) avg_before,
 round(100.0*avg((before >= case tpos when 2 then 40 when 5 then 30 else 60 end)::int),1) pct_full,
 round(100.0*avg((before <= case tpos when 3 then 10 else 5 end)::int),1) pct_low
from t group by 1 order by 1;
\copy (select ammo, count(*) tags, sum((before <= case tpos when 3 then 50 when 2 then 35 when 5 then 25 else 55 end)::int) useful, sum((before <= case tpos when 3 then 10 else 5 end)::int) low_tags, sum((before >= case tpos when 2 then 40 when 5 then 30 else 60 end)::int) full_tags from t group by 1) to 'tags2.csv' csv header
