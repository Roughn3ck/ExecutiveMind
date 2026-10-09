// functions/api/_guard.js — shared guard module for the EM Pages Function endpoints.
// Underscore-prefixed files are skipped by the Pages router — this is a private
// module imported by /api/inquiry and /api/testimonial so the two cannot drift.
//
// Consolidates the Garrison security-review fixes (both reports, 2026-10-09):
//   - Origin / Sec-Fetch-Site enforcement: CORS headers only gate *reading* a
//     response; a foreign Origin is now rejected server-side, and form-encoded
//     bodies additionally require a same-origin Origin/Referer attestation.
//   - Rate limiting: per-isolate map with aged + oldest-first eviction (a burst
//     of distinct IPs can no longer wipe the whole table) plus a durable KV
//     layer (RATE_KV binding) keyed by SHA-256(ip|scope) — no raw PII in the
//     namespace. The KV layer fails open; the isolate layer still applies.
//   - clean(): strips C0/C1/DEL + Unicode separators, bidi and format controls
//     (ZWJ kept for emoji, ZWNJ kept for legitimate scripts), NFC-normalises,
//     collapses whitespace, and slices by code points (no split surrogates).
//   - encodeHeaderWord(): RFC2047 B-words chunked to stay <= 75 chars each,
//     never splitting a code point or multi-byte sequence.
//   - smtpSend(): shared minimal SMTPS client. An AUTH-stage 5xx (expired or
//     rotated app-password) throws err.smtpAuthFailure so callers return 503
//     "not configured" instead of a retry-forever 502. Single AUTH attempt,
//     never retried (Zoho lockout discipline).
//
// Credential rule (unchanged): ZOHO_EM_ENDPOINT is read from env at runtime by
// the endpoints — it is never in this repo, never printed, never in chat.

import { connect } from "cloudflare:sockets";

const SMTP_HOST = "smtppro.zoho.com.au";
const SMTP_PORT = 465;
const SMTP_USER = "admin@executivemind.io"; // the app-password owns this identity
const RECIPIENT = "admin@executivemind.io";
const FROM_NAME = "Executive Mind Website";
const ALLOWED_ORIGIN = "https://executivemind.io";
const RATE_LIMIT = 5; // per IP per scope per window
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_TRACKED = 5000; // isolate-map ceiling (aged eviction, no global wipe)
const SMTP_TIMEOUT_MS = 20 * 1000; // whole SMTP conversation budget

export const MAX_BODY_BYTES = 20000; // request body cap, BYTES (pre + post read)

export const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

export function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...(extraHeaders || {}) },
  });
}

// C0/C1/DEL + soft hyphen + zero-width space + LRM/RLM + Unicode line/paragraph
// separators + bidi embeddings/isolates + word-joiner/invisible operators + BOM.
// ZWJ (U+200D, emoji sequences) and ZWNJ (U+200C, e.g. Indic scripts) are KEPT.
const CTRL_RE =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

// Strip control chars (CR/LF included — header-injection guard), normalise to
// NFC, collapse whitespace, trim, cap by CODE POINTS (no split surrogate pairs).
export function clean(value, maxLen) {
  if (typeof value !== "string") return "";
  const s = value
    .replace(CTRL_RE, " ")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  return [...s].slice(0, maxLen).join("");
}

