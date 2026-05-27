INSERT INTO center (id, country_code, site_code, name, short_name)
VALUES
  ('685e8300-1381-4ae7-b493-debac6382655', 4,  43, 'Invasion laser Tag',    'INV'),
  ('e1e59505-f0ce-41d4-8b36-65f0ce10b7fe', 4,  19, 'Loveland Lasertag',     'LLT'),
  ('4f6b71bf-98e7-4b80-a086-bfb8a29595ec', 1,   1, 'Brisbane',              'BRI'),
  ('b52c338b-4fed-4c33-b04f-8cd3eca1ea29', 4,  23, 'Syracuse',              'SYR'),
  ('a8b3e25c-893d-416a-ae90-90a1619d7744', 3,   3, 'Auckland Wairau',       'AKL'),
  ('a7ebe2c3-714c-4629-81b0-588c760b960b', 4,   2, 'St George',             'STG'),
  ('3ae7349f-7e80-4acc-ab9f-a0c40e0c6812', 4,   3, 'Lasertag of Carmichael','LTC'),
  ('8fbd8431-8bd7-4245-b976-4948318c9864', 4,  12, 'Atlantis Laser Tag',    'ATL'),
  ('6fe49584-c7d3-4320-a896-28acdf62d347', 21, 70, 'LaserTag Darmstadt',    'LSVD'),
  ('e5d9afbe-511c-4913-8071-b362ceb74dfa', 4,   6, 'Detroit',               'DET'),
  ('7ab6b73d-4989-4925-8c75-bfaf0555eca6', 3,   7, 'Auckland Game Over',    'AKLGO'),
  ('0bfa0aa6-6263-47a5-99e8-68e239e6f9aa', 7,  10, 'Huddersfield',          'HDR'),
  ('385f9254-f2fc-4f6f-946c-26f3ae9c4f3c', 7,   2, 'Peterborough',          'PTB'),
  ('23497478-98be-4a4e-889d-a3070bc50c5a', 1,  64, 'Sydney Underworld',     'SYD'),
  ('185068ec-553b-447f-8ae8-23ad6e155713', 7,  13, 'Cheltenham',            'CHE')
ON CONFLICT (country_code, site_code) DO NOTHING;
