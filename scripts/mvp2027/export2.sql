\i std.sql
create temp table r as select distinct on (player_id) player_id, rating from player_rating order by player_id, computed_at desc;
create temp table comp as select scorecard_id id,
  max(points) filter (where component='elimination_bonus') c_elim_bonus,
  max(input_value) filter (where component='nukes_canceled_by_opponent') nukes_canceled_by_opp,
  max(points) filter (where component='score_bonus') c_score_bonus
  from sm5_scorecard_mvp m where scorecard_id in (select id from sc) group by 1;
\copy (select sc.*, sc.eliminated::int elim, sc.comp::int is_comp, r.rating, comp.c_elim_bonus, comp.nukes_canceled_by_opp, comp.c_score_bonus from sc left join r using (player_id) left join comp using (id)) to 'full.csv' csv header
