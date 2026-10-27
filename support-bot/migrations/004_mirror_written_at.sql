-- When the bot last wrote this ticket's Airtable row. An Airtable edit counts as a person's change only if it
-- happened after this, so the bot never mistakes its own writes (or a stale read) for one.
ALTER TABLE tickets ADD COLUMN mirror_written_at TEXT;
-- Baseline (cleared again by 005: it hid edits made in Airtable before the sync existed).
UPDATE tickets SET mirror_written_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE mirror_record_id IS NOT NULL;
