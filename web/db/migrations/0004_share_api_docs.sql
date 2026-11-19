-- v0.5: share links can include the project's API reference (OpenAPI docs from the Docs tab).
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS include_api_docs BOOLEAN NOT NULL DEFAULT TRUE;
