INSERT INTO cms_meta (key, data)
VALUES (
  'default',
  '{"version":1,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO users (id, data)
VALUES (
  'usr_1',
  '{"id":"usr_1","email":"owner@emcnotary.com","displayName":"Owner User","roles":["owner","manager"],"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","passwordHash":"0faa9f3d07c7675a1cf2706451f39cf77342a58de998420914dfc7319897d0b0"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO feature_flags (key, data)
VALUES (
  'default',
  '{"emailEnabled":true,"smsEnabled":false,"smsCampaignApproved":false,"webSoftphoneEnabled":false}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO stages (id, data) VALUES
  ('new', '{"id":"new","label":"New","sortOrder":10}'::jsonb),
  ('contacted', '{"id":"contacted","label":"Contacted","sortOrder":20}'::jsonb),
  ('follow-up', '{"id":"follow-up","label":"Follow-up","sortOrder":30}'::jsonb),
  ('qualified', '{"id":"qualified","label":"Qualified","sortOrder":40}'::jsonb),
  ('won', '{"id":"won","label":"Won","sortOrder":50}'::jsonb),
  ('closed-lost', '{"id":"closed-lost","label":"Closed Lost","sortOrder":60}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO accounts (id, data)
VALUES (
  'acc_1',
  '{"id":"acc_1","name":"Example Title Agency","industry":"Title Services","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO contacts (id, data)
VALUES (
  'con_1',
  '{"id":"con_1","accountId":"acc_1","firstName":"Jordan","lastName":"Smith","jobTitle":"Escrow Officer","stageId":"new","email":"jordan.smith@example.com","phone":"+15555550100","ownerUserId":"usr_1","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO id_counters (counter_name, value) VALUES
  ('user', 1),
  ('account', 1),
  ('contact', 1),
  ('interaction', 0),
  ('followup', 0),
  ('call', 0),
  ('callevent', 0),
  ('recording', 0),
  ('transcript', 0),
  ('message', 0),
  ('messageevent', 0),
  ('aisummary', 0),
  ('aiaction', 0),
  ('aifollowup', 0),
  ('task', 0),
  ('reminder', 0),
  ('stagehistory', 0),
  ('webhookdedupe', 0),
  ('refresh', 0),
  ('approval', 0),
  ('audit', 0),
  ('job', 0)
ON CONFLICT (counter_name) DO NOTHING;
