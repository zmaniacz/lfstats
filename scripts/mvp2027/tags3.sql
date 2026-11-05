\i std.sql
create temp table t as
select e.actor_scorecard_id ammo, e.time, tg.position tpos,
  (select p.shots from sm5_game_player_state p where p.game_id=e.game_id and p.scorecard_id=e.target_scorecard_id and p.time<e.time order by p.time desc limit 1) before
from sm5_game_event e join std using (game_id)
join sm5_scorecard a on a.id=e.actor_scorecard_id and a.position=4
join sm5_scorecard tg on tg.id=e.target_scorecard_id and tg.team_id=a.team_id
where e.event_type='0500';
\copy (select ammo, time, tpos, before from t) to 'tags_raw.csv' csv header
