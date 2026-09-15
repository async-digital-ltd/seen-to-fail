-- The official image creates POSTGRES_DB and nothing else, so the test database
-- is created here. Files in this directory run once, when the data directory is
-- first initialised, as the POSTGRES_USER, which therefore owns the result.
CREATE DATABASE seen_to_fail_test;
