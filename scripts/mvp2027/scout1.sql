\i std.sql
select count(*), round(avg(mins)::numeric,2) avg_mins from sc where position=3;
with x as (select * from sc where position=3),
u as (
 select 'shots_fired' k, shots_fired::float v, * from x union all
 select 'accuracy', accuracy*100, * from x union all
 select 'shots_hit_opponent', shots_hit_opponent, * from x union all
 select 'shots_hit_3hit', shots_hit_opponent_3hit, * from x union all
 select 'shots_hit_medic', shots_hit_opponent_medic, * from x union all
 select 'shots_hit_team', shots_hit_team, * from x union all
 select 'deactivated_opp', deactivated_opponent, * from x union all
 select 'eliminated_opp', eliminated_opponent, * from x union all
 select 'elim_opp_medic', eliminated_opponent_medic, * from x union all
 select 'reset_opp', reset_opponent, * from x union all
 select 'assists', assists, * from x union all
 select 'times_hit', times_hit, * from x union all
 select 'times_reset', times_reset, * from x union all
 select 'times_missiled', times_hit_by_missile, * from x union all
 select 'hit_diff', hit_diff, * from x union all
 select 'uptime_pct', up_frac*100, * from x union all
 select 'lives_left', lives_left, * from x union all
 select 'eliminated', eliminated::int, * from x union all
 select 'rapid_fire', rapid_fire, * from x union all
 select 'rapid_hits_opp', shots_hit_opponent_during_rapid, * from x union all
 select 'sp_earned', sp_earned, * from x union all
 select 'score', score, * from x union all
 select 'nukes_canceled', nukes_canceled, * from x union all
 select 'resup_recv_ammo', resupplies_received_ammo, * from x union all
 select 'resup_recv_lives', resupplies_received_lives, * from x union all
 select 'targets', targets_destroyed, * from x union all
 select 'mvp', mvp_points, * from x)
select k, round(avg(v)::numeric,2) avg, round(avg(v) filter (where win=1)::numeric,2) win_avg, round(avg(v) filter (where win=0)::numeric,2) loss_avg,
 round(corr(v,win)::numeric,3) r_win, round(corr(v/mins,win)::numeric,3) r_win_permin, round(corr(v,mvp_points)::numeric,2) r_mvp
from u group by k order by abs(corr(v,win)) desc nulls last;
