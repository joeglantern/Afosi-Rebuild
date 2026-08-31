// AFOSI CMS renderer — fetches live content from the backend API and injects it
// into the existing neo-brutalist page design. One module drives four views,
// selected by `body[data-cms]`:
//   news · gallery · opportunities (list) · opp-detail
// The application form lives in a separate module (apply.js).
import { newsAPI, galleryAPI, opportunitiesAPI, projectsAPI } from './api.js';

// ── Shared helpers ───────────────────────────────────────────────────────────
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Gallery/news photos come straight from Supabase Storage at their original
// upload size (some are 10-20MB) — route them through our own resize/cache
// proxy instead of loading the original. Falls through to the raw url for
// anything not hosted on Supabase, so nothing silently breaks if that changes.
const IMG_PROXY_BASE = (import.meta.env && import.meta.env.VITE_API_ROOT) || 'https://api.afosi.org';
function imgProxy(url, width) {
  if (!url) return url;
  try {
    if (!/\.supabase\.co$/i.test(new URL(url).hostname)) return url;
  } catch {
    return url;
  }
  return `${IMG_PROXY_BASE}/img?url=${encodeURIComponent(url)}&w=${width}`;
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return esc(value);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateLong(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return esc(value);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Reveal-on-scroll for injected [data-reveal] nodes (site.js only observes nodes
// present at load, so dynamic content needs its own observer).
function revealAll(nodes) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.classList.remove('pre');
      e.target.classList.add('on');
    });
  }, { threshold: 0.12 });
  nodes.forEach((el) => {
    el.classList.add('pre');
    io.observe(el);
  });
}

// Bind a filter button group that was injected after load (mirrors the filter
// behavior in site.js, which only wires groups present at initial load).
function bindFilter(group, scope) {
  const btns = group.querySelectorAll('[data-filter]');
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter;
      btns.forEach((b) => {
        const on = b === btn;
        b.style.background = on ? '#F26522' : 'transparent';
        b.style.color = on ? '#141210' : '#17150F';
        b.style.borderColor = on ? '#F26522' : '#17150F';
      });
      scope.querySelectorAll('[data-cat]').forEach((item) => {
        const show = f === 'all' || item.dataset.cat.split(',').indexOf(f) > -1;
        item.style.display = show ? '' : 'none';
      });
    });
  });
}

// Lightbox for injected images (site.js's lightbox bails out early when the page
// has no static [data-lightbox] nodes, so gallery builds its own overlay).
let lightboxImg = null;
function ensureLightbox() {
  if (lightboxImg) return lightboxImg;
  const ov = document.createElement('div');
  ov.id = 'af-cms-lightbox';
  ov.style.cssText =
    'position:fixed;inset:0;z-index:200;background:rgba(20,18,16,0.94);display:none;' +
    'align-items:center;justify-content:center;padding:40px;cursor:zoom-out;';
  ov.innerHTML =
    '<img style="max-width:92vw;max-height:86vh;border:3px solid #FBF6EE;box-shadow:0 30px 80px rgba(0,0,0,0.6);">' +
    '<div style="position:absolute;top:24px;right:28px;color:#FBF6EE;font-family:\'Space Grotesk\',sans-serif;font-size:34px;font-weight:700;cursor:pointer;line-height:1;">×</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', () => { ov.style.display = 'none'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.style.display = 'none'; });
  lightboxImg = ov.querySelector('img');
  lightboxImg._overlay = ov;
  return lightboxImg;
}
function openLightbox(src) {
  const img = ensureLightbox();
  img.src = src;
  img._overlay.style.display = 'flex';
}

