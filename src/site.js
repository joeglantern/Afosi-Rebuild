// AFOSI site — shared shell (loader, nav, chatbot, footer) + behaviors,
// ported from the Claude Design prototypes.

// ---------------------------------------------------------------------------
// Shell markup
// ---------------------------------------------------------------------------
const NAV_LINKS = [
  ['home', 'Home', '/'],
  ['about', 'About', '/about.html'],
  ['projects', 'Projects', '/projects.html'],
  ['platforms', 'Platforms', '/platforms.html'],
  ['team', 'Team', '/team.html'],
  ['news', 'News', '/news.html'],
  ['gallery', 'Gallery', '/gallery.html'],
  ['opportunities', 'Opportunities', '/opportunities.html'],
  ['contact', 'Contact', '/contact.html'],
];

const LOADER_HTML = `
  <div id="af-loader" style="position:fixed;inset:0;z-index:100;background:#FBF6EE;overflow:hidden;display:flex;align-items:center;justify-content:center;animation:loaderHide 0.7s 2.7s cubic-bezier(.6,0,.2,1) forwards;">
    <div style="position:absolute;inset:-40px;background-image:radial-gradient(circle, rgba(23,21,15,0.07) 1.3px, transparent 1.6px);background-size:26px 26px;animation:afDrift 7s linear infinite;"></div>
    <div style="position:absolute;width:520px;height:520px;border:1.5px dashed rgba(23,21,15,0.18);border-radius:50%;animation:mgSpin 26s linear infinite;"></div>
    <div class="af-px" data-depth="0.14" style="position:absolute;top:18%;left:16%;will-change:transform;"><div style="width:84px;height:84px;border:3px solid #F26522;border-radius:50%;animation:ldFloat 6s ease-in-out infinite;"></div></div>
    <div class="af-px" data-depth="0.24" style="position:absolute;top:22%;right:16%;will-change:transform;"><div style="width:22px;height:22px;background:#17150F;transform:rotate(45deg);animation:ldFloat 7s ease-in-out infinite;"></div></div>
    <div class="af-px" data-depth="0.18" style="position:absolute;bottom:20%;left:21%;will-change:transform;"><div style="width:15px;height:15px;border-radius:50%;background:#F26522;animation:ldFloat 5.5s ease-in-out infinite reverse;"></div></div>
    <div style="position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;gap:36px;">
      <div style="position:relative;width:360px;height:170px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;left:50%;top:50%;width:82px;height:82px;margin:-41px 0 0 -70px;border-radius:50%;background:#17150F;animation:ldMergeL 1.15s 0.05s cubic-bezier(.3,.7,.2,1) both;"></div>
        <div style="position:absolute;left:50%;top:50%;width:110px;height:110px;margin:-55px 0 0 -32px;border-radius:50%;background:#F26522;animation:ldMergeR 1.15s 0.05s cubic-bezier(.3,.7,.2,1) both;"></div>
        <img src="/assets/afosi/afosi_logo.png" alt="AFOSI" style="position:relative;width:300px;height:auto;display:block;animation:ldWipe 0.9s 0.95s cubic-bezier(.7,0,.2,1) both;">
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:15px;animation:mgUp 0.7s 1.25s ease both;">
        <div style="width:230px;height:3px;background:rgba(23,21,15,0.14);overflow:hidden;"><div id="af-bar" style="height:100%;width:0%;background:#F26522;transition:width 0.1s linear;"></div></div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#8A4B2C;">A sustainable world</span>
          <span id="af-count" style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#17150F;min-width:40px;">0%</span>
        </div>
      </div>
    </div>
  </div>`;

function headerHTML(active) {
  const links = NAV_LINKS.map(([key, label, href]) =>
    `<a href="${href}" style="color:${key === active ? '#F26522' : '#17150F'};">${label}</a>`
  ).join('\n        ');
  return `
  <header style="position:sticky;top:0;z-index:50;background:rgba(251,246,238,0.9);backdrop-filter:blur(12px);border-bottom:1px solid rgba(23,21,15,0.12);">
    <div style="height:4px;background:rgba(242,101,34,0.16);"><div id="af-sprog" style="height:100%;width:0%;background:#F26522;"></div></div>
    <nav data-section style="max-width:1320px;margin:0 auto;padding:14px 40px;display:flex;align-items:center;justify-content:space-between;gap:32px;">
      <a href="/"><img src="/assets/afosi/afosi_logo.png" alt="AFOSI" style="height:46px;width:auto;display:block;"></a>
      <div data-nav-links style="display:flex;align-items:center;gap:19px;font-size:14px;font-weight:600;">
        ${links}
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        <a href="/contact.html" class="hov-cta af-nav-cta" style="background:#17150F;color:#FBF6EE;padding:11px 20px;font-size:14px;font-weight:700;white-space:nowrap;">Get involved</a>
        <button id="af-burger" class="af-burger" aria-label="Open menu" style="cursor:pointer;background:transparent;border:2px solid #17150F;color:#17150F;width:46px;height:46px;display:none;align-items:center;justify-content:center;padding:0;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </nav>
  </header>`;
}

