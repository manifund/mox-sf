-- A short, faithful summary used only in digests. Tickets themselves keep the reporter's own words.
ALTER TABLE tickets ADD COLUMN digest_summary TEXT;