function b64FromBytes(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function utf8Base64(text) {
  return b64FromBytes(new TextEncoder().encode(text));
}

// RFC2047-encode non-ASCII header text (subject / display names). Raw 8-bit
// bytes in headers are inbound-filter-DROPPED by Zoho (verified live
// 2026-10-07: ASCII subjects delivered, UTF-8 ones vanished). Long values are
// split into multiple B-words of <= 45 payload bytes (<= 75 chars each incl.
// delimiters), never splitting a code point. Chunks are contiguous, and the
// separator space between adjacent encoded words is ignored by conformant
// decoders — so the words decode back to the exact original string.
export function encodeHeaderWord(text) {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  const enc = new TextEncoder();
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const ch of text) {
    const b = enc.encode(ch);
    if (size + b.length > 45) {
      if (cur.length) chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(...b);
    size += b.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((c) => "=?UTF-8?B?" + b64FromBytes(Uint8Array.from(c)) + "?=").join(" ");
}

export function rfc2822Date(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p2 = (n) => String(n).padStart(2, "0");
  return (
    days[d.getUTCDay()] + ", " + d.getUTCDate() + " " + months[d.getUTCMonth()] + " " +
    d.getUTCFullYear() + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" +
    p2(d.getUTCSeconds()) + " +0000"
  );
}

// Server-side origin enforcement — CORS response headers only gate READING the
// reply; they cannot stop a third-party page from ISSUING the POST (form posts
// and text/plain fetches are CORS-simple and never preflight).
//   - Origin present: must be the site itself, else reject.
//   - Sec-Fetch-Site "cross-site": reject even without Origin (old browsers).
//   - requireAttestation (non-JSON bodies): must carry a same-origin Origin or
//     Referer; header-less clients are rejected.
export function originOk(request, requireAttestation) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === ALLOWED_ORIGIN;
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return false;
  if (requireAttestation) {
    const ref = request.headers.get("Referer");
    return !!ref && (ref === ALLOWED_ORIGIN || ref.startsWith(ALLOWED_ORIGIN + "/"));
  }
  return true;
}

// ---- rate limiting: isolate layer (always) + KV layer (when RATE_KV bound) ----
const hits = new Map(); // key: scope + ":" + ip -> array of hit timestamps

function isolateRateLimited(scope, ip, now) {
  if (hits.size >= RATE_MAX_TRACKED) {
    for (const [k, arr] of hits) { // drop fully-expired keys first
      if (hits.size < RATE_MAX_TRACKED) break;
      if (arr.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
    for (const k of hits.keys()) { // still over: drop oldest-inserted keys
      if (hits.size < RATE_MAX_TRACKED) break;
      hits.delete(k);
    }
  }
  const key = scope + ":" + ip;
  const arr = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Durable KV layer: fixed-window counter per (scope, IP). Keys are SHA-256
// hashes — mild obscurity only, NOT PII armor (unsalted IPv4 hashes reverse in
// minutes on a GPU — Garrison 2026-10-09). What makes the counters safe: the
// TTL (the throttle forgets), the namespace stays export-free, and the
// throttle is its only reader. Standing decision N2 (Garrison): no per-IP
// audit trail, ever; if forensics are genuinely forced, the ceiling is
// aggregate-only per-scope daily counters, on Kris's explicit word, added
// forward, never retroactive. Last-write-wins races undercount slightly —
// deliberate best-effort; the isolate layer still applies underneath. Fails
// open on any KV error (a KV outage must not take the form down) and fires a
// bounded aggregate alert so the outage is discovered by a metric, not by
// 429s going missing.
const kvAlertAt = new Map(); // scope -> last alert timestamp (1/hr/scope/isolate bound)

function kvAlertEmail(env, scope) {
  const now = Date.now();
  if (now - (kvAlertAt.get(scope) || 0) < RATE_WINDOW_MS) return null;
  kvAlertAt.set(scope, now);
  const subject = "Website Endpoint Watch — RATE_KV unavailable (rate limit degraded)";
  const bodyText = [
    "Automated aggregate watch from the Executive Mind endpoints — no submission data attached.",
    "",
    "The KV-backed rate limiter (" + scope + " scope) could not reach the RATE_KV namespace.",
    "Requests are still accepted; rate limiting has degraded to the per-isolate",
    "best-effort layer (fail-open by design). At most one alert per hour.",
    "",
    "Check Cloudflare KV status and the Pages functions logs for KV read/write errors.",
    "",
    "—",
    "Sent by the KV-error watch in functions/api/_guard.js.",
  ].join("\n");
  return smtpSend(env && env.ZOHO_EM_ENDPOINT, subject, bodyText).catch(() => {});
}

export async function rateLimited(env, scope, ip, ctx) {
  if (isolateRateLimited(scope, ip, Date.now())) return true;
  if (env && env.RATE_KV) {
    try {
      const key = "rl:" + scope + ":" + (await sha256Hex(ip + "|" + scope));
      const cur = parseInt((await env.RATE_KV.get(key)) || "0", 10);
      if (cur >= RATE_LIMIT) return true;
      await env.RATE_KV.put(key, String(cur + 1), { expirationTtl: RATE_WINDOW_MS / 1000 });
    } catch (_) {
      // KV unavailable — fail open; the isolate layer already counted this hit.
      // Bounded aggregate alert surfaces the outage in Oyola's inbox scan.
      if (ctx && typeof ctx.waitUntil === "function") {
        const alert = kvAlertEmail(env, scope);
        if (alert) ctx.waitUntil(alert);
      }
    }
  }
  return false;
}

// ---- minimal SMTPS client (implicit TLS via cloudflare:sockets) ----
// Shared by /api/inquiry (with opts.replyTo/replyToName) and /api/testimonial.
// AUTH-stage 5xx replies throw err.smtpAuthFailure — callers map that to 503.
export async function smtpSend(appPassword, subject, bodyText, opts = {}) {
  const socket = connect(
    { hostname: SMTP_HOST, port: SMTP_PORT },
    { secureTransport: "on" }
  );
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";

  async function readLine() {
    for (;;) {
      const idx = buf.indexOf("\r\n");
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        return line;
      }
      const { done, value } = await reader.read();
      if (done) {
        if (buf.length) {
          const l = buf;
          buf = "";
          return l;
        }
        return null;
      }
      buf += decoder.decode(value, { stream: true });
    }
  }

  async function readReply() {
    let code = 0;
    const lines = [];
    for (let i = 0; i < 16; i++) {
      const line = await readLine();
      if (line === null) throw new Error("SMTP connection closed");
      lines.push(line);
      const m = line.match(/^(\d{3})([ -])/);
      if (!m) throw new Error("SMTP malformed reply: " + line.slice(0, 80));
      code = parseInt(m[1], 10);
      if (m[2] === " ") break;
    }
    return { code, text: lines.join(" | ") };
  }

  async function expect(cls, cmd) {
    if (cmd !== undefined) await writer.write(encoder.encode(cmd + "\r\n"));
    const r = await readReply();
    if (Math.floor(r.code / 100) !== cls) {
      throw new Error("SMTP wanted " + cls + "xx, got " + r.code + ": " + r.text.slice(0, 140));
    }
    return r;
  }

  const flow = async () => {
    await expect(2); // 220 banner
    await expect(2, "EHLO executivemind.io"); // 250 (multiline)
    try {
      await expect(3, "AUTH LOGIN"); // 334 username prompt
      await expect(3, utf8Base64(SMTP_USER)); // 334 password prompt — byte-safe if ever non-ASCII
      await expect(2, utf8Base64(appPassword)); // 235 authed — single attempt, never retry a 535
    } catch (e) {
      // An AUTH-stage 5xx means the app-password is bad/expired — distinguish it
      // so callers serve 503 (not configured) instead of a retry-forever 502.
      if (e && /got 5\d\d/.test(e.message || "")) {
        const err = new Error("SMTP AUTH REJECTED (5xx) — ZOHO_EM_ENDPOINT unusable");
        err.smtpAuthFailure = true;
        throw err;
      }
      throw e;
    }
    await expect(2, "MAIL FROM:<" + SMTP_USER + ">"); // 250 — envelope, raw address per SMTP
    await expect(2, "RCPT TO:<" + RECIPIENT + ">"); // 250
    await expect(3, "DATA"); // 354

    let replyHeader = null;
    if (opts.replyTo) {
      const safeName = String(opts.replyToName || "").replace(/["\\]/g, "'").slice(0, 120);
      replyHeader = "Reply-To: " + (safeName
        ? (/^[\x20-\x7E]*$/.test(safeName) ? '"' + safeName + '"' : encodeHeaderWord(safeName)) + " <" + opts.replyTo + ">"
        : "<" + opts.replyTo + ">");
    }

    const headers = [
      "From: " + FROM_NAME + " <" + SMTP_USER + ">", // ASCII constants; addresses stay raw per RFC5322
      "To: <" + RECIPIENT + ">",
      replyHeader,
      "Subject: " + encodeHeaderWord(subject),
      "Date: " + rfc2822Date(new Date()),
      "Message-ID: <" + crypto.randomUUID() + "@executivemind.io>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
    ].filter(Boolean).join("\r\n");
    const b64lines = utf8Base64(bodyText).match(/.{1,76}/g).join("\r\n");

    await writer.write(encoder.encode(headers + "\r\n\r\n" + b64lines + "\r\n.\r\n"));
    await expect(2); // 250 queued
    try {
      await expect(2, "QUIT"); // 221
    } catch (_) {
      // best effort — message is already queued
    }
  };

  let timer;
  try {
    await Promise.race([
      flow(),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("SMTP timeout")), SMTP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    try { writer.releaseLock(); } catch (_) {}
    try { reader.cancel(); } catch (_) {}
    try { socket.close(); } catch (_) {}
  }
}