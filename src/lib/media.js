'use strict';
/**
 * Turn whatever a person pasted into a link an <img> can load.
 *  - adds https:// when it is missing
 *  - Google Images result links (google.com/imgres?imgurl=…) -> the real image address
 *  - Google Drive share links -> a direct image link
 *  - Imgur page links -> a direct image link
 *  - (async) ordinary WEB PAGES (Pinterest pins, articles, Google share links …) -> the
 *    page's preview image (og:image / twitter:image)
 * Anything that is not http(s) gives '' (rejected).
 */
function directImageUrl(raw) {
  let u = String(raw == null ? '' : raw).trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;

  let m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || u.match(/drive\.google\.com\/open\?id=([\w-]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;

  m = u.match(/^https?:\/\/(?:www\.)?imgur\.com\/(?!a\/|gallery\/)([A-Za-z0-9]+)$/);
  if (m) return `https://i.imgur.com/${m[1]}.jpg`;

  try {
    const p = new URL(u);
    if (!/^https?:$/.test(p.protocol)) return '';
    // Google Images "view image" page: the real picture is in the imgurl parameter
    if (/(^|\.)google\.[a-z.]+$/i.test(p.hostname) && p.pathname === '/imgres') {
      const real = p.searchParams.get('imgurl');
      if (real) return directImageUrl(real);
    }
    return p.href;
  } catch (_e) {
    return '';
  }
}

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
const KNOWN_IMAGE_HOST = /(^|\.)(picsum\.photos|i\.imgur\.com|googleusercontent\.com)$|^drive\.google\.com$/i;

/** Block requests aimed at this machine or the local network (the server fetches pasted links). */
function isPrivateHost(host) {
  const h = String(host || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h.startsWith('[')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

function decodeHtml(t) {
  return String(t).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Like directImageUrl, but if the link is a normal web page it fetches the page and
 * returns its preview image. Falls back to the cleaned link if nothing better is found.
 * Never throws.
 */
async function resolveImage(raw) {
  const u = directImageUrl(raw);
  if (!u) return '';
  let parsed;
  try { parsed = new URL(u); } catch (_e) { return ''; }
  if (IMAGE_FILE.test(parsed.pathname + parsed.search) || KNOWN_IMAGE_HOST.test(parsed.hostname)) return u;
  if (isPrivateHost(parsed.hostname)) return '';
  try {
    const res = await fetch(u, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; CampusConnect/1.0; link preview)',
        accept: 'text/html,application/xhtml+xml,image/*;q=0.8',
      },
    });
    if (isPrivateHost(new URL(res.url).hostname)) return u;
    const type = res.headers.get('content-type') || '';
    if (type.startsWith('image/')) return res.url;
    if (!type.includes('html')) return u;
    const html = (await res.text()).slice(0, 1500000);
    const metas = html.match(/<meta\b[^>]*>/gi) || [];
    for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
      const nameRe = new RegExp('(?:property|name)=["\']' + key.replace(/[.:]/g, '\\$&') + '["\']', 'i');
      for (const tag of metas) {
        if (!nameRe.test(tag)) continue;
        const c = tag.match(/content=["']([^"']+)["']/i);
        if (!c) continue;
        const abs = directImageUrl(new URL(decodeHtml(c[1]), res.url).href);
        if (abs) return abs;
      }
    }
  } catch (e) { if (process.env.DEBUG_MEDIA) console.error('[media]', e.message); /* offline / blocked / timed out: keep the link as typed */ }
  return u;
}

module.exports = { directImageUrl, resolveImage, isPrivateHost };