function mobileMenuHTML(active) {
  const links = NAV_LINKS.map(([key, label, href]) =>
    `<a href="${href}" style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:600;line-height:1.3;color:${key === active ? '#F26522' : '#FBF6EE'};">${label}</a>`
  ).join('\n      ');
  return `
  <div id="af-mobile-menu" style="position:fixed;inset:0;z-index:95;background:#17150F;display:none;flex-direction:column;padding:28px 32px 40px;overflow-y:auto;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
      <img src="/assets/afosi/afosi_logo_white.png" alt="AFOSI" style="height:44px;width:auto;display:block;">
      <button id="af-menu-close" aria-label="Close menu" style="cursor:pointer;background:transparent;border:2px solid #FBF6EE;color:#FBF6EE;width:46px;height:46px;display:flex;align-items:center;justify-content:center;padding:0;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      ${links}
    </div>
    <a href="/contact.html" style="margin-top:36px;align-self:flex-start;background:#F26522;color:#141210;padding:16px 32px;font-size:16px;font-weight:700;">Get involved</a>
  </div>`;
}

const BULB_ICON = `<svg width="19" height="19" viewBox="0 0 64 64" fill="none" stroke="currentColor"><path d="M32 6C21 6 13 14 13 24c0 6.5 3.6 10.4 6.4 13.6 1.7 2 3.1 3.6 3.1 6.4h19c0-2.8 1.4-4.4 3.1-6.4C47.4 34.4 51 30.5 51 24 51 14 43 6 32 6z" stroke-width="5" stroke-linejoin="round"/><path d="M26 44c-1-7-4-9-4-13a10 10 0 0 1 20 0c0 4-3 6-4 13" stroke="#F26522" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 50h14M28 55h8" stroke-width="5" stroke-linecap="round"/></svg>`;

const CHAT_HTML = `
  <div id="af-chat-dock" style="position:fixed;right:24px;bottom:24px;z-index:90;display:flex;flex-direction:column;align-items:flex-end;gap:16px;font-family:'Space Mono',monospace;">
    <div id="af-chat-panel" style="display:none;width:404px;max-width:calc(100vw - 40px);height:min(582px, calc(100vh - 130px));background:#141210;border:2px solid #17150F;box-shadow:8px 8px 0 #F26522;flex-direction:column;overflow:hidden;">
      <div style="padding:12px 14px;background:#0F0D0B;border-bottom:1px solid #35302E;display:flex;align-items:center;gap:11px;flex-shrink:0;">
        <div style="display:flex;gap:6px;">
          <span style="width:11px;height:11px;background:#F26522;border:1px solid #000;"></span>
          <span style="width:11px;height:11px;background:#C9922E;border:1px solid #000;"></span>
          <span style="width:11px;height:11px;background:#2E7D32;border:1px solid #000;"></span>
        </div>
        <div style="flex:1;text-align:center;font-size:12px;letter-spacing:0.06em;color:#8A8175;">afosi://assistant</div>
        <div id="af-chat-close" class="hov-chatclose" style="cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:#8A8175;font-size:14px;">✕</div>
      </div>
      <div id="af-chat-body" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:13px;font-size:13px;line-height:1.6;color:#E8E2D6;background-image:linear-gradient(rgba(242,101,34,0.03) 1px,transparent 1px);background-size:100% 3px;"></div>
      <div style="padding:0 14px 9px;display:flex;gap:7px;flex-wrap:wrap;flex-shrink:0;">
        <div class="hov-prompt af-chat-prompt" data-msg="Tell me about your programs" style="cursor:pointer;background:#221F19;border:1px solid #3A342E;color:#C9C2B6;font-size:11px;padding:6px 10px;">./programs</div>
        <div class="hov-prompt af-chat-prompt" data-msg="What opportunities are open right now?" style="cursor:pointer;background:#221F19;border:1px solid #3A342E;color:#C9C2B6;font-size:11px;padding:6px 10px;">./opportunities</div>
        <div class="hov-prompt af-chat-prompt" data-msg="How can I partner with or support AFOSI?" style="cursor:pointer;background:#221F19;border:1px solid #3A342E;color:#C9C2B6;font-size:11px;padding:6px 10px;">./partner</div>
      </div>
      <div style="margin:0 14px 14px;display:flex;align-items:center;gap:9px;background:#0F0D0B;border:1.5px solid #3A342E;padding:11px 13px;flex-shrink:0;">
        <span style="color:#F26522;font-size:13px;white-space:nowrap;">afosi:~$</span>
        <input id="af-chat-input" placeholder="type a question..." autocomplete="off" style="flex:1;background:transparent;border:none;color:#E8E2D6;font-family:'Space Mono',monospace;font-size:13px;outline:none;min-width:0;">
        <div id="af-chat-send" class="hov-send" style="cursor:pointer;color:#F26522;font-size:16px;line-height:1;">↵</div>
      </div>
    </div>
    <div id="af-chat-toggle" class="hov-launch" style="cursor:pointer;display:flex;align-items:center;gap:10px;background:#141210;color:#FBF6EE;padding:14px 20px;border:2px solid #17150F;box-shadow:5px 5px 0 #F26522;font-family:'Space Mono',monospace;">
      <span style="color:#F26522;font-weight:700;font-size:15px;">&gt;_</span>
      <span style="font-weight:700;font-size:13.5px;letter-spacing:0.04em;">Ask AFOSI</span>
    </div>
  </div>`;

