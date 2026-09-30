// Afosi pretest and post-test.
//
// One small file, no framework: this runs on a cheap Android phone on mobile
// data. The page it is on says which quiz and which phase through data
// attributes on <body>.
//
// Anonymous by design. The only thing kept in the phone is a random id, so a
// post-test can be paired with the same phone's pretest, plus whatever name
// the person chose to type (optional, and theirs to leave blank).

(function () {
  var API = 'https://api.afosi.org';
  var body = document.body;
  var QUIZ = body.dataset.quiz;
  var PHASE = body.dataset.phase;
  var ID_KEY = 'afosi-quiz-id';
  var NAME_KEY = 'afosi-quiz-name';

  var root = document.getElementById('app');
  var quiz = null;
  var order = [];
  var answers = [];
  var step = 0;
  var personName = '';

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* private mode: fall through, the quiz still works */ }
    return value;
  }

  function anonId() {
    var id = store(ID_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
        (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
      store(ID_KEY, id);
    }
    return id;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Options are shuffled per person, but the same way in the pretest and the
  // post-test, so the two runs look consistent to them.
  function seeded(seedText) {
    var h = 2166136261;
    for (var i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6D2B79F5;
      var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffledOrder(question, index, seed) {
    var rand = seeded(seed + ':' + index);
    var idx = question.options.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    return idx;
  }

  function show(html) { root.innerHTML = html; }

  function fail(message) {
    show('<div class="err">' + esc(message) + '</div>' +
      '<button class="btn secondary" onclick="location.reload()">Try again</button>');
  }

  // ── screens ────────────────────────────────────────────────────────────────
  function intro(state) {
    var isPre = PHASE === 'pre';
    var saved = state && state.name ? state.name : (store(NAME_KEY) || '');
    personName = saved;

    show(
      '<h1>' + esc(quiz.title) + '</h1>' +
      '<p class="muted">' + esc(quiz.intro) + '</p>' +
      '<label class="field">' +
        '<span class="lab">Your name, organisation or business (optional)</span>' +
        '<input id="who" type="text" maxlength="80" autocomplete="off" value="' + esc(saved) + '" placeholder="">' +
        '<span class="hint">Leave it blank to stay anonymous.</span>' +
      '</label>' +
      '<button class="btn" id="go">Start the ' + (isPre ? 'pretest' : 'post-test') + '</button>'
    );

    document.getElementById('go').addEventListener('click', function () {
      var field = document.getElementById('who');
      personName = (field.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (personName) store(NAME_KEY, personName);
      step = 0;
      question();
    });
  }

  function question() {
    var q = quiz.questions[step];
    var idx = order[step];
    var chosen = answers[step];

    var opts = idx.map(function (originalIndex, position) {
      var letter = 'ABCD'.charAt(position);
      var picked = chosen === originalIndex;
      return '<button class="option" type="button" data-choice="' + originalIndex + '"' +
        ' aria-pressed="' + (picked ? 'true' : 'false') + '">' +
        '<span class="pip">' + letter + '</span>' +
        '<span>' + esc(q.options[originalIndex]) + '</span></button>';
    }).join('');

    var pct = Math.round((step / quiz.questions.length) * 100);
    var last = step === quiz.questions.length - 1;

    show(
      '<div class="progress">' +
        '<div class="label">' + (step + 1) + ' of ' + quiz.questions.length + '</div>' +
        '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
      '</div>' +
      '<h2>' + esc(q.q) + '</h2>' +
      '<div class="options">' + opts + '</div>' +
      '<div class="row">' +
        (step > 0 ? '<button class="btn secondary" id="back">Back</button>' : '') +
        '<button class="btn" id="next"' + (chosen === undefined ? ' disabled' : '') + '>' +
          (last ? 'Finish' : 'Next') + '</button>' +
      '</div>'
    );

    Array.prototype.forEach.call(root.querySelectorAll('.option'), function (btn) {
      btn.addEventListener('click', function () {
        answers[step] = Number(btn.dataset.choice);
        Array.prototype.forEach.call(root.querySelectorAll('.option'), function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        document.getElementById('next').disabled = false;
      });
    });

    var back = document.getElementById('back');
    if (back) back.addEventListener('click', function () { step -= 1; question(); });

    document.getElementById('next').addEventListener('click', function () {
      if (answers[step] === undefined) return;
      if (last) submit();
      else { step += 1; question(); }
    });
  }

  function submit() {
    show('<p class="muted">Saving your answers.</p>');
    fetch(API + '/quiz/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: QUIZ,
        phase: PHASE,
        anonId: anonId(),
        name: personName,
        answers: answers,
      }),
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not save.'); return j; }); })
      .then(function (result) { done(result); })
      .catch(function (err) { fail(err.message || 'Could not save your answers.'); });
  }

  function done(result) {
    if (PHASE === 'pre') {
      show(
        '<h1>Thanks.</h1>' +
        '<div class="note"><p style="margin:0">Keep this page\'s phone handy, we will ask again at the end.</p></div>' +
        (result.alreadyAnswered ? '<p class="muted">You had already answered on this phone, so your first answers were kept.</p>' : '')
      );
      return;
    }

    var moved = '';
    if (result.previous) {
      moved = '<div class="moved">You went from ' + result.previous.score +
        ' to ' + result.score + ' out of ' + result.total + '.</div>';
    }

    var review = quiz.questions.map(function (q, i) {
      var mark = (result.marked || []).filter(function (m) { return m.questionIndex === i; })[0];
      var chosen = mark ? mark.chosenIndex : -1;
      var right = mark ? mark.correct : false;
      return '<div class="item">' +
        '<div class="tag ' + (right ? 'right' : 'wrong') + '">' + (right ? 'Correct' : 'Not quite') + '</div>' +
        '<div class="q">' + (i + 1) + '. ' + esc(q.q) + '</div>' +
        (right ? '' : '<div class="line">You chose: ' + esc(q.options[chosen] || 'nothing') + '</div>') +
        '<div class="line"><strong>Answer:</strong> ' + esc(q.options[q.answer]) + '</div>' +
        '<div class="why">' + esc(q.why) + '</div>' +
        '</div>';
    }).join('');

    show(
      '<div class="score">' +
        '<div class="big">' + result.score + ' / ' + result.total + '</div>' +
        moved +
      '</div>' +
      (result.alreadyAnswered ? '<p class="muted">You had already answered on this phone, so your first answers were kept.</p>' : '') +
      '<h2>Every question</h2>' +
      '<div class="review">' + review + '</div>'
    );
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  function start() {
    var id = anonId();

    fetch('/quiz/data/' + QUIZ + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('These questions are not ready yet. Please check back in a moment.');
        return r.json();
      })
      .then(function (data) {
        quiz = data;
        order = quiz.questions.map(function (q, i) { return shuffledOrder(q, i, id); });
        answers = new Array(quiz.questions.length);
        return fetch(API + '/quiz/api/state?quizId=' + encodeURIComponent(QUIZ) +
          '&anonId=' + encodeURIComponent(id))
          .then(function (r) { return r.ok ? r.json() : { name: null, done: {} }; })
          .catch(function () { return { name: null, done: {} }; });
      })
      .then(function (state) {
        var already = state.done && state.done[PHASE];
        if (already) {
          // Second attempt on the same phone: show what they did the first time.
          done({
            alreadyAnswered: true,
            score: already.score,
            total: already.total,
            marked: already.answers,
            previous: PHASE === 'post' && state.done.pre
              ? { score: state.done.pre.score, total: state.done.pre.total }
              : null,
          });
          return;
        }
        intro(state);
      })
      .catch(function (err) { fail(err.message || 'Could not load the questions.'); });
  }

  start();
})();
