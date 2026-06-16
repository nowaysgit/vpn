CREATE TYPE user_role AS ENUM ('owner', 'admin', 'support', 'customer');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'traffic_over_limit', 'grace', 'expired', 'blocked');
CREATE TYPE device_status AS ENUM ('active', 'revoked', 'pending_replacement');
CREATE TYPE payment_provider AS ENUM ('platega', 'rollypay', 'manual');
CREATE TYPE payment_status AS ENUM ('created', 'pending', 'paid', 'failed', 'cancelled', 'refunded');
CREATE TYPE vpn_protocol AS ENUM ('vless-reality', 'trojan-tls', 'shadowsocks', 'external-manual');

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  role user_role NOT NULL DEFAULT 'customer',
  blocked boolean NOT NULL DEFAULT false,
  notes text,
  subscription_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users (email);
CREATE UNIQUE INDEX users_subscription_token_idx ON users (subscription_token);

CREATE TABLE email_verification_tokens (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE plans (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  price_rub integer NOT NULL,
  duration_days integer NOT NULL,
  traffic_limit_gb integer NOT NULL,
  device_limit integer NOT NULL DEFAULT 4
);

CREATE TABLE subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  plan_id text NOT NULL REFERENCES plans(id),
  status subscription_status NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  grace_ends_at timestamptz NOT NULL,
  traffic_used_bytes bigint NOT NULL DEFAULT 0,
  traffic_limit_bytes bigint NOT NULL,
  granted_by_admin_id text REFERENCES users(id)
);

CREATE TABLE devices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  label text NOT NULL,
  status device_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE device_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  device_id text NOT NULL REFERENCES devices(id),
  encrypted_payload text NOT NULL,
  server_id text NOT NULL,
  protocols vpn_protocol[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE credential_server_history (
  id text PRIMARY KEY,
  credential_id text NOT NULL REFERENCES device_credentials(id),
  server_id text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  plan_id text NOT NULL REFERENCES plans(id),
  provider payment_provider NOT NULL,
  provider_payment_id text NOT NULL,
  status payment_status NOT NULL,
  amount_rub integer NOT NULL,
  checkout_url text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE UNIQUE INDEX payments_provider_payment_idx ON payments (provider, provider_payment_id);
CREATE UNIQUE INDEX payments_idempotency_idx ON payments (user_id, idempotency_key);

CREATE TABLE payment_events (
  id text PRIMARY KEY,
  payment_id text NOT NULL REFERENCES payments(id),
  provider payment_provider NOT NULL,
  provider_event_id text NOT NULL,
  status payment_status NOT NULL,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_events_provider_event_idx ON payment_events (provider, provider_event_id);

CREATE TABLE vpn_nodes (
  id text PRIMARY KEY,
  name text NOT NULL,
  location_code text NOT NULL,
  provider text NOT NULL,
  public_host text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE usage_snapshots (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  device_id text NOT NULL REFERENCES devices(id),
  traffic_used_bytes bigint NOT NULL,
  active_connections integer NOT NULL,
  sampled_at timestamptz NOT NULL
);

CREATE TABLE admin_action_logs (
  id text PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_accounts (
  telegram_user_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  username text,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE telegram_link_tokens (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE support_tickets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