const FOOTER_HTML = `
  <footer style="background:#141210;color:#F2EDE4;font-family:'Manrope',system-ui,sans-serif;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-120px;right:-80px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(242,101,34,0.16),transparent 68%);pointer-events:none;"></div>
    <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(242,101,34,0.09) 1.4px,transparent 1.6px);background-size:22px 22px;opacity:0.5;pointer-events:none;"></div>
    <div style="position:relative;max-width:1320px;margin:0 auto;padding:80px 40px 40px;">
      <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1.2fr;gap:48px;">
        <div>
          <img src="/assets/afosi/afosi_logo_white.png" alt="AFOSI, Action for Sustainability Initiative" style="height:70px;width:auto;display:block;margin-bottom:22px;">
          <p style="font-size:15px;line-height:1.7;color:#B8B1A5;max-width:320px;margin:0 0 24px;">A lean, technology-backed NGO turning grassroots trust into measurable impact across health, education, climate and livelihoods in Kenya.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a href="https://www.facebook.com/share/19aj6y3Pyx/" target="_blank" rel="noopener" aria-label="Facebook" class="hov-social" style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:#221F19;border:1px solid #35302699;color:#F2EDE4;border-radius:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.5-1.5h1.6V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v2.2H7.9V13h2.3v8h3.3z"/></svg></a>
            <a href="https://www.instagram.com/afosi_ke" target="_blank" rel="noopener" aria-label="Instagram" class="hov-social" style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:#221F19;border:1px solid #35302699;color:#F2EDE4;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>
            <a href="https://www.linkedin.com/company/action-for-sustainability-initiative/" target="_blank" rel="noopener" aria-label="LinkedIn" class="hov-social" style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:#221F19;border:1px solid #35302699;color:#F2EDE4;"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.94 5a1.94 1.94 0 1 1-3.88 0 1.94 1.94 0 0 1 3.88 0zM3.4 8.5h3.1V21H3.4V8.5zM9.1 8.5h3v1.7h.05c.42-.8 1.45-1.65 3-1.65 3.2 0 3.8 2.1 3.8 4.9V21h-3.1v-5c0-1.2 0-2.7-1.65-2.7s-1.9 1.3-1.9 2.6V21h-3.1V8.5z"/></svg></a>
            <a href="https://www.tiktok.com/@afosi77" target="_blank" rel="noopener" aria-label="TikTok" class="hov-social" style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:#221F19;border:1px solid #35302699;color:#F2EDE4;"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg></a>
          </div>
        </div>
        <div>
          <h4 style="font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#F26522;margin:0 0 20px;">Explore</h4>
          <div style="display:flex;flex-direction:column;gap:13px;font-size:15px;">
            <a href="/about.html" style="color:#C9C2B6;">About Us</a>
            <a href="/projects.html" style="color:#C9C2B6;">Projects</a>
            <a href="/team.html" style="color:#C9C2B6;">Our Team</a>
            <a href="/news.html" style="color:#C9C2B6;">News</a>
            <a href="/gallery.html" style="color:#C9C2B6;">Gallery</a>
            <a href="/opportunities.html" style="color:#C9C2B6;">Opportunities</a>
            <a href="/partners.html" style="color:#C9C2B6;">Partners</a>
          </div>
        </div>
        <div>
          <h4 style="font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#F26522;margin:0 0 20px;">Digital Tools</h4>
          <div style="display:flex;flex-direction:column;gap:13px;font-size:15px;">
            <a href="https://www.kenyayouthclimatehub.org/" target="_blank" rel="noopener" style="color:#C9C2B6;">Kenya Youth Climate Hub</a>
            <a href="https://afosihub.com/" target="_blank" rel="noopener" style="color:#C9C2B6;">Afosi Hub</a>
            <a href="https://kiongozi.org/" target="_blank" rel="noopener" style="color:#C9C2B6;">Kiongozi ya Vijana</a>
            <a href="/platforms.html" style="color:#C9C2B6;">All platforms</a>
          </div>
        </div>
        <div>
          <h4 style="font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#F26522;margin:0 0 20px;">Get in touch</h4>
          <div style="display:flex;flex-direction:column;gap:14px;font-size:15px;color:#C9C2B6;line-height:1.5;">
            <span>Manga Hse, Kiambere RD<br>Upper Hill, Nairobi, Kenya</span>
            <a href="tel:+254115963306" style="color:#C9C2B6;">(+254) 0115 963 306</a>
            <a href="mailto:info@afosi.org" style="color:#C9C2B6;">info@afosi.org</a>
            <a href="/contact.html" class="hov-cream" style="align-self:flex-start;margin-top:6px;background:#F26522;color:#141210;padding:12px 22px;font-weight:700;font-size:14px;">Partner with us →</a>
          </div>
        </div>
      </div>
      <div style="margin-top:56px;padding-top:26px;border-top:1px solid #2C2820;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;">
        <span style="font-size:13.5px;color:#8B857A;">© 2026 Action for Sustainability Initiative (AFOSI). All rights reserved.</span>
        <span style="font-family:'Space Grotesk',sans-serif;font-size:12.5px;letter-spacing:0.14em;text-transform:uppercase;color:#8B857A;">A Sustainable World.</span>
      </div>
    </div>
  </footer>`;

