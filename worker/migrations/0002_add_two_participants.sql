-- D1 applies a migration atomically. Preserve every response column verbatim.
-- Rebuild the parent constraint after removing the child relationship temporarily.
CREATE TABLE responses_preserved AS
  SELECT participant_id, body, body_hash, consent_version, created_at FROM responses;
DROP TABLE responses;
CREATE TABLE invitations_expanded (
  participant_id TEXT PRIMARY KEY CHECK (participant_id IN ('P01','P02','P03','P04','P05','P06','P07')),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
INSERT INTO invitations_expanded (participant_id, token_hash, active)
  SELECT participant_id, token_hash, active FROM invitations;
DROP TABLE invitations;
ALTER TABLE invitations_expanded RENAME TO invitations;
CREATE TABLE responses (
  participant_id TEXT PRIMARY KEY REFERENCES invitations(participant_id),
  body TEXT NOT NULL CHECK (json_valid(body)),
  body_hash TEXT NOT NULL CHECK (length(body_hash) = 64),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO responses (participant_id, body, body_hash, consent_version, created_at)
  SELECT participant_id, body, body_hash, consent_version, created_at FROM responses_preserved;
DROP TABLE responses_preserved;
