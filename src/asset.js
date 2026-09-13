// AFOSI asset tag lookup.
//
// Every asset in the office carries a tag printed with a Code 128 barcode of
// its number. A barcode cannot open a page on its own, so people arrive here
// two ways: by typing the number from the tag, or by putting the cursor in the
// lookup box and scanning — a handheld scanner types the number and presses
// Enter, which submits the form. Either lands on
//   https://afosi.org/asset.html?id=AFOSI-014
// This reads the public register (public/data/assets.json, rebuilt from the
// spreadsheet by tools/build-asset-register.py) and renders that one record.
//
// The register deliberately carries no purchase values — see the note in the
// build script.

const DATA_URL = '/data/assets.json';
const CONTACT_EMAIL = 'info@afosi.org';

const CONDITION_STYLE = {
  Good: { bg: '#2E7D32', fg: '#FBF6EE', label: 'Good condition' },
  Bad: { bg: '#B3261E', fg: '#FBF6EE', label: 'Needs attention' },
  Fair: { bg: '#C9922E', fg: '#141210', label: 'Fair condition' },
};

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Accepts anything a person or a barcode scanner might send: the AFOSI/014 the
// scanner types, AFOSI-014, afosi014, plain 014, or a longer register tag like
// AFOSI/015/Childfund.
function normalise(raw) {
  if (!raw) return '';
  const digits = String(raw).match(/(\d{1,4})/);
  return digits ? `AFOSI-${digits[1].padStart(3, '0')}` : '';
}

// ── Pieces ───────────────────────────────────────────────────────────────────
function verifiedBadge() {
  return `
    <span style="display:inline-flex;align-items:center;gap:9px;background:#17150F;color:#FBF6EE;padding:9px 15px;font-family:'Space Mono',monospace;font-size:11.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F26522" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      Verified AFOSI property
    </span>`;
}

function detailRow(label, value) {
  if (!value) return '';
  return `
    <div style="display:flex;flex-wrap:wrap;gap:6px 24px;padding:18px 0;border-bottom:1px solid rgba(23,21,15,0.12);">
      <div style="flex:1 1 130px;font-family:'Space Mono',monospace;font-size:11.5px;letter-spacing:0.14em;text-transform:uppercase;color:#8A8175;padding-top:3px;">${esc(label)}</div>
      <div style="flex:99 1 260px;min-width:0;font-size:17px;font-weight:600;word-break:break-word;">${esc(value)}</div>
    </div>`;
}

function lookupForm(prefill) {
  return `
    <form data-asset-lookup style="display:flex;flex-wrap:wrap;gap:12px;margin:28px 0 0;max-width:460px;">
      <input name="tag" value="${esc(prefill || '')}" placeholder="e.g. AFOSI/014" aria-label="Asset tag number"
        autofocus autocomplete="off" autocapitalize="characters" spellcheck="false"
        style="flex:1 1 200px;min-width:0;background:#FBF6EE;border:2px solid #17150F;padding:15px 16px;font-family:'Space Mono',monospace;font-size:15px;color:#17150F;outline:none;">
      <button type="submit" class="hov-ink" style="cursor:pointer;background:#F26522;color:#141210;border:2px solid #17150F;padding:15px 28px;font-family:'Manrope',sans-serif;font-size:15px;font-weight:700;">Look up</button>
    </form>`;
}

