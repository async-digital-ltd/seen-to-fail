ALTER TABLE checks
  ADD COLUMN key text,
  ADD CONSTRAINT checks_key_unique UNIQUE (key),
  ADD CONSTRAINT checks_key_valid CHECK (
    key IS NULL OR (length(key) <= 100 AND key COLLATE "C" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  );
