ALTER TABLE christmas_rehearsal_event
  ADD COLUMN number_limit integer NOT NULL DEFAULT 13
  CHECK (number_limit BETWEEN 1 AND 500);
