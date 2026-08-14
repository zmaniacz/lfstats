-- Record the display-band width on the rating model.
--
-- Significance-based grouping (a rule only where two players are separated by
-- more than the noise in their ratings) was tried first and collapses to a
-- single boundary on this data: across the top 25 the median gap between
-- neighbours is ~0.02 against a median standard error of ~0.13. The board now
-- uses fixed slices of the rating scale instead, which are presentational and
-- labelled as ranges rather than as tiers.
UPDATE "sm5_rating_model"
SET "parameters" = "parameters" || '{"bandWidth": 0.25}'::jsonb,
    "description" = "description" || ' Display bands are fixed 0.25-point slices of the rating scale, not statistically distinct tiers.'
WHERE "version" = '2026.08';