// Inject shell into the page wrapper (#af-page)
(function injectShell() {
  const page = document.getElementById('af-page');
  if (!page) return;
  const active = document.body.dataset.page || '';
  // Loader only on the homepage, once per browser session — not on page-to-page navigation.
  let showLoader = false;
  try {
    showLoader = active === 'home' && !sessionStorage.getItem('afLoaderShown');
    if (showLoader) sessionStorage.setItem('afLoaderShown', '1');
  } catch (e) { showLoader = active === 'home'; }
  page.insertAdjacentHTML('afterbegin', (showLoader ? LOADER_HTML : '') + headerHTML(active));
  page.insertAdjacentHTML('beforeend', mobileMenuHTML(active) + CHAT_HTML + FOOTER_HTML);
})();

// ---------------------------------------------------------------------------
// Mobile menu
// ---------------------------------------------------------------------------
(function () {
  var burger = document.getElementById('af-burger');
  var menu = document.getElementById('af-mobile-menu');
  var close = document.getElementById('af-menu-close');
  if (!burger || !menu) return;
  burger.addEventListener('click', function () { menu.style.display = 'flex'; document.body.style.overflow = 'hidden'; });
  var hide = function () { menu.style.display = 'none'; document.body.style.overflow = ''; };
  if (close) close.addEventListener('click', hide);
  menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', hide); });
})();

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Scramble / decode text effect
// ---------------------------------------------------------------------------
const GLYPHS = '01<>[]{}#*+=/\\_';

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
  var dur = 750, t0 = performance.now();
  var tick = function (t) {
    var p = Math.min((t - t0) / dur, 1);
    nodes.forEach(function (o) {
      var n = Math.floor(p * o.target.length);
      var s = o.target.slice(0, n);
      if (p < 1) for (var i = n; i < o.target.length; i++) s += o.target[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      o.node.textContent = p >= 1 ? o.target : s;
    });
    if (p < 1) requestAnimationFrame(tick);
    else { el.style.width = ''; el.style.height = ''; el.style.overflow = ''; }
  };
  requestAnimationFrame(tick);
}

