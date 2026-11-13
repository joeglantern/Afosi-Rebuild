// AFOSI CMS renderer — fetches live content from the backend API and injects it
// into the existing neo-brutalist page design. One module drives four views,
// selected by `body[data-cms]`:
//   news · gallery · opportunities (list) · opp-detail
// The application form lives in a separate module (apply.js).
import { newsAPI, galleryAPI, opportunitiesAPI, projectsAPI, blogAPI } from './api.js';
import { renderMarkdown, markdownToText } from './markdown.js';

// ── Shared helpers ───────────────────────────────────────────────────────────
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Gallery/news photos are stored at their original upload size (some are
// 10-20MB) — route them through our own resize/cache proxy instead of loading
// the original. That covers our own uploads (api.afosi.org/uploads) and any
// old Supabase Storage URL; anything else falls through to the raw url.
const IMG_PROXY_BASE = (import.meta.env && import.meta.env.VITE_API_ROOT) || 'https://api.afosi.org';
function imgProxy(url, width) {
  if (!url) return url;
  try {
    const u = new URL(url);
    const ours = u.hostname === 'api.afosi.org' && u.pathname.startsWith('/uploads/');
    if (!ours && !/\.supabase\.co$/i.test(u.hostname)) return url;
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
       <div class="af-gal-cap" style="position:absolute;inset:0;display:flex;align-items:flex-end;padding:16px;background:linear-gradient(to top,rgba(20,18,16,0.75),transparent 55%);opacity:0;transition:opacity 0.3s;"><span style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;background:#F26522;padding:5px 10px;color:#141210;">${esc(cat)}</span></div>
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
  // Every project gets its own detail page now (project.html?slug=…), fetched
  // straight from the CMS — this is what previously fell back to a shared
  // /programs.html link, making every card look like it led to the same
  // place. An absolute external link (e.g. a live platform like Forest
  // Explorer) still goes straight out instead.
  const detailHref = `/project.html?slug=${encodeURIComponent(item.slug || item.id)}`;
  const cta = isExternal
    ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;color:#17150F;border-bottom:2px solid #F26522;padding-bottom:2px;align-self:flex-start;">Visit platform ↗</a>`
    : `<a href="${esc(detailHref)}" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;color:#17150F;border-bottom:2px solid #F26522;padding-bottom:2px;align-self:flex-start;">Learn more →</a>`;

  return (
    `<div data-reveal style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;display:flex;flex-direction:column;">
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
// PROJECT DETAIL
// ═════════════════════════════════════════════════════════════════════════════
// Each project card now links here (project.html?slug=…) instead of every
// card previously falling back to the same /programs.html URL.
function projectSection(heading, bodyHtml) {
  return (
    `<div data-reveal style="margin-bottom:36px;">
       <div style="display:flex;align-items:center;gap:12px;margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #17150F;">
         <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0;">${esc(heading)}</h2>
       </div>
       ${bodyHtml}
     </div>`
  );
}
function bulletListHTML(items) {
  return `<div style="display:flex;flex-direction:column;gap:10px;">${items.map((t) =>
    `<div style="display:flex;align-items:flex-start;gap:12px;"><span style="width:8px;height:8px;background:#F26522;margin-top:8px;flex-shrink:0;"></span><span style="color:#5A5346;line-height:1.65;font-size:15.5px;">${esc(t)}</span></div>`
  ).join('')}</div>`;
}
function paragraphsHTML(text) {
  return String(text).split(/\n{2,}/).map((p) => `<p style="color:#5A5346;line-height:1.75;font-size:15.5px;margin:0 0 14px;">${esc(p.trim())}</p>`).join('');
}

async function renderProjectDetail() {
  const root = document.querySelector('[data-project-detail]');
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || params.get('id');
  if (!slug) { root.innerHTML = projectDetailError(); return; }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  try {
    let res;
    if (isUUID) {
      res = await projectsAPI.getById(slug);
    } else {
      try { res = await projectsAPI.getBySlug(slug); }
      catch { res = await projectsAPI.getById(slug); }
    }
    const item = res && res.data;
    if (!item) { root.innerHTML = projectDetailError(); return; }
    document.title = `${item.title} — AFOSI`;
    root.innerHTML = projectDetailHTML(item);
    revealAll(Array.from(root.querySelectorAll('[data-reveal]')));
  } catch (err) {
    console.error('[CMS] project detail:', err);
    root.innerHTML = projectDetailError();
  }
}

function projectDetailError() {
  return (
    `<section data-section style="max-width:1320px;margin:0 auto;padding:120px 40px;text-align:center;">
       <h1 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(34px,5vw,60px);margin:0 0 16px;">Project not found</h1>
       <p style="font-size:17px;color:#5A5346;max-width:520px;margin:0 auto 28px;">This project may have been removed or the link is incorrect.</p>
       <a href="/projects.html" class="hov-ink" style="display:inline-block;background:#F26522;color:#141210;padding:15px 30px;font-weight:700;">← Back to Projects</a>
     </section>`
  );
}

function projectDetailHTML(item) {
  const link = (item.link || '').trim();
  const isExternal = /^https?:\/\//i.test(link);

  const sections = [];
  if (item.why_it_matters) sections.push(projectSection('Why It Matters', paragraphsHTML(item.why_it_matters)));
  if (Array.isArray(item.what_we_do) && item.what_we_do.length) sections.push(projectSection('What We Do', bulletListHTML(item.what_we_do)));
  if (item.key_solutions) sections.push(projectSection('Key Solutions', paragraphsHTML(item.key_solutions)));
  if (item.who_it_serves) sections.push(projectSection('Who It Serves', paragraphsHTML(item.who_it_serves)));
  if (Array.isArray(item.impact) && item.impact.length) sections.push(projectSection('Expected Impact', bulletListHTML(item.impact)));

  const body = sections.length
    ? sections.join('')
    : `<div data-reveal style="border:2px dashed rgba(23,21,15,0.3);background:#FFFFFF;padding:50px 30px;text-align:center;">
         <div style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin-bottom:8px;">No further details yet</div>
         <p style="font-size:14px;color:#5A5346;margin:0;">Full details for this project have not been added yet.</p>
       </div>`;

  const partners = Array.isArray(item.partners) ? item.partners.filter(Boolean) : [];
  const highlights = Array.isArray(item.highlights) ? item.highlights.filter(Boolean) : [];

  const ctaBtn = isExternal
    ? `<a href="${esc(link)}" target="_blank" rel="noopener" class="hov-paper" style="display:block;text-align:center;background:#FBF6EE;color:#141210;padding:16px;font-weight:700;font-size:15px;">Visit platform ↗</a>`
    : `<a href="/contact.html" class="hov-paper" style="display:block;text-align:center;background:#FBF6EE;color:#141210;padding:16px;font-weight:700;font-size:15px;">Get involved →</a>`;

  const factRow = (label, val) =>
    val ? `<div><span style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8A8175;">${esc(label)}</span><p style="margin:3px 0 0;font-weight:600;color:#17150F;">${esc(val)}</p></div>` : '';

  return (
    `<!-- HERO -->
     <section data-section style="max-width:1320px;margin:0 auto;padding:48px 40px 20px;">
       <a href="/projects.html" style="display:inline-flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:26px;">← Back to Projects</a>
       <h1 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(38px,5vw,64px);line-height:1.04;letter-spacing:-0.02em;margin:0;max-width:900px;">${esc(item.title)}</h1>
       <p style="font-size:19px;line-height:1.6;color:#5A5346;margin:22px 0 0;max-width:760px;">${esc(item.description || item.excerpt || '')}</p>
     </section>

     ${item.image_url ? `
     <section data-section style="max-width:1320px;margin:0 auto;padding:0 40px 20px;">
       <div data-reveal style="border:2px solid #17150F;overflow:hidden;height:420px;">
         <img src="${esc(imgProxy(item.image_url, 1400))}" alt="${esc(item.title)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" decoding="async">
       </div>
     </section>` : ''}

     <!-- BODY -->
     <section data-section style="max-width:1320px;margin:0 auto;padding:50px 40px 100px;">
       <div style="display:grid;grid-template-columns:1.7fr 1fr;gap:48px;align-items:start;">
         <div>${body}</div>
         <aside style="display:flex;flex-direction:column;gap:20px;position:sticky;top:90px;">
           <div data-reveal style="background:#F26522;color:#141210;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:28px;">
             <h3 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 14px;">Want to support this?</h3>
             ${ctaBtn}
           </div>
           ${(item.duration || item.beneficiaries) ? `
           <div data-reveal style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:28px;">
             <h3 style="font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:700;margin:0 0 18px;">Quick facts</h3>
             <div style="display:flex;flex-direction:column;gap:14px;font-size:14px;">
               ${factRow('Duration', item.duration)}
               ${factRow('Beneficiaries reached', item.beneficiaries)}
             </div>
           </div>` : ''}
           ${highlights.length ? `
           <div data-reveal style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:28px;">
             <h3 style="font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:700;margin:0 0 16px;">Highlights</h3>
             <div style="display:flex;flex-wrap:wrap;gap:7px;">${highlights.map((h) => `<span style="font-family:'Space Mono',monospace;font-size:11px;color:#5A5346;border:1px solid rgba(23,21,15,0.2);padding:5px 9px;">${esc(h)}</span>`).join('')}</div>
           </div>` : ''}
           ${partners.length ? `
           <div data-reveal style="background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;padding:28px;">
             <h3 style="font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:700;margin:0 0 16px;">Partners</h3>
             <div style="display:flex;flex-wrap:wrap;gap:7px;">${partners.map((p) => `<span style="font-family:'Space Mono',monospace;font-size:11px;color:#5A5346;border:1px solid rgba(23,21,15,0.2);padding:5px 9px;">${esc(p)}</span>`).join('')}</div>
           </div>` : ''}
         </aside>
       </div>
       ${item.call_to_action ? `
       <div data-reveal style="margin-top:50px;background:#141210;color:#F2EDE4;padding:40px;display:flex;justify-content:space-between;align-items:center;gap:32px;flex-wrap:wrap;">
         <p style="font-size:17px;line-height:1.6;margin:0;max-width:760px;">${esc(item.call_to_action)}</p>
         <a href="/contact.html" class="hov-ink" style="background:#F26522;color:#141210;padding:16px 30px;font-weight:700;font-size:15px;white-space:nowrap;">Get in touch →</a>
       </div>` : ''}
     </section>`
  );
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
// BLOG
// ═════════════════════════════════════════════════════════════════════════════
const BLOG_PAGE_SIZE = 9;
const postHref = (slug) => `/blog-post.html?slug=${encodeURIComponent(slug)}`;
const DEFAULT_BYLINE = 'AFOSI Team';

function blogMeta(p) {
  return [fmtDate(p.published_at), `${p.reading_minutes || 1} min read`].filter(Boolean).join(' · ');
}

// A post without a cover still gets a picture-shaped panel, in the site's
// dotted-ink style, so the grid keeps its rhythm.
function blogPlaceholder(p) {
  const initial = esc(String(p.category || p.title || 'A').trim().charAt(0).toUpperCase());
  return `<div aria-hidden="true" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#141210;">
            <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(242,101,34,0.16) 1.3px,transparent 1.6px);background-size:22px 22px;"></div>
            <span style="position:relative;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:96px;line-height:1;color:#F26522;">${initial}</span>
          </div>`;
}

function blogCover(p, width) {
  return p.cover_image_url
    ? `<img src="${esc(imgProxy(p.cover_image_url, width))}" alt="${esc(p.cover_image_alt || '')}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : blogPlaceholder(p);
}

const categoryTag = (text, extra = '') =>
  `<span style="background:#F26522;color:#141210;font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;padding:5px 9px;letter-spacing:0.08em;text-transform:uppercase;${extra}">${esc(text)}</span>`;

function blogCard(p) {
  const excerpt = p.excerpt || '';
  return (
    `<a href="${postHref(p.slug)}" data-reveal class="af-blog-card hov-shadow" style="display:flex;flex-direction:column;background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;color:#17150F;">
       <div style="aspect-ratio:16/10;position:relative;overflow:hidden;border-bottom:2px solid #17150F;background:#141210;">
         ${blogCover(p, 640)}
         ${categoryTag(p.category, 'position:absolute;top:12px;left:12px;')}
       </div>
       <div style="padding:24px;display:flex;flex-direction:column;flex:1;">
         <div style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.06em;color:#6E6559;margin:0 0 10px;text-transform:uppercase;">${esc(blogMeta(p))}</div>
         <h3 style="font-family:'Space Grotesk',sans-serif;font-size:21px;font-weight:700;margin:0 0 10px;line-height:1.2;">${esc(p.title)}</h3>
         ${excerpt ? `<p style="font-size:15px;color:#5A5346;margin:0 0 20px;line-height:1.6;">${esc(excerpt)}</p>` : ''}
         <div style="margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:16px;border-top:1px solid rgba(23,21,15,0.12);">
           <span style="font-size:13.5px;font-weight:700;">${esc(p.author_name || DEFAULT_BYLINE)}</span>
           <span aria-hidden="true" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:18px;">→</span>
         </div>
       </div>
     </a>`
  );
}

function blogFeatured(p) {
  return (
    `<a href="${postHref(p.slug)}" data-reveal class="af-blog-card af-blog-featured hov-shadow" style="display:grid;grid-template-columns:1.1fr 1fr;background:#FFFFFF;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;color:#17150F;">
       <div class="af-blog-featured-media" style="position:relative;min-height:380px;overflow:hidden;background:#141210;border-right:2px solid #17150F;">
         ${blogCover(p, 1100)}
       </div>
       <div style="padding:44px 42px;display:flex;flex-direction:column;justify-content:center;">
         <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
           ${categoryTag('Featured', 'background:#17150F;color:#FBF6EE;')}
           ${categoryTag(p.category)}
         </div>
         <h2 style="font-family:'Space Grotesk',sans-serif;font-size:clamp(28px,3vw,42px);font-weight:700;line-height:1.08;letter-spacing:-0.02em;margin:0;">${esc(p.title)}</h2>
         ${p.excerpt ? `<p style="font-size:17px;color:#5A5346;line-height:1.65;margin:18px 0 0;">${esc(p.excerpt)}</p>` : ''}
         <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;margin-top:28px;padding-top:20px;border-top:1px solid rgba(23,21,15,0.12);">
           <span style="font-family:'Space Mono',monospace;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;color:#6E6559;"><strong style="color:#17150F;font-family:'Manrope',sans-serif;font-size:14px;letter-spacing:0;text-transform:none;">${esc(p.author_name || DEFAULT_BYLINE)}</strong>&nbsp; ${esc(blogMeta(p))}</span>
           <span style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;border-bottom:2px solid #F26522;padding-bottom:2px;">Read the story →</span>
         </div>
       </div>
     </a>`
  );
}

function chipStyle(on) {
  return `cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:13px;letter-spacing:0.04em;padding:9px 18px;border:2px solid ${on ? '#F26522' : '#17150F'};background:${on ? '#F26522' : 'transparent'};color:#141210;`;
}

async function renderBlog() {
  const grid = document.querySelector('[data-blog-grid]');
  if (!grid) return;
  const featuredWrap = document.querySelector('[data-blog-featured-wrap]');
  const featuredSlot = document.querySelector('[data-blog-featured]');
  const catsEl = document.querySelector('[data-blog-cats]');
  const form = document.querySelector('[data-blog-search]');
  const input = form && form.querySelector('input');
  const statusEl = document.querySelector('[data-blog-status]');
  const moreBtn = document.querySelector('[data-blog-more]');

  // Filters live in the URL, so a filtered view can be shared or bookmarked
  // and the back button returns to it.
  const params = new URLSearchParams(location.search);
  const state = {
    category: params.get('category') || '',
    tag: params.get('tag') || '',
    q: (params.get('q') || '').slice(0, 100),
    offset: 0,
    total: 0,
    featuredSlug: '',
  };
  if (input) input.value = state.q;

  const syncUrl = () => {
    const p = new URLSearchParams();
    if (state.category) p.set('category', state.category);
    if (state.tag) p.set('tag', state.tag);
    if (state.q) p.set('q', state.q);
    const qs = p.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
  };

  const filtered = () => Boolean(state.category || state.tag || state.q);

  function describe() {
    if (!statusEl) return;
    const bits = [];
    if (state.category) bits.push(`in ${state.category}`);
    if (state.tag) bits.push(`tagged “${state.tag}”`);
    if (state.q) bits.push(`matching “${state.q}”`);
    const n = state.total + (state.featuredSlug ? 1 : 0);
    statusEl.textContent = filtered()
      ? `${n} ${n === 1 ? 'story' : 'stories'} ${bits.join(', ')}`
      : '';
    if (filtered()) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'Clear filters';
      clear.style.cssText = "cursor:pointer;margin-left:14px;background:none;border:0;padding:0;font:inherit;color:#17150F;text-decoration:underline;text-decoration-color:#F26522;text-underline-offset:3px;text-decoration-thickness:2px;";
      clear.addEventListener('click', () => {
        state.category = '';
        state.tag = '';
        state.q = '';
        if (input) input.value = '';
        paintChips();
        load(true);
      });
      statusEl.appendChild(clear);
    }
  }

  let categories = [];
  function paintChips() {
    if (!catsEl) return;
    const all = [['', 'All stories'], ...categories.map((c) => [c.category, c.category])];
    catsEl.innerHTML = all
      .map(([value, label]) => {
        const on = value === state.category;
        return `<button type="button" data-blog-cat="${esc(value)}" aria-pressed="${on}" style="${chipStyle(on)}">${esc(label)}</button>`;
      })
      .join('');
    catsEl.querySelectorAll('[data-blog-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.category = btn.dataset.blogCat;
        state.tag = '';
        paintChips();
        load(true);
      });
    });
  }

  async function loadFeatured() {
    // The featured slot is only for the unfiltered front page.
    if (filtered()) {
      featuredWrap.hidden = true;
      state.featuredSlug = '';
      return;
    }
    try {
      let res = await blogAPI.getAll({ featured: true, limit: 1 });
      let post = res && res.data && res.data[0];
      if (!post) {
        res = await blogAPI.getAll({ limit: 1 });
        post = res && res.data && res.data[0];
      }
      if (!post) {
        featuredWrap.hidden = true;
        state.featuredSlug = '';
        return;
      }
      state.featuredSlug = post.slug;
      featuredSlot.innerHTML = blogFeatured(post);
      featuredWrap.hidden = false;
      revealAll(Array.from(featuredSlot.children));
    } catch {
      featuredWrap.hidden = true;
      state.featuredSlug = '';
    }
  }

  let loading = false;
  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      state.offset = 0;
      syncUrl();
      await loadFeatured();
    }
    if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = 'Loading…';
    }
    try {
      const res = await blogAPI.getAll({
        category: state.category,
        tag: state.tag,
        q: state.q,
        exclude: state.featuredSlug || undefined,
        limit: BLOG_PAGE_SIZE,
        offset: state.offset,
      });
      const items = (res && res.data) || [];
      state.total = (res && res.total) || 0;
      if (reset) {
        grid.style.display = 'grid';
        grid.innerHTML = '';
      }
      if (!items.length && reset) {
        grid.style.display = 'block';
        grid.innerHTML = state.featuredSlug
          ? ''
          : stateBox(
              filtered() ? 'No stories match' : 'No stories yet',
              filtered()
                ? 'Try another topic or search term, or clear the filters to see every story.'
                : 'Stories written in the AFOSI dashboard will appear here once they are published.'
            );
        revealAll(Array.from(grid.children));
      } else {
        const start = grid.children.length;
        grid.insertAdjacentHTML('beforeend', items.map(blogCard).join(''));
        revealAll(Array.from(grid.children).slice(start));
        // Move keyboard focus to the first new story after "Load more".
        if (!reset && grid.children[start]) grid.children[start].focus({ preventScroll: true });
      }
      state.offset += items.length;
      if (moreBtn) moreBtn.hidden = state.offset >= state.total;
      describe();
    } catch (err) {
      grid.style.display = 'block';
      grid.innerHTML = stateBox('Unable to load stories', 'Please check your connection and try again shortly.');
      if (moreBtn) moreBtn.hidden = true;
      console.error('[CMS] blog:', err);
    } finally {
      loading = false;
      if (moreBtn) {
        moreBtn.disabled = false;
        moreBtn.textContent = 'Load more stories';
      }
    }
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      state.q = (input.value || '').trim().slice(0, 100);
      load(true);
    });
    // Clearing the field (the x in a search box) shows everything again.
    input.addEventListener('search', () => {
      if (!input.value && state.q) {
        state.q = '';
        load(true);
      }
    });
  }
  if (moreBtn) moreBtn.addEventListener('click', () => load(false));

  paintChips();
  blogAPI
    .getCategories()
    .then((res) => {
      categories = (res && res.data) || [];
      // Keep a category from the URL selectable even if it has no posts now.
      if (state.category && !categories.some((c) => c.category === state.category)) {
        categories.push({ category: state.category, count: 0 });
      }
      paintChips();
    })
    .catch(() => {});
  load(true);
}

