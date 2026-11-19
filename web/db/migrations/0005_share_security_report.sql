-- v0.6: share links can include the security assessment report. Off by default: findings are sensitive.
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS include_report BOOLEAN NOT NULL DEFAULT FALSE;