// ── Views ────────────────────────────────────────────────────────────────────
function assetHTML(asset) {
  const cond = CONDITION_STYLE[asset.condition] || { bg: '#5A5346', fg: '#FBF6EE', label: asset.condition };

  return `
  <section data-section style="max-width:1320px;margin:0 auto;padding:48px 40px 20px;">
    <div style="max-width:880px;animation:rise 0.8s cubic-bezier(.2,.6,.2,1) both;">
      ${verifiedBadge()}
      <div style="font-family:'Space Mono',monospace;font-size:clamp(15px,2.4vw,19px);font-weight:700;letter-spacing:0.16em;color:#F26522;margin:26px 0 10px;">${esc(asset.tag)}</div>
      <h1 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(36px,5.4vw,72px);line-height:1.03;letter-spacing:-0.03em;margin:0;">${esc(asset.name)}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin:24px 0 0;">
        <span style="background:${cond.bg};color:${cond.fg};padding:8px 15px;font-size:13.5px;font-weight:700;">${esc(cond.label)}</span>
        <span style="border:2px solid #17150F;padding:6px 15px;font-size:13.5px;font-weight:700;">${esc(asset.category)}</span>
      </div>
    </div>
  </section>

  <section data-section style="max-width:1320px;margin:0 auto;padding:24px 40px 60px;">
    <div style="max-width:880px;border-top:2px solid #17150F;">
      ${detailRow('Asset tag', asset.tag)}
      ${detailRow('Description', asset.description)}
      ${detailRow('Category', asset.category)}
      ${detailRow('Assigned to', asset.custodian)}
      ${detailRow('Condition', asset.condition)}
      ${detailRow('Funded by', asset.donor)}
      ${detailRow('Owner', 'Action for Sustainability Initiative (AFOSI)')}
    </div>
  </section>

  <section style="background:#17150F;color:#FBF6EE;">
    <div data-section style="max-width:1320px;margin:0 auto;padding:72px 40px;display:flex;justify-content:space-between;align-items:center;gap:40px;flex-wrap:wrap;">
      <div style="max-width:620px;">
        <h2 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(28px,3.6vw,46px);line-height:1.06;letter-spacing:-0.02em;margin:0;">Found this item outside our office?</h2>
        <p style="font-size:17px;color:#B8B1A4;margin:16px 0 0;">This item belongs to AFOSI. If you have found it, or you are staff reporting damage or a transfer, quote the tag number <strong style="color:#FBF6EE;">${esc(asset.tag)}</strong>.</p>
      </div>
      <a href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('AFOSI asset ' + asset.tag)}" class="hov-paper" style="background:#F26522;color:#141210;padding:20px 38px;font-size:17px;font-weight:700;white-space:nowrap;">Report this asset →</a>
    </div>
  </section>`;
}

function notFoundHTML(query) {
  const intro = query
    ? `We have no asset registered as <strong>${esc(query)}</strong>. Check the number printed on the tag, or type it below.`
    : 'Every AFOSI asset carries a numbered tag. Type the number printed on it below &mdash; or scan the tag straight into the box with a barcode scanner &mdash; to see the item&rsquo;s details.';
  return `
  <section data-section style="max-width:1320px;margin:0 auto;padding:90px 40px 110px;">
    <div style="max-width:640px;">
      <span style="display:inline-flex;align-items:center;gap:10px;"><span style="width:10px;height:10px;background:#F26522;"></span><span style="font-family:'Space Grotesk',sans-serif;font-size:13.5px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;">AFOSI asset register</span></span>
      <h1 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(34px,5vw,60px);line-height:1.04;letter-spacing:-0.03em;margin:16px 0 0;">${query ? 'Tag not found' : 'Scan or enter a tag'}</h1>
      <p style="font-size:17px;color:#5A5346;margin:18px 0 0;">${intro}</p>
      ${lookupForm(query)}
      <p style="font-size:15px;color:#8A8175;margin:26px 0 0;">Something wrong with a tag? <a href="mailto:${CONTACT_EMAIL}" style="color:#F26522;font-weight:700;">${CONTACT_EMAIL}</a></p>
    </div>
  </section>`;
}

function errorHTML() {
  return `
  <section data-section style="max-width:1320px;margin:0 auto;padding:110px 40px;text-align:center;">
    <h1 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(30px,4.4vw,52px);margin:0 0 14px;">Register unavailable</h1>
    <p style="font-size:17px;color:#5A5346;max-width:520px;margin:0 auto 26px;">We could not load the asset register. Please check your connection and try again.</p>
    <a href="/" class="hov-ink" style="display:inline-block;background:#F26522;color:#141210;padding:15px 30px;font-weight:700;">← Back to afosi.org</a>
  </section>`;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
function wireLookup(root) {
  const form = root.querySelector('[data-asset-lookup]');
  if (!form) return;
  // The autofocus attribute only acts while the browser parses the original
  // HTML, and this form is inserted afterwards — so focus it by hand. It is
  // what lets someone point a handheld scanner at a tag and have the number
  // land in the box without touching the page. Scanners send Enter at the end,
  // which submits the form.
  const field = form.elements.tag;
  field.focus();
  field.select();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = form.elements.tag.value.trim();
    location.search = `?id=${encodeURIComponent(normalise(raw) || raw)}`;
  });
}

(async function renderAsset() {
  const root = document.querySelector('[data-asset-detail]');
  if (!root) return;

  const raw = new URLSearchParams(location.search).get('id') || '';
  const id = normalise(raw);

  let register;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    register = await res.json();
  } catch (err) {
    console.error('[assets] register:', err);
    root.innerHTML = errorHTML();
    return;
  }

  const asset = (register.assets || []).find((a) => a.id === id);
  if (!asset) {
    document.title = 'Asset lookup — AFOSI';
    root.innerHTML = notFoundHTML(raw);
    wireLookup(root);
    return;
  }

  document.title = `${asset.tag} · ${asset.name} — AFOSI`;
  root.innerHTML = assetHTML(asset);
})();