// ── Single post ──────────────────────────────────────────────────────────────
const SHARE_ICONS = {
  whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.3-1.7-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.6.6-.9 1.4-.9 2.2.1 1 .5 2 1.1 2.8 1.2 1.7 2.7 3 4.6 3.8.5.2 1 .4 1.5.5.6.2 1.2.1 1.7-.1.6-.3 1-.8 1.2-1.4.1-.3.1-.6 0-.9l-.5-.4z"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.2 2.3h3.4l-7.4 8.4L23 21.7h-6.8l-5.3-6.9-6.1 6.9H1.4l7.9-9L1 2.3h7l4.8 6.3 5.4-6.3zm-1.2 17.4h1.9L7.1 4.2H5.1l11.9 15.5z"/></svg>',
  linkedin: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.94 5a1.94 1.94 0 1 1-3.88 0 1.94 1.94 0 0 1 3.88 0zM3.4 8.5h3.1V21H3.4V8.5zM9.1 8.5h3v1.7h.05c.42-.8 1.45-1.65 3-1.65 3.2 0 3.8 2.1 3.8 4.9V21h-3.1v-5c0-1.2 0-2.7-1.65-2.7s-1.9 1.3-1.9 2.6V21h-3.1V8.5z"/></svg>',
  facebook: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.5-1.5h1.6V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v2.2H7.9V13h2.3v8h3.3z"/></svg>',
  link: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
};

