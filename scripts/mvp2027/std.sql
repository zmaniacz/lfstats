create temp table std as
with t as (select s.game_id, s.team_id, count(*) n, count(*) filter (where position=1) c, count(*) filter (where position=2) h, count(*) filter (where position=3) sc, count(*) filter (where position=4) a, count(*) filter (where position=5) m from sm5_scorecard s group by 1,2)
select t.game_id from t join game g on g.id=t.game_id where not g.exclude group by 1 having count(*)=2 and bool_and(n=6 and c=1 and h=1 and sc=2 and a=1 and m=1);
create temp table sc as
select s.*, (gt.result='win')::int win, g.actual_duration/60000.0 mins, g.outcome, g.competition_id is not null comp,
  s.uptime::float/nullif(s.uptime+s.resupply_downtime+s.other_downtime,0) up_frac
from sm5_scorecard s join std using (game_id) join game g on g.id=s.game_id join sm5_game_team gt on gt.id=s.team_id
where gt.result in ('win','loss');