function stateBox(title, text) {
  return (
    `<div data-reveal style="border:2px dashed rgba(23,21,15,0.3);background:#FFFFFF;padding:70px 40px;text-align:center;">` +
    `<div style="font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;margin-bottom:10px;">${esc(title)}</div>` +
    `<p style="font-size:16px;color:#5A5346;max-width:520px;margin:0 auto;">${esc(text)}</p></div>`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// NEWS
// ═════════════════════════════════════════════════════════════════════════════
const FILE_SVG = (stroke) =>
  `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" style="position:relative;"><path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>`;

// Bucket every article into one of the two design filters (Newsletter / Report).
function newsBucket(item) {
  const t = `${item.type || ''} ${item.category || ''}`.toLowerCase();
  if (t.includes('newsletter')) return 'Newsletter';
  return 'Report';
}

function newsCard(item) {
  const bucket = newsBucket(item);
  const accent = bucket === 'Newsletter' ? '#F26522' : '#8A4B2C';
  const link = item.pdf_url || '';
  const media = item.image_url
    ? `<div style="height:150px;position:relative;overflow:hidden;border-bottom:2px solid #17150F;">
         <img src="${esc(imgProxy(item.image_url, 500))}" alt="${esc(item.title)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;">
         <span style="position:absolute;top:12px;left:12px;background:${accent};color:#141210;font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;padding:5px 9px;letter-spacing:0.08em;text-transform:uppercase;">${esc(bucket)}</span>
       </div>`
    : `<div style="height:150px;background:#141210;position:relative;overflow:hidden;border-bottom:2px solid #17150F;display:flex;align-items:center;justify-content:center;">
         <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(242,101,34,0.14) 1.3px,transparent 1.6px);background-size:22px 22px;"></div>
         ${FILE_SVG(accent)}
         <span style="position:absolute;top:12px;left:12px;background:${accent};color:#141210;font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;padding:5px 9px;letter-spacing:0.08em;text-transform:uppercase;">${esc(bucket)}</span>
       </div>`;
  const meta = [fmtDate(item.published_date), item.location].filter(Boolean).map(esc).join(' · ');
  const action = link
    ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;color:#17150F;border-bottom:2px solid #F26522;padding-bottom:2px;align-self:flex-start;">View PDF →</a>`
    : `<span style="font-family:'Space Mono',monospace;font-size:12px;color:#8A8175;">PDF coming soon</span>`;
  return (
    `<article data-reveal data-cat="${bucket}" style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;display:flex;flex-direction:column;">
       ${media}
       <div style="padding:24px;display:flex;flex-direction:column;flex:1;">
         ${meta ? `<div style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.06em;color:#8A8175;margin:0 0 10px;text-transform:uppercase;">${meta}</div>` : ''}
         <h3 style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;margin:0 0 10px;line-height:1.2;">${esc(item.title)}</h3>
         <p style="font-size:14px;color:#5A5346;margin:0 0 20px;line-height:1.55;flex:1;">${esc(item.excerpt || '')}</p>
         ${action}
       </div>
     </article>`
  );
}

async function renderNews() {
  const grid = document.querySelector('[data-news-grid]');
  if (!grid) return;
  try {
    const res = await newsAPI.getAll({ limit: 50 });
    const items = (res && res.data) || [];
    if (!items.length) {
      grid.style.display = 'block';
      grid.innerHTML = stateBox('No reports yet', 'Newsletters and reports published from the AFOSI dashboard will appear here.');
      revealAll([grid.firstElementChild]);
      return;
    }
    grid.innerHTML = items.map(newsCard).join('');
    revealAll(Array.from(grid.children));
  } catch (err) {
    grid.style.display = 'block';
    grid.innerHTML = stateBox('Unable to load news', 'Please check your connection and try again shortly.');
    console.error('[CMS] news:', err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// GALLERY
// ═════════════════════════════════════════════════════════════════════════════
function galleryItem(item, i) {
  const url = item.image_url || item.src || '';
  const cat = item.category || 'Programs';
  const label = item.title || item.alt || cat;
  const span = i % 3 === 0;
  const minH = span ? 420 : 230;
  return (
    `<div data-reveal data-cat="${esc(cat)}" data-lightbox="${esc(imgProxy(url, 1400))}" style="position:relative;cursor:zoom-in;overflow:hidden;border:2px solid #17150F;${span ? 'grid-row:span 2;' : ''}break-inside:avoid;">
       <img src="${esc(imgProxy(url, 500))}" alt="${esc(label)}" loading="lazy" decoding="async" style="display:block;width:100%;height:100%;min-height:${minH}px;object-fit:cover;transition:transform 0.5s ease;">
       <div style="position:absolute;inset:0;display:flex;align-items:flex-end;padding:16px;background:linear-gradient(to top,rgba(20,18,16,0.75),transparent 55%);opacity:0;transition:opacity 0.3s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0"><span style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;background:#F26522;padding:5px 10px;color:#141210;">${esc(cat)}</span></div>
     </div>`
  );
}

async function renderGallery() {
  const grid = document.querySelector('[data-gallery-grid]');
  if (!grid) return;
  try {
    const res = await galleryAPI.getAll();
    const items = (res && res.data) || [];
    if (!items.length) {
      grid.style.display = 'block';
      grid.innerHTML = stateBox('No photos yet', 'Images uploaded from the AFOSI dashboard will appear here.');
      return;
    }
    grid.innerHTML = items.map(galleryItem).join('');
    Array.from(grid.querySelectorAll('[data-lightbox]')).forEach((el) => {
      el.addEventListener('click', () => openLightbox(el.getAttribute('data-lightbox')));
    });
    revealAll(Array.from(grid.children));
  } catch (err) {
    grid.style.display = 'block';
    grid.innerHTML = stateBox('Unable to load gallery', 'Please check your connection and try again shortly.');
    console.error('[CMS] gallery:', err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// OPPORTUNITIES (list)
// ═════════════════════════════════════════════════════════════════════════════
const TYPE_META = {
  employment: { label: 'Employment', color: '#F26522' },
  consulting: { label: 'Consulting', color: '#8A4B2C' },
  volunteering: { label: 'Volunteering', color: '#2E7D32' },
};

function isDeadlinePassed(deadline) {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (isNaN(d)) return false;
  d.setHours(23, 59, 59, 999);
  return new Date() > d;
}

function oppCard(opp) {
  const meta = TYPE_META[opp.type] || { label: opp.type || 'Opportunity', color: '#17150F' };
  const bits = [
    opp.location && `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;background:#F26522;"></span>${esc(opp.location)}</span>`,
    opp.duration && `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;background:#8A4B2C;"></span>${esc(opp.duration)}</span>`,
    opp.deadline
      ? `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;background:#2E7D32;"></span>Deadline: ${esc(fmtDateLong(opp.deadline))}</span>`
      : `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;background:#2E7D32;"></span>Open — No Deadline</span>`,
  ].filter(Boolean).join('');
  return (
    `<article data-reveal data-cat="${esc(opp.type || '')}" style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:30px;display:flex;justify-content:space-between;align-items:flex-start;gap:28px;flex-wrap:wrap;">
       <div style="flex:1;min-width:260px;">
         <span style="display:inline-block;background:${meta.color};color:#141210;font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;padding:5px 10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px;">${esc(meta.label)}</span>
         <h3 style="font-family:'Space Grotesk',sans-serif;font-size:23px;font-weight:700;margin:0 0 12px;line-height:1.2;">${esc(opp.title)}</h3>
         <div style="display:flex;flex-wrap:wrap;gap:16px;font-family:'Space Mono',monospace;font-size:12px;color:#6E6559;margin-bottom:14px;">${bits}</div>
         <p style="font-size:14.5px;color:#5A5346;margin:0;line-height:1.6;max-width:640px;">${esc(opp.description || '')}</p>
       </div>
       <a href="/opportunity.html?slug=${encodeURIComponent(opp.slug || opp.id)}" class="hov-ink" style="background:#F26522;color:#141210;padding:14px 26px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;white-space:nowrap;">View details →</a>
     </article>`
  );
}

async function renderOpportunities() {
  const root = document.querySelector('[data-opps-root]');
  if (!root) return;
  try {
    const res = await opportunitiesAPI.getAll();
    const active = ((res && res.data) || []).filter(
      (o) => !o.manually_disabled && !isDeadlinePassed(o.deadline)
    );

    if (!active.length) {
      root.innerHTML = (
        `<div data-reveal style="border:2px dashed rgba(23,21,15,0.3);background:#FFFFFF;padding:70px 40px;text-align:center;">
           <div style="font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;margin-bottom:12px;">No open positions right now</div>
           <p style="font-size:16px;color:#5A5346;max-width:520px;margin:0 auto 26px;">We're always looking for passionate people. Send us your CV and area of interest, and we'll reach out when something opens up.</p>
           <a href="mailto:info@afosi.org?subject=General Application" class="hov-ink" style="display:inline-block;background:#F26522;color:#141210;padding:16px 34px;font-size:16px;font-weight:700;">Send your CV →</a>
         </div>`
      );
      revealAll([root.firstElementChild]);
      return;
    }

    // Build filter buttons only for the types actually present.
    const types = Array.from(new Set(active.map((o) => o.type).filter(Boolean)));
    const btn = (f, label, on) =>
      `<button data-filter="${f}" style="cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.04em;padding:9px 18px;border:2px solid ${on ? '#F26522' : '#17150F'};background:${on ? '#F26522' : 'transparent'};color:#141210;transition:all 0.2s;">${esc(label)}</button>`;
    const filterBar =
      types.length > 1
        ? `<div data-filter-group style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:30px;">${btn('all', 'All opportunities', true)}${types.map((t) => btn(t, (TYPE_META[t] && TYPE_META[t].label) || t, false)).join('')}</div>`
        : '';

    root.innerHTML =
      filterBar +
      `<div data-opps-grid style="display:flex;flex-direction:column;gap:20px;">${active.map(oppCard).join('')}</div>`;

    const group = root.querySelector('[data-filter-group]');
    if (group) bindFilter(group, root);
    revealAll(Array.from(root.querySelectorAll('[data-reveal]')));
  } catch (err) {
    root.innerHTML = stateBox('Unable to load opportunities', 'Please check your connection and try again shortly.');
    console.error('[CMS] opportunities:', err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═════════════════════════════════════════════════════════════════════════════
// Cards rendered from the admin dashboard's Projects tab. The schema has no
// category field, so (unlike Gallery/Opportunities) there's no filter bar here
// — every project is shown, in the order set by display_order in the dashboard.
const PROJECT_ACCENTS = [
  { bg: '#F26522', fg: '#141210' },
  { bg: '#141210', fg: '#F26522' },
  { bg: '#8A4B2C', fg: '#141210' },
  { bg: '#2E7D32', fg: '#141210' },
];

function projectCard(item, i) {
  const accent = PROJECT_ACCENTS[i % PROJECT_ACCENTS.length];
  const tags = (item.highlights || []).filter(Boolean).slice(0, 3);
  const link = (item.link || '').trim();
  const isExternal = /^https?:\/\//i.test(link);

  let cta;
  if (isExternal) {
    cta = `<a href="${esc(link)}" target="_blank" rel="noopener" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;color:#17150F;border-bottom:2px solid #F26522;padding-bottom:2px;align-self:flex-start;">Visit platform ↗</a>`;
  } else if (link) {
    // Individual program subpages aren't built yet — send to the Programs
    // overview page rather than a link that would 404.
    cta = `<a href="/programs.html" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;color:#17150F;border-bottom:2px solid #F26522;padding-bottom:2px;align-self:flex-start;">Learn more →</a>`;
  } else {
    cta = `<span style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;color:#B8B1A5;">Coming soon</span>`;
  }

  return (
    `<div data-reveal style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;display:flex;flex-direction:column;${item.link ? '' : 'opacity:0.72;'}">
       <div style="height:210px;overflow:hidden;position:relative;border-bottom:2px solid #17150F;">
         <img src="${esc(imgProxy(item.image_url, 700))}" alt="${esc(item.title)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;">
         ${item.duration ? `<span style="position:absolute;top:14px;left:14px;background:${accent.bg};color:${accent.fg};font-family:'Space Mono',monospace;font-size:11px;font-weight:700;padding:6px 10px;letter-spacing:0.08em;text-transform:uppercase;">${esc(item.duration)}</span>` : ''}
       </div>
       <div style="padding:26px;display:flex;flex-direction:column;flex:1;">
         <h3 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 10px;line-height:1.1;">${esc(item.title)}</h3>
         <p style="font-size:14.5px;color:#5A5346;margin:0 0 16px;line-height:1.55;flex:1;">${esc(item.description || item.excerpt || '')}</p>
         ${tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:20px;">${tags.map((t) => `<span style="font-family:'Space Mono',monospace;font-size:11px;color:#5A5346;border:1px solid rgba(23,21,15,0.2);padding:5px 9px;">${esc(t)}</span>`).join('')}</div>` : ''}
         ${item.beneficiaries ? `<div style="font-family:'Space Mono',monospace;font-size:12px;color:#8A8175;margin-bottom:14px;">◈ ${esc(item.beneficiaries)} reached</div>` : ''}
         ${cta}
       </div>
     </div>`
  );
}

async function renderProjects() {
  const grid = document.querySelector('[data-projects-grid]');
  if (!grid) return;
  try {
    const res = await projectsAPI.getAll();
    const items = (res && res.data) || [];
    if (!items.length) {
      grid.style.display = 'block';
      grid.innerHTML = stateBox('No projects yet', 'Projects published from the AFOSI dashboard will appear here.');
      revealAll([grid.firstElementChild]);
      return;
    }
    grid.innerHTML = items.map(projectCard).join('');
    revealAll(Array.from(grid.children));
  } catch (err) {
    grid.style.display = 'block';
    grid.innerHTML = stateBox('Unable to load projects', 'Please check your connection and try again shortly.');
    console.error('[CMS] projects:', err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// OPPORTUNITY DETAIL
// ═════════════════════════════════════════════════════════════════════════════
// Parse a plain-text full_description into headed sections + bullet/paragraph
// lines (ported from the old React OpportunityDetail).
function isHeadingLine(line, nextLine) {
  const t = line.trim();
  if (!t || t.length > 70) return false;
  if (/^[-•*]\s/.test(t)) return false;
  if (/[.!?,;]$/.test(t)) return false;
  if (!/^[A-Z]/.test(t)) return false;
  const words = t.split(/\s+/).length;
  if (words > 7) return false;
  if (t.includes(':') && words > 4) return false;
  if (!nextLine) return false;
  return /^[-•*]\s/.test(nextLine.trim()) || nextLine.trim().length > t.length + 10;
}

function parseSections(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const sections = [];
  let cur = { heading: null, items: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let next = '';
    for (let j = i + 1; j < lines.length; j++) { if (lines[j]) { next = lines[j]; break; } }
    if (isHeadingLine(line, next)) {
      if (cur.items.length || cur.heading) sections.push(cur);
      cur = { heading: line.replace(/[:\-–—]+$/, '').trim(), items: [] };
    } else {
      cur.items.push(line);
    }
  }
  if (cur.items.length || cur.heading) sections.push(cur);
  return sections;
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderLine(line) {
  if (/^[-•*]\s/.test(line)) {
    return (
      `<div style="display:flex;align-items:flex-start;gap:12px;margin:0 0 8px;">
         <span style="width:8px;height:8px;background:#F26522;margin-top:8px;flex-shrink:0;"></span>
         <span style="color:#5A5346;line-height:1.6;font-size:15px;">${esc(line.replace(/^[-•*]\s+/, ''))}</span>
       </div>`
    );
  }
  return `<p style="color:#5A5346;line-height:1.7;font-size:15px;margin:0 0 12px;">${esc(line)}</p>`;
}

function renderFullDescription(text) {
  const sections = parseSections(text);
  if (sections.length === 1 && !sections[0].heading) {
    return `<div>${sections[0].items.map(renderLine).join('')}</div>`;
  }
  return sections
    .map((sec) => {
      const heading = sec.heading
        ? `<div style="display:flex;align-items:center;gap:12px;margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #17150F;">
             <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0;">${esc(titleCase(sec.heading))}</h2>
           </div>`
        : '';
      const bulletCount = sec.items.filter((l) => /^[-•*]\s/.test(l)).length;
      const mostlyBullets = sec.items.length && bulletCount >= sec.items.length / 2;
      const body = mostlyBullets
        ? `<div style="background:#FFFFFF;border:2px solid #17150F;box-shadow:5px 5px 0 #17150F;padding:22px;">${sec.items.map(renderLine).join('')}</div>`
        : `<div>${sec.items.map(renderLine).join('')}</div>`;
      return `<div data-reveal style="margin-bottom:36px;">${heading}${body}</div>`;
    })
    .join('');
}

async function renderOpportunityDetail() {
  const root = document.querySelector('[data-opp-detail]');
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || params.get('id');
  if (!slug) { root.innerHTML = detailError(); return; }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  try {
    let res;
    if (isUUID) {
      res = await opportunitiesAPI.getById(slug);
    } else {
      try { res = await opportunitiesAPI.getBySlug(slug); }
      catch { res = await opportunitiesAPI.getById(slug); }
    }
    const opp = res && res.data;
    if (!opp) { root.innerHTML = detailError(); return; }
    document.title = `${opp.title} — AFOSI`;
    root.innerHTML = opportunityDetailHTML(opp);
    revealAll(Array.from(root.querySelectorAll('[data-reveal]')));
  } catch (err) {
    console.error('[CMS] opportunity detail:', err);
    root.innerHTML = detailError();
  }
}

function detailError() {
  return (
    `<section data-section style="max-width:1320px;margin:0 auto;padding:120px 40px;text-align:center;">
       <h1 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(34px,5vw,60px);margin:0 0 16px;">Opportunity not found</h1>
       <p style="font-size:17px;color:#5A5346;max-width:520px;margin:0 auto 28px;">This opportunity may have been removed or the link is incorrect.</p>
       <a href="/opportunities.html" class="hov-ink" style="display:inline-block;background:#F26522;color:#141210;padding:15px 30px;font-weight:700;">← Back to Opportunities</a>
     </section>`
  );
}

// Supporting documents (TOR, concept notes) for an opportunity. The CMS has no
// file field on the opportunities table yet, so documents ship as static files
// from public/opportunity-docs and are mapped to a slug here. If the dashboard
// ever gains a document field the record wins and this map becomes the
// fallback, so nothing has to change here again.
const OPP_DOCS = {
  'esd-climate-storytelling-consultancy': {
    url: '/opportunity-docs/afosi-podcast-terms-of-reference.pdf',
    label: 'Terms of Reference (TOR)',
    meta: 'PDF · 10 pages',
  },
};

function opportunityDoc(opp) {
  const fromCms = opp.tor_url || opp.document_url || opp.attachment_url;
  if (fromCms && String(fromCms).trim()) {
    return { url: String(fromCms).trim(), label: 'Terms of Reference (TOR)', meta: 'PDF' };
  }
  return OPP_DOCS[opp.slug] || null;
}

function opportunityDetailHTML(opp) {
  const meta = TYPE_META[opp.type] || { label: opp.type || 'Opportunity', color: '#17150F' };
  const closed = opp.manually_disabled || isDeadlinePassed(opp.deadline);
  const isOpen = !closed;
  const applyLink = opp.apply_link || '';
  const isEmailApply = !applyLink || applyLink.startsWith('mailto:');
  const isInternalApply = applyLink === 'internal' || applyLink.startsWith('internal');
  const applyEmail = 'careers@afosi.org';

  let applyBtn;
  if (!isOpen) {
    applyBtn = `<button disabled style="width:100%;background:transparent;border:2px solid rgba(251,246,238,0.4);color:#FBF6EE;padding:16px;font-weight:700;font-size:15px;opacity:0.7;cursor:not-allowed;">Applications closed</button>`;
  } else if (isEmailApply) {
    applyBtn = `<a href="mailto:${applyEmail}?subject=${encodeURIComponent('Application: ' + opp.title)}" class="hov-paper" style="display:block;text-align:center;background:#FBF6EE;color:#141210;padding:16px;font-weight:700;font-size:15px;">Apply via Email →</a>`;
  } else if (isInternalApply) {
    applyBtn = `<a href="/apply.html?slug=${encodeURIComponent(opp.slug || opp.id)}" class="hov-paper" style="display:block;text-align:center;background:#FBF6EE;color:#141210;padding:16px;font-weight:700;font-size:15px;">Apply Now →</a>`;
  } else {
    applyBtn = `<a href="${esc(applyLink)}" target="_blank" rel="noopener" class="hov-paper" style="display:block;text-align:center;background:#FBF6EE;color:#141210;padding:16px;font-weight:700;font-size:15px;">Apply Now ↗</a>`;
  }

  const applyHint = isOpen
    ? (isEmailApply
        ? `Send your CV &amp; cover letter to <strong>${applyEmail}</strong> with the job title as the subject line.`
        : isInternalApply
          ? `Fill in and submit the application form directly on this website.`
          : `Click <strong>Apply Now</strong> to open the online application form.`)
    : '';

  // Applicants need the TOR before they can apply, so it sits in the hero next
  // to the deadline rather than buried in the body copy. The whole card is the
  // link, which also gives it a full-width tap target on a phone.
  const doc = opportunityDoc(opp);
  const docBlock = doc
    ? `<a data-reveal href="${esc(doc.url)}" target="_blank" rel="noopener" class="af-opp-doc" style="display:flex;align-items:center;gap:18px;margin-top:28px;max-width:560px;background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:20px 22px;text-decoration:none;color:#17150F;">
         <span class="af-opp-doc-icon" style="flex:none;display:flex;align-items:center;justify-content:center;width:46px;height:46px;background:#F26522;border:2px solid #17150F;">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#141210" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
         </span>
         <span style="flex:1;min-width:0;">
           <span style="display:block;font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8A8175;">Read the</span>
           <span class="af-opp-doc-title" style="display:block;font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:700;line-height:1.25;margin-top:4px;">${esc(doc.label)}</span>
           <span style="display:block;font-family:'Space Mono',monospace;font-size:11.5px;color:#6E6559;margin-top:5px;">${esc(doc.meta)}</span>
         </span>
         <svg class="af-opp-doc-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#17150F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:none;"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
       </a>`
    : '';

  // The document itself, embedded so nobody has to leave the page to read it.
  // Mobile browsers either refuse to render a PDF in an iframe or reduce it to
  // a single unusable page, so below 980px this is hidden by CSS and the hero
  // card is the way in.
  const docViewer = doc
    ? `<div data-reveal class="af-opp-doc-viewer" style="margin-top:44px;">
         <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
           <h2 style="font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;margin:0;">${esc(doc.label)}</h2>
           <a href="${esc(doc.url)}" target="_blank" rel="noopener" style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#F26522;">Open full screen ↗</a>
         </div>
         <iframe src="${esc(doc.url)}#view=FitH" title="${esc(doc.label)}" loading="lazy" style="display:block;width:100%;height:760px;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;background:#FFFFFF;"></iframe>
       </div>`
    : '';

  const summaryRow = (label, val) =>
    val ? `<div><span style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8A8175;">${esc(label)}</span><p style="margin:3px 0 0;font-weight:600;color:#17150F;">${esc(val)}</p></div>` : '';

  const body = (opp.full_description && opp.full_description.trim())
    ? renderFullDescription(opp.full_description)
    : `<div data-reveal style="border:2px dashed rgba(23,21,15,0.3);background:#FFFFFF;padding:50px 30px;text-align:center;">
         <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin-bottom:8px;">No details provided</div>
         <p style="font-size:14px;color:#5A5346;margin:0;">Full details for this opportunity have not been added yet.</p>
       </div>`;

  return (
    `<!-- HERO -->
     <section data-section class="af-opp-hero" style="max-width:1320px;margin:0 auto;padding:48px 40px 20px;">
       <a href="/opportunities.html" style="display:inline-flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:26px;">← Back to Opportunities</a>
       <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
         <span style="background:${meta.color};color:#141210;font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;padding:6px 12px;letter-spacing:0.08em;text-transform:uppercase;">${esc(meta.label)}</span>
         <span style="background:${isOpen ? '#2E7D32' : '#B23A2E'};color:#FBF6EE;font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;padding:6px 12px;letter-spacing:0.08em;text-transform:uppercase;">${isOpen ? 'Open' : 'Closed'}</span>
       </div>
       <h1 class="af-opp-title" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(38px,5vw,66px);line-height:1.04;letter-spacing:-0.02em;margin:0;max-width:900px;">${esc(opp.title)}</h1>
       <p class="af-opp-lede" style="font-size:19px;line-height:1.6;color:#5A5346;margin:22px 0 0;max-width:720px;">${esc(opp.description || '')}</p>
       <div style="display:flex;flex-wrap:wrap;gap:22px;font-family:'Space Mono',monospace;font-size:13px;color:#6E6559;margin-top:24px;">
         ${opp.location ? `<span>◈ ${esc(opp.location)}</span>` : ''}
         ${opp.duration ? `<span>◷ ${esc(opp.duration)}</span>` : ''}
         ${opp.deadline ? `<span>⚑ Deadline: ${esc(fmtDateLong(opp.deadline))}</span>` : `<span>⚑ Open — No Deadline</span>`}
       </div>
       ${docBlock}
     </section>

     <!-- BODY -->
     <section data-section class="af-opp-body" style="max-width:1320px;margin:0 auto;padding:50px 40px 100px;">
       <div class="af-opp-grid" style="display:grid;grid-template-columns:1.7fr 1fr;gap:48px;align-items:start;">
         <div class="af-opp-main">
           ${body}
           ${docViewer}
           <div data-reveal style="margin-top:36px;background:#141210;color:#F2EDE4;padding:26px;display:flex;gap:16px;align-items:flex-start;">
             <span style="font-size:24px;line-height:1;">🛡</span>
             <p style="font-size:13.5px;color:#B8B1A5;line-height:1.7;margin:0;"><strong style="color:#F2EDE4;">Safeguarding:</strong> AFOSI has zero tolerance of abuse and exploitation of vulnerable people. All employees and volunteers are expected to protect children, young people and vulnerable adults from harm and to abide by our safeguarding policy.</p>
           </div>
         </div>
         <aside class="af-opp-aside" style="display:flex;flex-direction:column;gap:20px;position:sticky;top:90px;">
           <div data-reveal style="background:#F26522;color:#141210;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:28px;">
             <h3 style="font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;margin:0 0 14px;">${isOpen ? 'Ready to apply?' : 'Opportunity closed'}</h3>
             ${opp.deadline
               ? `<p style="font-size:14px;margin:0 0 20px;">Deadline: <strong>${esc(fmtDateLong(opp.deadline))}</strong></p>`
               : (isOpen ? `<p style="font-size:14px;margin:0 0 20px;">Open — No Deadline</p>` : '')}
             ${applyBtn}
             ${applyHint ? `<p style="font-size:12px;margin:16px 0 0;line-height:1.6;text-align:center;">${applyHint}</p>` : ''}
           </div>
           <div data-reveal style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:28px;">
             <h3 style="font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:700;margin:0 0 18px;">Summary</h3>
             <div style="display:flex;flex-direction:column;gap:14px;font-size:14px;">
               ${summaryRow('Type', meta.label)}
               ${summaryRow('Location', opp.location)}
               ${summaryRow('Duration', opp.duration)}
               ${summaryRow('Deadline', opp.deadline ? fmtDateLong(opp.deadline) : 'Open — No Deadline')}
             </div>
           </div>
         </aside>
       </div>
     </section>`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Boot
// ═════════════════════════════════════════════════════════════════════════════
(function boot() {
  const mode = document.body.dataset.cms;
  if (mode === 'news') renderNews();
  else if (mode === 'gallery') renderGallery();
  else if (mode === 'opportunities') renderOpportunities();
  else if (mode === 'opp-detail') renderOpportunityDetail();
  else if (mode === 'projects') renderProjects();
})();
