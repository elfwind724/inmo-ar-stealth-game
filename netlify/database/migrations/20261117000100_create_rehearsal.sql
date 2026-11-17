CREATE TABLE christmas_rehearsal_event (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  phase text NOT NULL CHECK (phase IN ('closed', 'registering', 'drawing', 'finished')),
  access_digest text
);

INSERT INTO christmas_rehearsal_event (phase) VALUES ('closed');

CREATE TABLE christmas_rehearsal_teams (
  name_key text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  number integer UNIQUE CHECK (number BETWEEN 1 AND 500),
  revealed boolean NOT NULL DEFAULT false CHECK (NOT revealed OR number IS NOT NULL)
);
