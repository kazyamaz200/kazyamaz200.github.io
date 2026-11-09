PRAGMA foreign_keys = ON;
CREATE TABLE invitations (
  participant_id TEXT PRIMARY KEY CHECK (participant_id IN ('P01','P02','P03','P04','P05')),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE responses (
  participant_id TEXT PRIMARY KEY REFERENCES invitations(participant_id),
  body TEXT NOT NULL CHECK (json_valid(body)),
  body_hash TEXT NOT NULL CHECK (length(body_hash) = 64),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
