CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX sessions_token_hash_idx ON sessions (token_hash);
CREATE INDEX sessions_user_expires_at_idx ON sessions (user_id, expires_at);
