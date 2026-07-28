// AFOSI Gallery — behavior ported from the Claude Design prototype (Afosi Gallery.dc.html)

// ---------- Loader ----------
(function () {
  var loader = document.getElementById('af-loader');
  if (!loader) return;
  var pxs = loader.querySelectorAll('.af-px');
  var onMove = function (e) {
    var cx = e.clientX / window.innerWidth - 0.5, cy = e.clientY / window.innerHeight - 0.5;
    pxs.forEach(function (p) {
      var d = parseFloat(p.dataset.depth) || 0.1;
      p.style.transform = 'translate(' + (cx * d * 440) + 'px,' + (cy * d * 440) + 'px)';
    });
  };
  window.addEventListener('mousemove', onMove);
  var bar = document.getElementById('af-bar'), cnt = document.getElementById('af-count'), t0 = performance.now(), dur = 2100;
  (function tick(t) {
    var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3), v = Math.round(e * 100);
    if (bar) bar.style.width = v + '%';
    if (cnt) cnt.textContent = v + '%';
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
  setTimeout(function () {
    window.removeEventListener('mousemove', onMove);
    if (loader.parentNode) loader.parentNode.removeChild(loader);
  }, 3400);
})();

// ---------- Scramble / decode text effect ----------
function scrambleEl(el) {
  if (el.dataset.scrDone === '1') return;
  el.dataset.scrDone = '1';
  var nodes = [];
  var walk = function (n) {
    n.childNodes.forEach(function (c) {
      if (c.nodeType === 3 && c.textContent.trim()) nodes.push({ node: c, target: c.textContent });
      else if (c.nodeType === 1 && !c.hasAttribute('data-count')) walk(c);
    });
  };
  walk(el);
  if (!nodes.length) return;
  var lockW = el.offsetWidth, lockH = el.offsetHeight;
  el.style.width = lockW + 'px';
  el.style.height = lockH + 'px';
  el.style.overflow = 'hidden';
  var glyphs = '01<>[]{}#*+=/\\_';
  var dur = 750, t0 = performance.now();
  var tick = function (t) {
    var p = Math.min((t - t0) / dur, 1);
    nodes.forEach(function (o) {
      var n = Math.floor(p * o.target.length);
      var s = o.target.slice(0, n);
      if (p < 1) for (var i = n; i < o.target.length; i++) s += o.target[i] === ' ' ? ' ' : glyphs[(Math.random() * glyphs.length) | 0];
      o.node.textContent = p >= 1 ? o.target : s;
    });
    if (p < 1) requestAnimationFrame(tick);
    else { el.style.width = ''; el.style.height = ''; el.style.overflow = ''; }
  };
  requestAnimationFrame(tick);
}

// ---------- Scroll: progress bar + scramble on scroll ----------
(function () {
  var prog = document.getElementById('af-sprog');
  var ticking = false;
  var onScroll = function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY, ih = window.innerHeight;
      document.querySelectorAll('[data-scramble]').forEach(function (el) {
        if (el.dataset.scrDone === '1') return;
        var rs = el.getBoundingClientRect();
        if (rs.top < ih * 0.88 && rs.bottom > 0) scrambleEl(el);
      });
      if (prog) {
        var d = document.documentElement;
        prog.style.width = (Math.min(y / ((d.scrollHeight - ih) || 1), 1) * 100) + '%';
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// ---------- Reveals + counters (IntersectionObserver) ----------
(function () {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      if (e.target.hasAttribute('data-scramble')) scrambleEl(e.target);
      if (e.target.hasAttribute('data-reveal')) { e.target.classList.remove('pre'); e.target.classList.add('on'); }
      if (!e.target.hasAttribute('data-count')) return;
      var end = +e.target.dataset.count, suffix = e.target.dataset.suffix || '';
      var t0 = performance.now(), dur = 1600;
      var fmt = function (n) { return n >= 1000 ? n.toLocaleString() : String(n); };
      var tick = function (t) {
        var p = Math.min((t - t0) / dur, 1);
        var ease = 1 - Math.pow(1 - p, 4);
        e.target.textContent = fmt(Math.round(ease * end)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('[data-reveal], [data-count], [data-scramble]').forEach(function (el) {
    if (el.hasAttribute('data-reveal') && el.getBoundingClientRect().top > window.innerHeight * 0.85) el.classList.add('pre');
    io.observe(el);
  });
})();

// ---------- Category filters ----------
(function () {
  document.querySelectorAll('[data-filter-group]').forEach(function (group) {
    var btns = group.querySelectorAll('[data-filter]');
    var sel = group.dataset.filterGroup;
    var scope = (sel && document.querySelector(sel)) || group.parentElement || document;
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.dataset.filter;
        btns.forEach(function (b) {
          var on = b === btn;
          b.style.background = on ? '#F26522' : 'transparent';
          b.style.color = on ? '#141210' : '#17150F';
          b.style.borderColor = on ? '#F26522' : '#17150F';
        });
        scope.querySelectorAll('[data-cat]').forEach(function (item) {
          var show = f === 'all' || item.dataset.cat.split(',').indexOf(f) > -1;
          item.style.display = show ? '' : 'none';
        });
      });
    });
  });
})();

// ---------- Lightbox ----------
(function () {
  var boxes = document.querySelectorAll('[data-lightbox]');
  if (!boxes.length) return;
  var ov = document.createElement('div');
  ov.id = 'af-lightbox';
  ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(20,18,16,0.94);display:none;align-items:center;justify-content:center;padding:40px;cursor:zoom-out;';
  ov.innerHTML = '<img style="max-width:92vw;max-height:86vh;border:3px solid #FBF6EE;box-shadow:0 30px 80px rgba(0,0,0,0.6);"><div style="position:absolute;top:24px;right:28px;color:#FBF6EE;font-family:\'Space Grotesk\',sans-serif;font-size:34px;font-weight:700;cursor:pointer;line-height:1;">×</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function () { ov.style.display = 'none'; });
  var img = ov.querySelector('img');
  boxes.forEach(function (b) {
    b.addEventListener('click', function () {
      var src = b.getAttribute('data-lightbox') || (b.querySelector('img') && b.querySelector('img').src);
      if (src) { img.src = src; ov.style.display = 'flex'; }
    });
  });
})();

// ---------- Chatbot ----------
(function () {
  var panel = document.getElementById('af-chat-panel');
  var toggle = document.getElementById('af-chat-toggle');
  var closeBtn = document.getElementById('af-chat-close');
  var body = document.getElementById('af-chat-body');
  var input = document.getElementById('af-chat-input');
  var sendBtn = document.getElementById('af-chat-send');
  if (!panel || !toggle) return;

  function scrollChat() { body.scrollTop = body.scrollHeight; }

  function addMsg(msg) {
    var div = document.createElement('div');
    if (msg.bot) {
      div.style.cssText = 'align-self:flex-start;max-width:85%;background:#FFFFFF;border:1.5px solid #17150F;color:#17150F;padding:12px 15px;font-size:13.5px;line-height:1.55;box-shadow:3px 3px 0 rgba(23,21,15,0.12);';
    } else {
      div.style.cssText = 'align-self:flex-end;max-width:85%;background:#F26522;color:#141210;padding:12px 15px;font-size:13.5px;line-height:1.55;font-weight:600;box-shadow:3px 3px 0 rgba(23,21,15,0.18);';
    }
    div.textContent = msg.text;
    body.appendChild(div);
    scrollChat();
  }

  addMsg({ bot: true, text: "Habari! I'm the AFOSI assistant. Ask me about our programs, partnerships or how to get involved." });

  async function getAIReply(userText) {
    // ============================================================
    // WIRE YOUR OPENAI API KEY HERE. Replace the canned logic below:
    // const res = await fetch("https://api.openai.com/v1/chat/completions", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json", "Authorization": "Bearer YOUR_API_KEY" },
    //   body: JSON.stringify({ model: "gpt-4o-mini", messages: [
    //     { role: "system", content: "You are the helpful assistant of AFOSI (Action for Sustainability Initiative), a tech-driven NGO in Nairobi, Kenya." },
    //     { role: "user", content: userText } ] })
    // });
    // const data = await res.json();
    // return data.choices[0].message.content;
    // ============================================================
    await new Promise(function (r) { setTimeout(r, 700); });
    var t = userText.toLowerCase();
    if (t.includes('program')) return 'We run programs across six pillars: Health, Education, Environment, Livelihoods, Leadership and Humanitarian support. Flagships include the We Lead Project and Robotics and Creative Coding.';
    if (t.includes('partner') || t.includes('fund')) return 'We would love to work with you. You can fund a program, collaborate on delivery, or volunteer your skills. Email info@afosi.org and our team will get back to you.';
    if (t.includes('volunteer') || t.includes('join')) return 'Great! We are always looking for mentors, engineers and facilitators. Reach out at info@afosi.org with your skills and availability.';
    return 'Thanks for your message! I will be connected to a live AI soon. For now, reach us at info@afosi.org or (+254) 0115 963 306.';
  }

  function send(textArg) {
    var text = String(textArg || input.value).trim();
    if (!text) return;
    addMsg({ user: true, text: text });
    input.value = '';
    getAIReply(text).then(function (reply) { addMsg({ bot: true, text: reply }); });
  }

  toggle.addEventListener('click', function () {
    var open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'flex';
    if (!open) scrollChat();
  });
  closeBtn.addEventListener('click', function () { panel.style.display = 'none'; });
  sendBtn.addEventListener('click', function () { send(); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  document.querySelectorAll('.af-chat-prompt').forEach(function (p) {
    p.addEventListener('click', function () { send(p.dataset.msg); });
  });
})();
