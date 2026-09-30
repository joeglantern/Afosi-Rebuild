-- Pretest and post-test storage for the Afosi talks.
--
-- These two tables are the whole schema. They are created inside the quiz
-- service's own database (afosi_quiz), owned by its own role, so this
-- migration cannot reach any other database on the server.
--
-- Deliberately NOT stored: email, phone, IP address, user agent. The only
-- identifier is anon_id, a random value the phone generates for itself, which
-- exists purely so a post-test can be paired with the same phone's pretest.
-- display_name is optional and typed by the person; it may be a personal name,
-- an organisation or nothing at all.

CREATE TABLE IF NOT EXISTS quiz_response (
  id            TEXT        PRIMARY KEY,
  quiz_id       TEXT        NOT NULL,
  phase         TEXT        NOT NULL CHECK (phase IN ('pre', 'post')),
  anon_id       TEXT        NOT NULL,
  display_name  TEXT,
  score         INTEGER     NOT NULL,
  total         INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One submission per phone per test. A second attempt reads the first row
  -- back out rather than writing another.
  CONSTRAINT quiz_response_once UNIQUE (quiz_id, phase, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_response_lookup
  ON quiz_response (quiz_id, phase);

CREATE INDEX IF NOT EXISTS idx_quiz_response_pairing
  ON quiz_response (quiz_id, anon_id);

-- One row per question answered, so per-question statistics are a GROUP BY
-- rather than JSON parsing.
CREATE TABLE IF NOT EXISTS quiz_answer (
  response_id     TEXT    NOT NULL REFERENCES quiz_response (id) ON DELETE CASCADE,
  question_index  INTEGER NOT NULL,
  chosen_index    INTEGER NOT NULL,
  correct         BOOLEAN NOT NULL,

  PRIMARY KEY (response_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_quiz_answer_question
  ON quiz_answer (question_index);