function shareBar(post) {
  const url = encodeURIComponent(location.href);
  const text = encodeURIComponent(post.title);
  const links = [
    ['WhatsApp', SHARE_ICONS.whatsapp, `https://wa.me/?text=${text}%20${url}`],
    ['X', SHARE_ICONS.x, `https://twitter.com/intent/tweet?text=${text}&url=${url}`],
    ['LinkedIn', SHARE_ICONS.linkedin, `https://www.linkedin.com/sharing/share-offsite/?url=${url}`],
    ['Facebook', SHARE_ICONS.facebook, `https://www.facebook.com/sharer/sharer.php?u=${url}`],
  ];
  const btn = 'width:46px;height:46px;display:flex;align-items:center;justify-content:center;border:2px solid #17150F;background:#FFFFFF;color:#17150F;cursor:pointer;padding:0;';
  return (
    `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
       <span style="font-family:'Space Mono',monospace;font-size:11.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6E6559;margin-right:6px;">Share</span>
       ${links.map(([label, icon, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="Share on ${label}" class="hov-social2" style="${btn}">${icon}</a>`).join('')}
       <button type="button" data-copy-link aria-label="Copy link to this story" class="hov-social2" style="${btn}">${SHARE_ICONS.link}</button>
       <span data-copy-status role="status" aria-live="polite" style="font-family:'Space Mono',monospace;font-size:12px;color:#2E7D32;"></span>
     </div>`
  );
}

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    const [, key, name] = selector.match(/\[(name|property)="([^"]+)"\]/) || [];
    if (!key) return;
    el.setAttribute(key, name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function blogPostHTML(post, related) {
  const author = post.author_name || DEFAULT_BYLINE;
  const initials = author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const body = renderMarkdown(post.content, {
    imageSrc: (url, width) => imgProxy(url, width),
    idPrefix: 'sec-',
  });
  const tags = Array.isArray(post.tags) ? post.tags : [];

  const cover = post.cover_image_url
    ? `<figure data-reveal class="af-post-cover" style="margin:44px 0 0;">
         <div style="aspect-ratio:16/8.5;position:relative;overflow:hidden;border:2px solid #17150F;box-shadow:7px 7px 0 #17150F;background:#141210;">
           <img src="${esc(imgProxy(post.cover_image_url, 1600))}" alt="${esc(post.cover_image_alt || '')}" decoding="async" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">
         </div>
       </figure>`
    : '';

  return (
    `<!-- HERO -->
     <section data-section class="af-post-hero" style="max-width:1320px;margin:0 auto;padding:48px 40px 10px;">
       <a href="/blog.html" style="display:inline-flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:28px;">← All stories</a>
       <div style="max-width:960px;animation:rise 0.8s cubic-bezier(.2,.6,.2,1) both;">
         <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
           <a href="/blog.html?category=${encodeURIComponent(post.category)}" style="text-decoration:none;">${categoryTag(post.category)}</a>
           ${categoryTag(`${post.reading_minutes || 1} min read`, 'background:transparent;border:2px solid #17150F;padding:3px 8px;')}
         </div>
         <h1 class="af-post-title" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(38px,5vw,68px);line-height:1.04;letter-spacing:-0.025em;margin:0;">${esc(post.title)}</h1>
         ${post.excerpt ? `<p class="af-post-lede" style="font-size:21px;line-height:1.55;color:#5A5346;margin:24px 0 0;max-width:760px;">${esc(post.excerpt)}</p>` : ''}
         <div style="display:flex;align-items:center;gap:14px;margin-top:30px;">
           <span aria-hidden="true" style="flex:none;width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:#17150F;color:#FBF6EE;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:17px;">${esc(initials || 'A')}</span>
           <span style="display:flex;flex-direction:column;line-height:1.35;">
             <span style="font-weight:800;font-size:15.5px;">${esc(author)}</span>
             <span style="font-family:'Space Mono',monospace;font-size:12px;letter-spacing:0.04em;color:#6E6559;"><time datetime="${esc(post.published_at)}">${esc(fmtDateLong(post.published_at))}</time></span>
           </span>
         </div>
       </div>
       ${cover}
     </section>

     <!-- BODY -->
     <section data-section class="af-post-body" style="max-width:1320px;margin:0 auto;padding:56px 40px 40px;">
       <article class="af-prose" style="margin:0 auto;">${body || '<p>This story has no text yet.</p>'}</article>
       <div class="af-post-foot" style="font-size:19px;max-width:34em;margin:56px auto 0;padding-top:28px;border-top:2px solid #17150F;display:flex;flex-direction:column;gap:22px;">
         ${tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${tags.map((t) => `<a href="/blog.html?tag=${encodeURIComponent(t)}" class="hov-border" style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;padding:6px 11px;border:2px solid rgba(23,21,15,0.25);background:#FFFFFF;color:#17150F;">#${esc(t)}</a>`).join('')}</div>` : ''}
         ${shareBar(post)}
       </div>
     </section>

     ${related.length ? `
     <!-- KEEP READING -->
     <section data-section style="max-width:1320px;margin:0 auto;padding:60px 40px 40px;">
       <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:28px;">
         <h2 style="font-family:'Space Grotesk',sans-serif;font-size:clamp(28px,3vw,40px);font-weight:700;letter-spacing:-0.02em;margin:0;">Keep reading</h2>
         <a href="/blog.html" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;border-bottom:2px solid #F26522;padding-bottom:2px;">All stories →</a>
       </div>
       <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;">${related.map(blogCard).join('')}</div>
     </section>` : ''}

     <!-- CTA -->
     <section data-section style="max-width:1320px;margin:0 auto;padding:40px 40px 100px;">
       <div data-reveal class="af-post-cta" style="background:#141210;color:#F2EDE4;border:2px solid #17150F;box-shadow:7px 7px 0 #F26522;padding:44px 48px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;">
         <div style="max-width:620px;">
           <h2 style="font-family:'Space Grotesk',sans-serif;font-size:clamp(26px,2.6vw,36px);font-weight:700;line-height:1.1;margin:0;color:#FBF6EE;">Help write the next chapter.</h2>
           <p style="font-size:16px;color:#C9C2B6;margin:12px 0 0;line-height:1.6;">Every story here starts with young people and the partners who back them. Support the work or join it.</p>
         </div>
         <div style="display:flex;flex-wrap:wrap;gap:12px;">
           <a href="/donate.html" class="hov-paper" style="background:#F26522;color:#141210;padding:14px 22px;font-weight:700;font-size:15px;border:2px solid #F26522;">Donate</a>
           <a href="/contact.html" class="hov-cta" style="background:transparent;color:#FBF6EE;padding:14px 22px;font-weight:700;font-size:15px;border:2px solid #FBF6EE;">Get involved</a>
         </div>
       </div>
     </section>`
  );
}

