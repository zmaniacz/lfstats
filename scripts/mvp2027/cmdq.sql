\i std.sql
select round(avg(nukes_canceled_by_opp)::numeric,3), round(100.0*avg((nukes_canceled_by_opp>0)::int)::numeric,1) from (select s.id, m.input_value nukes_canceled_by_opp from sc s join sm5_scorecard_mvp m on m.scorecard_id=s.id and m.component='nukes_canceled_by_opponent' where s.position=1) x;
select round(avg(shots_hit_opponent_medic)::numeric,2) all_avg, round(avg(shots_hit_opponent_medic) filter (where win=1)::numeric,2) win, round(avg(shots_hit_opponent_medic) filter (where win=0)::numeric,2) loss, round(percentile_cont(0.9) within group (order by shots_hit_opponent_medic)::numeric,1) p90, max(shots_hit_opponent_medic) mx from sc where position=1;
select position, round(avg(shots_hit_opponent_medic)::numeric,2) from sc group by 1 order by 1;