function scrambleWord(el, word) {
  var dur = 620, t0 = performance.now();
  var tick = function (t) {
    if (!el.isConnected) return;
    var p = Math.min((t - t0) / dur, 1);
    var n = Math.floor(p * word.length);
    var s = word.slice(0, n);
    if (p < 1) for (var i = n; i < word.length; i++) s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = p >= 1 ? word : s;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Scroll-driven effects: progress bar, hero fade, parallax, video, code typing
// ---------------------------------------------------------------------------
(function () {
  var prog = document.getElementById('af-sprog');
  var hero = document.getElementById('af-heroText');
  var vid = document.getElementById('af-vidwrap');
  var codeEl = document.getElementById('af-codetrack');
  var codeStat = document.getElementById('af-codestat');
  var codeLines = Array.prototype.slice.call(document.querySelectorAll('[data-cl]'));
  var plx = Array.prototype.slice.call(document.querySelectorAll('[data-plx]'));
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
      if (hero) {
        var f = Math.min(Math.max(y / 750, 0), 1);
        hero.style.opacity = String(1 - f * 0.55);
        hero.style.transform = 'translateY(' + (y * 0.08).toFixed(1) + 'px)';
      }
      for (var i = 0; i < plx.length; i++) {
        var el = plx[i], r = el.getBoundingClientRect(), sp = parseFloat(el.dataset.plx) || 0.05;
        el.style.transform = 'translateY(' + ((r.top + r.height / 2 - ih / 2) * -sp).toFixed(1) + 'px)';
      }
      if (vid) {
        var r2 = vid.getBoundingClientRect();
        var pr = Math.min(Math.max(1 - (r2.top - ih * 0.12) / (ih * 0.72), 0), 1);
        vid.style.transform = 'scale(' + (0.88 + 0.12 * pr).toFixed(3) + ')';
        vid.style.opacity = String(0.45 + 0.55 * pr);
      }
      if (codeEl && codeLines.length) {
        var r3 = codeEl.getBoundingClientRect();
        var track = r3.height - ih;
        var pc = track > 0 ? Math.min(Math.max(-r3.top / track, 0), 1) : 1;
        var total = codeLines.length, done = 0;
        for (var j = 0; j < total; j++) {
          var lp = Math.min(Math.max(pc * (total + 1.5) - j, 0), 1);
          if (lp >= 1) done++;
          var cs = codeLines[j].querySelector('[data-code]');
          var gs = codeLines[j].querySelector('[data-g]');
          if (cs) cs.style.clipPath = 'inset(-10% ' + ((1 - lp) * 100).toFixed(1) + '% -10% 0)';
          if (gs) gs.style.opacity = lp > 0 ? '1' : '0.35';
        }
        if (codeStat) codeStat.textContent = pc <= 0.02 ? '▸ ready' : (done < total ? '▸ typing impact.js · line ' + Math.min(done + 1, total) + '/' + total : '▸ impact.js complete · exit code 0');
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// ---------------------------------------------------------------------------
// Reveals + count-up stats (IntersectionObserver)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Hero rotating word (Home)
// ---------------------------------------------------------------------------
(function () {
  var slot = document.getElementById('af-heroWord');
  if (!slot) return;
  var words = [['sustainable', '#F26522'], ['healthier', '#8A4B2C'], ['greener', '#2E7D32'], ['fairer', '#F26522']];
  var w = 0;
  var show = function () {
    var pair = words[w % words.length];
    slot.style.color = pair[1];
    scrambleWord(slot, pair[0]);
  };
  show();
  setInterval(function () { w++; show(); }, 2600);
})();

// ---------------------------------------------------------------------------
// Interactive light-bulb CTA
// ---------------------------------------------------------------------------
(function () {
  document.querySelectorAll('.af-bulb').forEach(function (section) {
    var on = false;
    var glow = section.querySelector('[data-bulb-glow]');
    var halo = section.querySelector('[data-bulb-halo]');
    var cord = section.querySelector('[data-bulb-cord]');
    var body = section.querySelector('[data-bulb-body]');
    var filament = section.querySelector('[data-bulb-filament]');
    var base = section.querySelector('[data-bulb-base]');
    var hint = section.querySelector('[data-bulb-hint]');
    var content = section.querySelector('[data-bulb-content]');
    var toggle = section.querySelector('[data-bulb-toggle]');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      on = !on;
      if (glow) glow.style.opacity = on ? '1' : '0';
      if (halo) halo.style.opacity = on ? '1' : '0';
      if (cord) cord.style.background = on ? '#141210' : '#35302E';
      if (body) { body.setAttribute('fill', on ? '#FBF6EE' : 'none'); body.setAttribute('stroke', on ? '#141210' : '#F2EDE4'); }
      if (filament) filament.setAttribute('stroke', on ? '#F26522' : '#948D82');
      if (base) base.setAttribute('stroke', on ? '#141210' : '#F2EDE4');
      if (hint) { hint.style.color = on ? '#141210' : '#948D82'; hint.textContent = on ? 'lights on' : 'flip the light'; }
      if (content) content.style.color = on ? '#141210' : '#F2EDE4';
    });
  });
})();

// ---------------------------------------------------------------------------
// Category filters
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Chatbot
// ---------------------------------------------------------------------------
(function () {
  var panel = document.getElementById('af-chat-panel');
  var toggle = document.getElementById('af-chat-toggle');
  var closeBtn = document.getElementById('af-chat-close');
  var body = document.getElementById('af-chat-body');
  var input = document.getElementById('af-chat-input');
  var sendBtn = document.getElementById('af-chat-send');
  if (!panel || !toggle) return;

  // Chat service endpoint (server holds the OpenAI key — never the browser).
  var CHAT_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CHAT_URL) || 'https://api.afosi.org/chat';

  var history = [];        // {role:'user'|'assistant', content} — sent to the backend for context
  var busy = false;
  var blink = 'display:inline-block;width:8px;height:14px;background:#F26522;margin-left:2px;vertical-align:middle;animation:mgBlink 1.1s steps(1) infinite;';

  function scrollChat() { body.scrollTop = body.scrollHeight; }

  // User line: a terminal command echo.  Bot line: assistant output.
  function userLine(text) {
    var div = document.createElement('div');
    div.style.cssText = 'align-self:stretch;color:#F5B98F;word-break:break-word;';
    var p = document.createElement('span'); p.style.cssText = 'color:#F26522;'; p.textContent = 'you@afosi:~$ ';
    var t = document.createElement('span'); t.textContent = text;
    div.appendChild(p); div.appendChild(t);
    body.appendChild(div); scrollChat();
  }

  function botShell() {
    var div = document.createElement('div');
    div.style.cssText = 'align-self:stretch;color:#E8E2D6;word-break:break-word;white-space:pre-wrap;';
    var tag = document.createElement('span'); tag.style.cssText = 'color:#2E7D32;'; tag.textContent = 'afosi> ';
    var span = document.createElement('span');
    var cur = document.createElement('span'); cur.style.cssText = blink;
    div.appendChild(tag); div.appendChild(span); div.appendChild(cur);
    body.appendChild(div); scrollChat();
    return { span: span, cursor: cur, wrap: div };
  }

  // Char-by-char typewriter reveal with a blinking block cursor.
  function typewrite(shell, text) {
    return new Promise(function (resolve) {
      var i = 0;
      var speed = text.length > 320 ? 8 : 16;   // faster for long answers
      (function step() {
        if (i >= text.length) { if (shell.cursor.parentNode) shell.cursor.parentNode.removeChild(shell.cursor); resolve(); return; }
        var chunk = text.length > 320 ? 3 : 1;
        shell.span.textContent += text.slice(i, i + chunk);
        i += chunk;
        scrollChat();
        setTimeout(step, speed);
      })();
    });
  }

  async function fetchReply() {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 30000);
    try {
      var res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) }),   // cap context sent
        signal: ctrl.signal
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data) throw new Error((data && data.message) || ('chat ' + res.status));
      return String(data.reply || '').trim() || 'Sorry, I could not generate a reply just now.';
    } finally {
      clearTimeout(timer);
    }
  }

  async function send(textArg) {
    if (busy) return;
    var text = String(textArg || input.value).trim();
    if (!text) return;
    if (text.length > 800) text = text.slice(0, 800);
    busy = true;
    input.value = '';
    userLine(text);
    history.push({ role: 'user', content: text });

    var shell = botShell();               // shows a lone blinking cursor while thinking
    try {
      var reply = await fetchReply();
      await typewrite(shell, reply);
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      if (shell.cursor.parentNode) shell.cursor.parentNode.removeChild(shell.cursor);
      shell.span.style.color = '#E0A090';
      shell.span.textContent = "connection to the assistant is unavailable right now. reach us at info@afosi.org or (+254) 0115 963 306.";
      scrollChat();
    } finally {
      busy = false;
      input.focus();
    }
  }

  // Greeting typed out on first render.
  (function greet() {
    var shell = botShell();
    typewrite(shell, "Habari. I'm the AFOSI assistant — ask me anything about our programs, opportunities, platforms or how to get involved.");
  })();

  var isPhone = function () { return window.matchMedia('(max-width: 640px)').matches; };
  function setOpen(open) {
    panel.style.display = open ? 'flex' : 'none';
    // Full-screen overlay on phones — freeze the page behind it.
    document.body.style.overflow = open && isPhone() ? 'hidden' : '';
    if (open) { scrollChat(); if (!isPhone()) input.focus(); }
  }
  toggle.addEventListener('click', function () {
    setOpen(panel.style.display === 'none');
  });
  closeBtn.addEventListener('click', function () { setOpen(false); });
  sendBtn.addEventListener('click', function () { send(); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  document.querySelectorAll('.af-chat-prompt').forEach(function (p) {
    p.addEventListener('click', function () { send(p.dataset.msg); });
  });
})();

