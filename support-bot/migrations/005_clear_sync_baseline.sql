-- 004's baseline marked every row "written now", which hid edits people made in Airtable before the sync
-- existed (e.g. a ticket set to Won't do there). Clear it: a row whose values already match the bot does
-- nothing anyway, and every bot write sets this again, which is all the stale-read guard needs.
UPDATE tickets SET mirror_written_at = NULL;
