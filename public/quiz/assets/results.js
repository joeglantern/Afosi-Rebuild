// Presenter results. Reads the key from the address bar and asks the API for
// the aggregate. Nothing here is visible without the key, and the quiz pages
// themselves never show anyone else's name or score.

(function () {
  var API = 'https://api.afosi.org';
  var root = document.getElementById('app');
  var key = new URLSearchParams(location.search).get('key') || '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  if (!key) {
    root.innerHTML = '<h1>Results</h1><div class="note"><p style="margin:0">' +
      'Add the presenter key to the address to open this page.</p></div>';
    return;
  }

  function bar(label, percent, cls) {
    var width = percent === null ? 0 : percent;
    return '<div class="track"><span class="k">' + label + '</span>' +
      '<span class="t"><span class="' + cls + '" style="width:' + width + '%"></span></span>' +
      '<span class="v">' + (percent === null ? '-' : percent + '%') + '</span></div>';
  }

  function render(data) {
    if (!data.quizzes.length) {
      root.innerHTML = '<h1>Results</h1><p class="muted">No questions have been published yet.</p>';
      return;
    }

    var html = '<h1>Results</h1>' +
      '<p class="muted">Refresh to update. Names appear only where someone chose to type one.</p>' +
      '<p><a class="btn secondary" style="display:inline-block;width:auto;text-decoration:none" href="' +
      API + '/quiz/api/results.csv?key=' + encodeURIComponent(key) + '">Download CSV</a></p>';

    data.quizzes.forEach(function (q) {
      var improvement = (q.pre.people && q.post.people)
        ? (q.post.average - q.pre.average).toFixed(1)
        : null;

      html += '<h2 style="margin-top:34px">' + esc(q.title) + '</h2>' +
        '<div class="cards">' +
          '<div class="card"><div class="k">Pretest</div><div class="v">' + q.pre.people + '</div></div>' +
          '<div class="card"><div class="k">Post-test</div><div class="v">' + q.post.people + '</div></div>' +
          '<div class="card"><div class="k">Avg before</div><div class="v">' + q.pre.average.toFixed(1) + '</div></div>' +
          '<div class="card"><div class="k">Avg after</div><div class="v">' + q.post.average.toFixed(1) + '</div></div>' +
        '</div>' +
        (improvement !== null
          ? '<p><strong>Change: ' + (improvement > 0 ? '+' : '') + improvement +
            ' out of ' + q.totalQuestions + '</strong></p>'
          : '');

      html += '<h2 style="font-size:19px;margin:24px 0 14px">Per question, percent correct</h2>';
      q.questions.forEach(function (item) {
        html += '<div class="qbar"><div class="qt">' + (item.index + 1) + '. ' + esc(item.q) + '</div>' +
          '<div class="pair">' +
            bar('Before', item.prePercent, 'pre') +
            bar('After', item.postPercent, 'post') +
          '</div></div>';
      });

      if (q.people.length) {
        html += '<h2 style="font-size:19px;margin:24px 0 10px">Everyone who answered</h2>' +
          '<table class="people"><thead><tr><th>Name</th><th>Test</th><th>Score</th></tr></thead><tbody>' +
          q.people.map(function (p) {
            return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.phase === 'pre' ? 'Pretest' : 'Post-test') +
              '</td><td>' + p.score + ' / ' + p.total + '</td></tr>';
          }).join('') +
          '</tbody></table>';
      }
    });

    root.innerHTML = html;
  }

  root.innerHTML = '<p class="muted">Loading the results.</p>';
  fetch(API + '/quiz/api/results?key=' + encodeURIComponent(key))
    .then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Could not load the results.');
        return j;
      });
    })
    .then(render)
    .catch(function (err) {
      root.innerHTML = '<h1>Results</h1><div class="err">' + esc(err.message) + '</div>';
    });
})();
