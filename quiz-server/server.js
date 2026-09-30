// Pretest and post-test API for the Afosi talks.
//
// Its own pm2 process, its own port, its own Postgres database. nginx proxies
// https://api.afosi.org/quiz/* here. The quiz pages themselves are static
// files on afosi.org and call these routes cross origin.
//
// Answers are scored on the server against the same question files the pages
// read, so a phone cannot report a score for itself.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { pool, migrate, describeConnection } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const QUESTIONS_DIR = path.join(here, '..', 'public', 'quiz', 'data');

const PORT = Number(process.env.PORT || 8791);
const RESULTS_KEY = (process.env.QUIZ_RESULTS_KEY || '').trim();
const ORIGINS = (process.env.QUIZ_ORIGINS || 'https://afosi.org')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const NAME_MAX = 80;

// ── questions ────────────────────────────────────────────────────────────────
// Read fresh each time rather than cached at boot, so adding kiongozi.json and
// redeploying the static site does not need this service restarted.
function loadQuiz(quizId) {
  if (!/^[a-z0-9-]{1,40}$/.test(quizId)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, `${quizId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

function availableQuizzes() {
  try {
    return fs.readdirSync(QUESTIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

// ── app ──────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
app.use(cors({ origin: ORIGINS, methods: ['GET', 'POST'] }));

// Generous enough for a room full of people answering at once, tight enough
// that nobody can stuff the results.
app.use('/quiz/api', rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function requirePresenter(req, res) {
  if (!RESULTS_KEY) {
    res.status(503).json({ error: 'Results are not configured. Set QUIZ_RESULTS_KEY.' });
    return false;
  }
  const given = String(req.query.key || '');
  // Constant time compare so the key cannot be guessed a character at a time.
  const a = Buffer.from(given);
  const b = Buffer.from(RESULTS_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Wrong or missing key.' });
    return false;
  }
  return true;
}

app.get('/quiz/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: describeConnection(), quizzes: availableQuizzes() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// What this phone has already done, so the pages can prefill the name, pair a
// post-test with its pretest, and show an earlier result instead of a second
// attempt.
app.get('/quiz/api/state', async (req, res) => {
  const quizId = clean(req.query.quizId, 40);
  const anonId = clean(req.query.anonId, 64);
  if (!loadQuiz(quizId) || !anonId) return res.status(400).json({ error: 'Unknown quiz.' });

  try {
    const { rows } = await pool.query(
      `SELECT id, phase, display_name, score, total, created_at
         FROM quiz_response
        WHERE quiz_id = $1 AND anon_id = $2`,
      [quizId, anonId]
    );
    const byPhase = Object.fromEntries(rows.map((r) => [r.phase, r]));
    const name = byPhase.pre?.display_name || byPhase.post?.display_name || null;

    const detail = {};
    for (const phase of ['pre', 'post']) {
      const row = byPhase[phase];
      if (!row) continue;
      const answers = await pool.query(
        `SELECT question_index, chosen_index, correct
           FROM quiz_answer WHERE response_id = $1 ORDER BY question_index`,
        [row.id]
      );
      detail[phase] = {
        score: row.score,
        total: row.total,
        submittedAt: row.created_at,
        answers: answers.rows.map((a) => ({
          questionIndex: a.question_index,
          chosenIndex: a.chosen_index,
          correct: a.correct,
        })),
      };
    }
    res.json({ name, done: detail });
  } catch (err) {
    console.error('[quiz] state:', err);
    res.status(500).json({ error: 'Could not read your earlier answers.' });
  }
});

app.post('/quiz/api/submit', async (req, res) => {
  const quizId = clean(req.body?.quizId, 40);
  const phase = clean(req.body?.phase, 8);
  const anonId = clean(req.body?.anonId, 64);
  const displayName = clean(req.body?.name, NAME_MAX) || null;
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;

  const quiz = loadQuiz(quizId);
  if (!quiz) return res.status(400).json({ error: 'Unknown quiz.' });
  if (phase !== 'pre' && phase !== 'post') return res.status(400).json({ error: 'Unknown phase.' });
  if (!anonId) return res.status(400).json({ error: 'Missing id.' });
  if (!answers || answers.length !== quiz.questions.length) {
    return res.status(400).json({ error: 'Answer every question.' });
  }

  // Score here, never trust a score sent by the phone.
  const total = quiz.questions.length;
  const marked = quiz.questions.map((q, i) => {
    const chosen = Number.isInteger(answers[i]) ? answers[i] : -1;
    return {
      questionIndex: i,
      chosenIndex: chosen >= 0 && chosen < q.options.length ? chosen : -1,
      correct: chosen === q.answer,
    };
  });
  const score = marked.filter((m) => m.correct).length;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = crypto.randomUUID();
    const inserted = await client.query(
      `INSERT INTO quiz_response (id, quiz_id, phase, anon_id, display_name, score, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ON CONSTRAINT quiz_response_once DO NOTHING
       RETURNING id`,
      [id, quizId, phase, anonId, displayName, score, total]
    );

    if (!inserted.rowCount) {
      // Already answered on this phone: hand back the first attempt unchanged.
      await client.query('ROLLBACK');
      const prior = await pool.query(
        `SELECT id, score, total FROM quiz_response
          WHERE quiz_id = $1 AND phase = $2 AND anon_id = $3`,
        [quizId, phase, anonId]
      );
      const priorAnswers = await pool.query(
        `SELECT question_index, chosen_index, correct FROM quiz_answer
          WHERE response_id = $1 ORDER BY question_index`,
        [prior.rows[0].id]
      );
      return res.json({
        alreadyAnswered: true,
        score: prior.rows[0].score,
        total: prior.rows[0].total,
        marked: priorAnswers.rows.map((a) => ({
          questionIndex: a.question_index,
          chosenIndex: a.chosen_index,
          correct: a.correct,
        })),
        previous: await pairedPre(quizId, phase, anonId),
      });
    }

    for (const m of marked) {
      await client.query(
        `INSERT INTO quiz_answer (response_id, question_index, chosen_index, correct)
         VALUES ($1, $2, $3, $4)`,
        [id, m.questionIndex, m.chosenIndex, m.correct]
      );
    }
    await client.query('COMMIT');

    res.json({
      alreadyAnswered: false,
      score,
      total,
      marked,
      previous: await pairedPre(quizId, phase, anonId),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[quiz] submit:', err);
    res.status(500).json({ error: 'Could not save your answers.' });
  } finally {
    client.release();
  }
});

// For a post-test, the same phone's pretest score, so the page can say
// "you went from X to Y".
async function pairedPre(quizId, phase, anonId) {
  if (phase !== 'post') return null;
  const { rows } = await pool.query(
    `SELECT score, total FROM quiz_response
      WHERE quiz_id = $1 AND phase = 'pre' AND anon_id = $2`,
    [quizId, anonId]
  );
  return rows[0] ? { score: rows[0].score, total: rows[0].total } : null;
}

// ── presenter ────────────────────────────────────────────────────────────────
app.get('/quiz/api/results', async (req, res) => {
  if (!requirePresenter(req, res)) return;
  try {
    const out = [];
    for (const quizId of availableQuizzes()) {
      const quiz = loadQuiz(quizId);
      if (!quiz) continue;

      const totals = await pool.query(
        `SELECT phase, COUNT(*)::int AS people, COALESCE(AVG(score), 0)::float AS average
           FROM quiz_response WHERE quiz_id = $1 GROUP BY phase`,
        [quizId]
      );
      const perQuestion = await pool.query(
        `SELECT r.phase, a.question_index,
                COUNT(*)::int AS answered,
                COUNT(*) FILTER (WHERE a.correct)::int AS correct
           FROM quiz_answer a JOIN quiz_response r ON r.id = a.response_id
          WHERE r.quiz_id = $1
          GROUP BY r.phase, a.question_index
          ORDER BY a.question_index`,
        [quizId]
      );
      const people = await pool.query(
        `SELECT phase, display_name, score, total, created_at
           FROM quiz_response WHERE quiz_id = $1 ORDER BY created_at`,
        [quizId]
      );

      const stat = (phase) => totals.rows.find((t) => t.phase === phase) || { people: 0, average: 0 };
      out.push({
        quizId,
        title: quiz.title,
        totalQuestions: quiz.questions.length,
        pre: stat('pre'),
        post: stat('post'),
        questions: quiz.questions.map((q, i) => {
          const pick = (phase) => perQuestion.rows.find((r) => r.phase === phase && r.question_index === i);
          const pct = (r) => (r && r.answered ? Math.round((r.correct / r.answered) * 100) : null);
          return { index: i, q: q.q, prePercent: pct(pick('pre')), postPercent: pct(pick('post')) };
        }),
        people: people.rows.map((p) => ({
          phase: p.phase,
          name: p.display_name || 'Anonymous',
          score: p.score,
          total: p.total,
          at: p.created_at,
        })),
      });
    }
    res.json({ quizzes: out });
  } catch (err) {
    console.error('[quiz] results:', err);
    res.status(500).json({ error: 'Could not build the results.' });
  }
});

app.get('/quiz/api/results.csv', async (req, res) => {
  if (!requirePresenter(req, res)) return;
  try {
    const { rows } = await pool.query(
      `SELECT r.quiz_id, r.phase, COALESCE(r.display_name, 'Anonymous') AS name,
              r.anon_id, r.score, r.total, r.created_at,
              a.question_index, a.chosen_index, a.correct
         FROM quiz_response r
         LEFT JOIN quiz_answer a ON a.response_id = r.id
        ORDER BY r.quiz_id, r.phase, r.created_at, a.question_index`
    );
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'quiz,phase,name,anon_id,score,total,submitted_at,question,chosen_option,correct';
    const lines = rows.map((r) => [
      r.quiz_id, r.phase, r.name, r.anon_id, r.score, r.total,
      new Date(r.created_at).toISOString(),
      r.question_index === null ? '' : r.question_index + 1,
      r.chosen_index === null ? '' : r.chosen_index + 1,
      r.correct === null ? '' : (r.correct ? 'yes' : 'no'),
    ].map(esc).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="afosi-quiz-results.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) {
    console.error('[quiz] csv:', err);
    res.status(500).send('Could not build the export.');
  }
});

// ── boot ─────────────────────────────────────────────────────────────────────
migrate()
  .then(() => {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`[quiz] listening on 127.0.0.1:${PORT}`);
      console.log(`[quiz] database: ${describeConnection()}`);
      console.log(`[quiz] quizzes: ${availableQuizzes().join(', ') || 'none found yet'}`);
      if (!RESULTS_KEY) console.warn('[quiz] QUIZ_RESULTS_KEY is empty, the results page will refuse to open');
    });
  })
  .catch((err) => {
    console.error('[quiz] could not start:', err.message);
    process.exit(1);
  });
