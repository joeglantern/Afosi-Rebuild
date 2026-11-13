// Markdown for blog posts, rendered escape-first.
//
// Shared by the public post page (src/cms.js) and the dashboard's live
// preview (ADMIN/src/components/BlogAdminPanel.tsx), so what an editor
// previews is exactly what the site shows.
//
// Why not a Markdown library plus a sanitiser: posts are written by people
// with dashboard logins, and an account can be phished. Here no HTML from the
// source ever reaches the page. Every piece of text is escaped as it is
// emitted, and the only tags that can come out are the ones written below.
// Link and image addresses must be http(s), mailto (links only) or a path on
// this site; anything else (javascript:, data:, //evil.example) is dropped.
//
// Supported, which is what a blog post needs:
//   # ## ### ####  headings (# and ## both become h2: the page's h1 is the title)
//   **bold**  *italic*  _italic_  `code`  [text](url)  bare https:// links
//   - / * / + lists, 1. numbered lists, > quotes, --- rules, ``` code blocks
//   ![alt](url "caption") on its own line becomes a figure with a caption
//   a single line break inside a paragraph is kept as a line break

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

// A link or image address we are willing to put in an attribute, or null.
export function safeUrl(raw, { image = false } = {}) {
  const url = String(raw == null ? '' : raw).trim();
  if (!url) return null;
  // A path on this site, but not "//host", which is another site.
  if (/^\/(?![/\\])/.test(url) || (!image && url.startsWith('#'))) return url;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    if (!image && u.protocol === 'mailto:') return u.href;
  } catch {
    /* not a URL */
  }
  return null;
}

const isExternal = (href) => /^https?:\/\//i.test(href) && !/^https?:\/\/([a-z0-9-]+\.)*afosi\.org(\/|$)/i.test(href);

function anchor(href, inner) {
  const ext = isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${escapeHtml(href)}"${ext}>${inner}</a>`;
}

// Bold and italics on text that is ALREADY escaped. Escaping never produces
// * or _, so these patterns can only match what the writer typed, and they
// only ever wrap text in <strong>/<em>.
function emphasis(escaped) {
  return escaped
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?=[^\w]|$)/g, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?=[^\w]|$)/g, '$1<em>$2</em>');
}

// [text](url "title"), ![alt](url) inline, or a bare http(s) address.
const LINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"([^"\n]*)")?\s*\)|\bhttps?:\/\/[^\s<>()]*[^\s<>().,;:!?'"\]]/g;

function linksAndText(raw, opts) {
  let out = '';
  let last = 0;
  for (const m of raw.matchAll(LINK)) {
    out += emphasis(escapeHtml(raw.slice(last, m.index)));
    last = m.index + m[0].length;
    if (m[3] === undefined) {
      // Bare address.
      const href = safeUrl(m[0]);
      out += href ? anchor(href, escapeHtml(m[0])) : escapeHtml(m[0]);
    } else if (m[1]) {
      // Inline image.
      const src = safeUrl(m[3], { image: true });
      out += src
        ? `<img src="${escapeHtml(opts.imageSrc(src, 900))}" alt="${escapeHtml(m[2])}" loading="lazy" decoding="async">`
        : escapeHtml(m[2]);
    } else {
      const href = safeUrl(m[3]);
      const text = emphasis(escapeHtml(m[2] || m[3]));
      out += href ? anchor(href, text) : text;
    }
  }
  return out + emphasis(escapeHtml(raw.slice(last)));
}

// Code spans first: nothing inside backticks is interpreted.
function inline(raw, opts) {
  return raw
    .split(/(`[^`\n]+`)/g)
    .map((part) =>
      part.length > 2 && part.startsWith('`') && part.endsWith('`')
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : linksAndText(part, opts)
    )
    .join('');
}

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const FIGURE = /^\s*!\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"([^"\n]*)")?\s*\)\s*$/;

const startsBlock = (line) =>
  HEADING.test(line) || RULE.test(line) || FENCE.test(line) || QUOTE.test(line) ||
  BULLET.test(line) || NUMBERED.test(line) || FIGURE.test(line);

export function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .replace(/[*_`[\]()#]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function blocks(lines, opts, depth) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    if (FENCE.test(line)) {
      const fence = line.trim().slice(0, 3);
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
      i++; // the closing fence, if there is one
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      const level = Math.max(2, h[1].length);
      let id = depth === 0 ? slugifyHeading(h[2]) : '';
      if (id) {
        // Two headings with the same text still get different anchors.
        const base = id;
        for (let n = 2; opts.ids.has(id); n++) id = `${base}-${n}`;
        opts.ids.add(id);
      }
      const idAttr = id ? ` id="${escapeHtml(opts.idPrefix + id)}"` : '';
      out.push(`<h${level}${idAttr}>${inline(h[2], opts)}</h${level}>`);
      i++;
      continue;
    }

    if (RULE.test(line)) { out.push('<hr>'); i++; continue; }

    const fig = line.match(FIGURE);
    if (fig) {
      const src = safeUrl(fig[2], { image: true });
      if (src) {
        const caption = fig[3] ? `<figcaption>${inline(fig[3], opts)}</figcaption>` : '';
        out.push(
          `<figure><img src="${escapeHtml(opts.imageSrc(src, 1400))}" alt="${escapeHtml(fig[1])}" loading="lazy" decoding="async">${caption}</figure>`
        );
      }
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && lines[i].trim() && QUOTE.test(lines[i])) inner.push(lines[i++].match(QUOTE)[1]);
      // Quotes nest at most a few levels; deeper ">" is shown as text.
      out.push(`<blockquote>${depth < 3 ? blocks(inner, opts, depth + 1) : `<p>${inline(inner.join(' '), opts)}</p>`}</blockquote>`);
      continue;
    }

    const isBullet = BULLET.test(line);
    if (isBullet || NUMBERED.test(line)) {
      const pattern = isBullet ? BULLET : NUMBERED;
      const items = [];
      const start = isBullet ? 1 : Number(line.match(NUMBERED)[1]);
      while (i < lines.length && lines[i].trim()) {
        const m = lines[i].match(pattern);
        if (m) items.push([isBullet ? m[1] : m[2]]);
        else if (startsBlock(lines[i]) || !items.length) break;
        else items[items.length - 1].push(lines[i].trim()); // a wrapped item
        i++;
      }
      const lis = items.map((parts) => `<li>${parts.map((p) => inline(p, opts)).join('<br>')}</li>`).join('');
      out.push(isBullet ? `<ul>${lis}</ul>` : `<ol${start !== 1 ? ` start="${start}"` : ''}>${lis}</ol>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && (!para.length || !startsBlock(lines[i]))) para.push(lines[i++].trim());
    out.push(`<p>${para.map((p) => inline(p, opts)).join('<br>')}</p>`);
  }
  return out.join('\n');
}

// opts.imageSrc(url, width) lets the site send images through its resize
// proxy; it receives an address that has already passed safeUrl.
// opts.idPrefix namespaces heading anchors.
export function renderMarkdown(source, opts = {}) {
  const o = { imageSrc: (url) => url, idPrefix: '', ...opts, ids: new Set() };
  const lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
  return blocks(lines, o, 0);
}

// The text with its Markdown taken out: for excerpts and meta descriptions.
export function markdownToText(source, maxLength = 0) {
  const text = String(source == null ? '' : source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}
