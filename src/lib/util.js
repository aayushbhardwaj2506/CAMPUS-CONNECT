'use strict';

/** ISO-8601 UTC timestamp, second precision (matches TEXT timestamp columns). */
function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** ISO timestamp `hours` hours from now. */
function isoPlusHours(hours) {
  return new Date(Date.now() + hours * 3600 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Human friendly relative time, e.g. "3h ago". */
function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(then)) return iso;
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd ago';
  return new Date(then).toLocaleDateString();
}

/** Format an ISO date/time for display. */
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Trim + collapse whitespace; returns '' for null/undefined. */
function clean(v) {
  return (v == null ? '' : String(v)).trim();
}

/** Escape a string for safe use inside a LIKE pattern, then wrap in %..%. */
function likeContains(term) {
  return '%' + clean(term).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

/** initials for avatar fallback */
function initials(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

module.exports = { nowIso, isoPlusHours, timeAgo, fmtDate, clean, likeContains, initials };
