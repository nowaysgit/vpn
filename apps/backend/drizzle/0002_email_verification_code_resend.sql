ALTER TABLE email_verification_tokens
  ADD COLUMN IF NOT EXISTS resend_available_at timestamptz NOT NULL DEFAULT now();
