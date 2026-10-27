-- Mox Support Bot — initial schema (spec §3)
CREATE TABLE IF NOT EXISTS tickets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,   -- rendered MOX-042
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  routed_at         TEXT,
  claimed_at        TEXT,
  closed_at         TEXT,

  reporter_id       TEXT,
  reporter_name     TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'discord',
  contact_kind      TEXT NOT NULL DEFAULT 'discord',
  contact_value     TEXT,

  description       TEXT NOT NULL,
  location          TEXT NOT NULL,
  context           TEXT,

  kind              TEXT,
  title             TEXT,
  staff_summary     TEXT,
  category          TEXT,
  assessed_priority TEXT,
  suggested_owner   TEXT,
  owner_reasoning   TEXT,
  routed_by         TEXT,
  triage_method     TEXT,
  triage_confidence REAL,
  triage_reasoning  TEXT,
  triaged_at        TEXT,

  reported_priority TEXT,

  priority          TEXT,
  priority_source   TEXT,
  owner_key         TEXT,
  status            TEXT NOT NULL,

  visibility        TEXT NOT NULL DEFAULT 'private',
  visibility_source TEXT,
  made_public_at    TEXT,
  made_public_by    TEXT,
  mirror_channel_id TEXT,
  mirror_message_id TEXT,

  thread_id         TEXT,
  card_channel_id   TEXT,
  card_message_id   TEXT,
  mirror_record_id    TEXT,

  claimed_by        TEXT,
  closed_by         TEXT,
  resolution_note   TEXT,
  wont_do_reason    TEXT,
  duplicate_of      INTEGER REFERENCES tickets(id),
  reopen_count      INTEGER NOT NULL DEFAULT 0,

  nudged_at         TEXT,
  escalated_at      TEXT,

  -- pauses in the intake flow (§6.5, §6.6)
  dupe_offer_of     INTEGER,
  dupe_offered_at   TEXT,
  question_asked_at TEXT,
  question_resolved INTEGER NOT NULL DEFAULT 0,

  -- bookkeeping
  minutes_spent     INTEGER,
  closed_note_until TEXT,
  redirect_miss     INTEGER NOT NULL DEFAULT 0,
  reporter_told_claim TEXT
);
CREATE INDEX IF NOT EXISTS idx_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_thread ON tickets(thread_id);
CREATE INDEX IF NOT EXISTS idx_card   ON tickets(card_message_id);
CREATE INDEX IF NOT EXISTS idx_kind   ON tickets(kind, status);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  discord_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  content_type TEXT,
  mirror_file_id TEXT,
  uploaded_at TEXT
);

CREATE TABLE IF NOT EXISTS watchers (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  user_id TEXT NOT NULL,
  thread_id TEXT,
  PRIMARY KEY (ticket_id, user_id)
);

CREATE TABLE IF NOT EXISTS mirror_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  op TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_surfaces (
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
  kind       TEXT NOT NULL,      -- thread|channel|mirror
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (ticket_id, channel_id, message_id)
);

-- one row per (ticket, rule) so a nudge can never fire twice
CREATE TABLE IF NOT EXISTS nudges (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  rule TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (ticket_id, rule)
);

-- small key/value store: standing queue message id, pinned post id, ops alert timestamps
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- audit trail for overrides / reassigns (drives the digest signals)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  actor TEXT,
  before TEXT,
  after TEXT
);