// ---------------------------------------------------------------------------
// Live platform previews — embed the real site in a scaled frame instead of
// a screenshot. Per-site flag: data-embed="1" mounts an iframe; otherwise the
// screenshot fallback gets a slow pan + "open live" treatment (for sites that
// still send X-Frame-Options and refuse to be embedded).
// ---------------------------------------------------------------------------
(function () {
  var els = document.querySelectorAll('[data-live-preview]');
  if (!els.length) return;
  var VIEW_W = 1280; // desktop viewport the embedded site renders at
  // On phones/tablets, skip the heavy cross-origin iframes: they render at
  // 1280px (overflowing to the right) and three loading at once freeze the
  // main thread — which locks up the chat widget. Use the screenshot instead.
  var LITE = window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches;

  function status(frame, text, color) {
    var s = frame ? frame.querySelector('[data-preview-status]') : null;
    if (!s) return;
    s.textContent = text;
    if (color) s.style.color = color;
  }

  function fit(el, iframe) {
    var w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    var sc = w / VIEW_W;
    iframe.style.width = VIEW_W + 'px';
    iframe.style.height = Math.ceil(h / sc) + 'px';
    iframe.style.transform = 'scale(' + sc + ')';
  }

  function makeVeil(host) {
    var veil = document.createElement('div');
    veil.setAttribute('data-preview-veil', '');
    veil.style.cssText = 'position:absolute;inset:0;z-index:3;background:#0F0D0B;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding:22px 24px;gap:7px;background-image:radial-gradient(rgba(242,101,34,0.09) 1.3px,transparent 1.6px);background-size:24px 24px;transition:opacity 0.6s ease;';
    veil.innerHTML =
      '<div style="font-family:\'Space Mono\',monospace;font-size:12px;color:#6E6559;">$ curl -I https://' + host + '</div>' +
      '<div data-veil-l2 style="font-family:\'Space Mono\',monospace;font-size:12px;color:#6E6559;opacity:0;">HTTP/2 200 · content-type: text/html</div>' +
      '<div data-veil-l3 style="font-family:\'Space Mono\',monospace;font-size:12px;color:#7FB069;opacity:0;">rendering live preview<span style="display:inline-block;width:8px;height:13px;background:#F26522;margin-left:7px;vertical-align:middle;animation:mgBlink 1.1s steps(1) infinite;"></span></div>';
    setTimeout(function () { var l = veil.querySelector('[data-veil-l2]'); if (l) l.style.opacity = '1'; }, 550);
    setTimeout(function () { var l = veil.querySelector('[data-veil-l3]'); if (l) l.style.opacity = '1'; }, 1050);
    return veil;
  }

  function controlBtn(label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'cursor:pointer;font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:12.5px;letter-spacing:0.02em;padding:9px 15px;background:#F26522;color:#141210;border:2px solid #141210;box-shadow:3px 3px 0 rgba(0,0,0,0.5);';
    return b;
  }

  function controlLink(url, label) {
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    a.style.cssText = 'font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:12.5px;letter-spacing:0.02em;padding:9px 15px;background:#FBF6EE;color:#141210;border:2px solid #141210;box-shadow:3px 3px 0 rgba(0,0,0,0.5);';
    return a;
  }

  function mountLive(el, frame) {
    var url = el.dataset.url;
    var host = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    status(frame, '▸ GET ' + host, '#948D82');

    el.appendChild(makeVeil(host));

    var iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = host + ' — live preview';
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.style.cssText = 'position:absolute;left:0;top:0;border:0;transform-origin:0 0;background:#FFFFFF;pointer-events:none;opacity:0;transition:opacity 0.7s ease;';
    el.appendChild(iframe);
    fit(el, iframe);
    window.addEventListener('resize', function () { fit(el, iframe); });

    var loaded = false;
    iframe.addEventListener('load', function () {
      if (loaded) return;
      loaded = true;
      iframe.style.opacity = '1';
      var veil = el.querySelector('[data-preview-veil]');
      if (veil) {
        veil.style.opacity = '0';
        setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 700);
      }
      status(frame, '● LIVE', '#4CAF50');
    });
    setTimeout(function () { if (!loaded) status(frame, '▸ connecting…', '#F2B705'); }, 9000);

    // Hover controls: interact with the embedded site, or open it for real.
    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:4;display:flex;gap:8px;opacity:0;transition:opacity 0.25s ease;';
    var interact = controlBtn('Interact ▸');
    var open = controlLink(url, 'Open ↗');
    bar.appendChild(interact);
    bar.appendChild(open);
    el.appendChild(bar);
    if (LITE) bar.style.opacity = '1';   // touch devices: no hover, keep controls visible

    var on = false;
    interact.addEventListener('click', function () {
      on = !on;
      iframe.style.pointerEvents = on ? 'auto' : 'none';
      interact.textContent = on ? 'Done ✕' : 'Interact ▸';
      interact.style.background = on ? '#141210' : '#F26522';
      interact.style.color = on ? '#FBF6EE' : '#141210';
      el.style.outline = on ? '3px solid #F26522' : 'none';
      el.style.outlineOffset = '-3px';
    });
    el.addEventListener('mouseenter', function () { bar.style.opacity = '1'; });
    el.addEventListener('mouseleave', function () { bar.style.opacity = on ? '1' : '0'; });
  }

  function mountFallback(el, frame) {
    var url = el.dataset.url;
    var host = url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    status(frame, '▸ preview', '#948D82');

    var img = document.createElement('img');
    img.src = el.dataset.shot;
    img.alt = host + ' preview';
    img.loading = 'lazy';
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;transition:object-position 5s ease, transform 5s ease;';
    el.appendChild(img);

    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:4;display:flex;gap:8px;opacity:0;transition:opacity 0.25s ease;';

    // Facade pattern (lite-embed): on touch devices the screenshot stands in
    // for the heavy cross-origin iframe, and this button mounts the real
    // thing only on explicit tap — one iframe at a time, main thread stays free.
    if (el.dataset.embed === '1' && LITE) {
      var loadBtn = controlBtn('▶ Live preview');
      loadBtn.addEventListener('click', function () {
        if (img.parentNode) img.parentNode.removeChild(img);
        if (bar.parentNode) bar.parentNode.removeChild(bar);
        mountLive(el, frame);
      });
      bar.appendChild(loadBtn);
    }
    bar.appendChild(controlLink(url, 'Open ↗'));
    el.appendChild(bar);

    if (LITE) bar.style.opacity = '1';   // no hover on touch — keep controls visible

    el.addEventListener('mouseenter', function () {
      img.style.objectPosition = 'center bottom';
      img.style.transform = 'scale(1.04)';
      bar.style.opacity = '1';
    });
    el.addEventListener('mouseleave', function () {
      img.style.objectPosition = 'center top';
      img.style.transform = 'scale(1)';
      if (!LITE) bar.style.opacity = '0';
    });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      var el = e.target;
      if (el.dataset.mounted) return;
      el.dataset.mounted = '1';
      var frame = el.closest('[data-preview-frame]');
      if (el.dataset.embed === '1' && !LITE) mountLive(el, frame);
      else mountFallback(el, frame);
    });
  }, { rootMargin: '300px' });

  els.forEach(function (el) { io.observe(el); });
})();
