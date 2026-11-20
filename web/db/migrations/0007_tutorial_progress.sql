-- v1.0: follow-along tutorial progress per account (which step you reached, when you finished).
CREATE TABLE IF NOT EXISTS tutorial_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutorial_id TEXT NOT NULL CHECK (tutorial_id ~ '^[A-Z][0-9]{2}$'),
  step INT NOT NULL DEFAULT 0 CHECK (step >= 0 AND step < 100),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, tutorial_id)
);
