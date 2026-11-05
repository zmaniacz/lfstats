\i std.sql
with i as (select i.scorecard_id, t.position tpos, i.resets from sm5_game_player_interaction i join sc s on s.id=i.scorecard_id join sm5_scorecard t on t.id=i.target_scorecard_id where s.position=3 and t.team_id<>s.team_id),
p as (select scorecard_id, sum(resets) tot, max(resets) mx from i group by 1 having sum(resets)>=10)
select round(avg(mx::float/tot)::numeric,3) avg_top_target_share, round(percentile_cont(0.9) within group (order by mx::float/tot)::numeric,3) p90_share from p;
select tpos, round(100.0*sum(resets)/sum(sum(resets)) over (),1) pct_of_scout_resets from (select t.position tpos, i.resets from sm5_game_player_interaction i join sc s on s.id=i.scorecard_id join sm5_scorecard t on t.id=i.target_scorecard_id where s.position=3 and t.team_id<>s.team_id) x group by 1 order by 1;
