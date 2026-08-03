-- Migration shared_002: backfill signup attribution for the 13 pre-existing accounts.
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh).
-- Apply as name "shared_002_app_signups_backfill".
--
-- Requires shared_001 and the test-account cleanup (24 users -> 13) to have run first.
--
-- Rows are explicit rather than CASE-derived on purpose. Three accounts are
-- owner-attested and contradict every derivable signal: earliest-activity inference
-- placed all three in prospect-card, and the owner confirmed all three signed up
-- through FieldDay first and reached Prospect Card later. A CASE expression cannot
-- produce the right answer, so the basis string carries the reasoning per row instead.
--
-- Rule 2 (earliest activity) went 0-for-3 on multi-app accounts. It measures which app
-- someone engaged with most readily, not which door they came through. It is used
-- below ONLY for accounts with content in exactly one app.

insert into public._app_signups (user_id, app, source, basis, confidence)
select u.id, v.app, v.source, v.basis, v.confidence
from (values
  -- Owner-attested: FieldDay signup first, Prospect Card later. Overrides inference.
  ('gamundson@mac.com',                    'fieldday',      'manual',  'owner-attested: FieldDay signup first, Prospect Card later', 'certain'),
  ('greg@alfred-digital.com',              'fieldday',      'manual',  'owner-attested: FieldDay signup first, Prospect Card later', 'certain'),
  ('jherrera.online@yahoo.com',            'fieldday',      'manual',  'owner-attested: FieldDay signup first, Prospect Card later', 'certain'),

  -- Rule 1, temporal: signed up 2026-04-29, before Prospect Card had any data
  -- (2026-05-02). Only a 3-day margin, and that boundary is itself observed from one
  -- account's behaviour rather than a deployment date, so: inferred, not certain.
  -- Corroborated: greg@lev-itsb.com owns YWWM8G, the only league with recorded results.
  ('greg@lev-itsb.com',                    'fieldday',      'derived', 'predates Prospect Card first data; owns the production league', 'inferred'),
  ('jonathan@lev-itsb.com',                'fieldday',      'derived', 'predates Prospect Card first data; same domain as greg@lev-itsb.com', 'inferred'),

  -- Rule 2, earliest activity. Sound here because each of these has content in
  -- exactly ONE app. Rule 2 is not evidence for multi-app accounts.
  ('greg.amundson@gmail.com',              'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('paigehansen1979@yahoo.com',            'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('kcerc4@aol.com',                       'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('kjsanders25@aol.com',                  'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('achic107@gmail.com',                   'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('smacken20@gmail.com',                  'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('joegig77@gmail.com',                   'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),

  -- Rule 2 plus corroboration: Apple provider, and auth.sessions.user_agent carries
  -- the native 'AthleteCard/1 CFNetwork/...' string, which cannot appear by accident.
  ('n264vgksyc@privaterelay.appleid.com',  'athletecard',   'derived', 'AthleteCard profile; Apple provider; native client user-agent', 'high')
) as v(email, app, source, basis, confidence)
join auth.users u on u.email = v.email
on conflict (user_id) do nothing;