function blogPostMissing() {
  return `<section data-section style="max-width:1320px;margin:0 auto;padding:90px 40px 120px;">
            ${stateBox('This story is not available', 'It may have been moved or unpublished. Browse the rest of the AFOSI blog instead.')}
            <div style="text-align:center;margin-top:28px;"><a href="/blog.html" style="font-family:'Space Grotesk',sans-serif;font-weight:700;border-bottom:2px solid #F26522;padding-bottom:2px;">← All stories</a></div>
          </section>`;
}

async function renderBlogPost() {
  const root = document.querySelector('[data-blog-post]');
  if (!root) return;
  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) {
    root.innerHTML = blogPostMissing();
    return;
  }
  try {
    const res = await blogAPI.getBySlug(slug);
    const post = res && res.data;
    if (!post) {
      root.innerHTML = blogPostMissing();
      return;
    }
    const description = post.excerpt || markdownToText(post.content, 160);
    document.title = `${post.title} - AFOSI Blog`;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', post.title);
    setMeta('meta[property="og:description"]', 'content', description);
    if (post.cover_image_url) setMeta('meta[property="og:image"]', 'content', post.cover_image_url);

    root.innerHTML = blogPostHTML(post, (res && res.related) || []);
    revealAll(Array.from(root.querySelectorAll('[data-reveal]')));

    const copyBtn = root.querySelector('[data-copy-link]');
    const copyStatus = root.querySelector('[data-copy-status]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          copyStatus.textContent = 'Link copied';
        } catch {
          copyStatus.textContent = 'Copy the address bar to share';
        }
        setTimeout(() => { copyStatus.textContent = ''; }, 3000);
      });
    }

    // A link to a heading (#sec-...) lands on it once the story is drawn.
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  } catch (err) {
    root.innerHTML = /not found/i.test(err.message || '')
      ? blogPostMissing()
      : `<section data-section style="max-width:1320px;margin:0 auto;padding:90px 40px 120px;">${stateBox('Unable to load this story', 'Please check your connection and try again shortly.')}</section>`;
    if (!/not found/i.test(err.message || '')) console.error('[CMS] blog post:', err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Boot
// ═════════════════════════════════════════════════════════════════════════════
(function boot() {
  const mode = document.body.dataset.cms;
  if (mode === 'news') renderNews();
  else if (mode === 'blog') renderBlog();
  else if (mode === 'blog-post') renderBlogPost();
  else if (mode === 'gallery') renderGallery();
  else if (mode === 'opportunities') renderOpportunities();
  else if (mode === 'opp-detail') renderOpportunityDetail();
  else if (mode === 'projects') renderProjects();
  else if (mode === 'project-detail') renderProjectDetail();
})();
