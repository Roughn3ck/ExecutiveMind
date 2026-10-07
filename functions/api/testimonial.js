// POST /api/testimonial — Executive Mind "Leave a testimonial" endpoint.
// Receives testimonial submissions from the homepage Testimonials section and
// relays them by email to admin@executivemind.io via Zoho SMTP over implicit TLS (465).
//
// Port of the TCN review system (testimonials.md, 2026-10-07) onto EM's proven
// direct-send lane: TCN parks submissions in KV for a host-side relay because
// its Worker cannot reach Gmail SMTP from Cloudflare IPs; EM's Pages runtime
// CAN reach Zoho SMTPS (verified live 2026-10-07 via /api/inquiry), so the
// submission goes straight from the form to the inbox — no KV, no relay,
// nothing stored anywhere. No email address is collected (TCN design).
//
// Publishing rule (TCN model, carried over): a human reads every submission;
// published testimonials are hand-curated into the page copy. Nothing auto-renders.
//
// Transport + credential: identical to /api/inquiry — minimal SMTP client over
// cloudflare:sockets, ZOHO_EM_ENDPOINT secret (Cloudflare Pages secret store,
// a dedicated Zoho app-password for admin@). It is never in this repo, never in chat.
//
// Contract:
//   POST JSON {name*, role, rating 0-5, text*, website(honeypot)}
//   -> 200 {success:true,  message}   emailed to admin@ inbox
//   -> 400 {success:false, message}   validation
//   -> 429 {success:false, message}   per-IP throttle (best-effort, isolate-local)
//   -> 502 {success:false, message}   SMTP failure
//   -> 503 {success:false, message}   endpoint not configured
// Frontends wired to this endpoint: index.html #testimonials form.
// Subject shape: "Website Testimonial — <Name> (<n>/5)" for Oyola's inbox triage.

import { connect } from "cloudflare:sockets";

const SMTP_HOST = "smtppro.zoho.com.au";
const SMTP_PORT = 465;
const SMTP_USER = "admin@executivemind.io"; // the app-password owns this identity
const RECIPIENT = "admin@executivemind.io";
const FROM_NAME = "Executive Mind Website";
const ALLOWED_ORIGIN = "https://executivemind.io";
const RATE_LIMIT = 5; // testimonials per IP per window
const RATE_WINDOW_MS = 60 * 60 * 1000;
const SMTP_TIMEOUT_MS = 20 * 1000; // whole SMTP conversation budget
const MAX_BODY_BYTES = 20000; // raw request body cap

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

// ---- per-isolate best-effort rate limiting (KV-backed throttle = fast-follow) ----
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear(); // crude memory guard
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

// ---- helpers ----
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

// strip control chars (CR/LF included — header-injection guard), collapse ws, cap
function clean(value, maxLen) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// RFC2047-encode non-ASCII header text (subject / display names).
// Raw 8-bit bytes in headers get inbound-filter-dropped by Zoho —
// verified live 2026-10-07: ASCII subjects delivered, UTF-8 ones vanished.
function encodeHeaderWord(text) {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return "=?UTF-8?B?" + utf8Base64(text) + "?=";
}

function rfc2822Date(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p2 = (n) => String(n).padStart(2, "0");
  return (
    days[d.getUTCDay()] + ", " + d.getUTCDate() + " " + months[d.getUTCMonth()] + " " +
    d.getUTCFullYear() + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" +
    p2(d.getUTCSeconds()) + " +0000"
  );
}

// ---- minimal SMTPS client (implicit TLS via cloudflare:sockets) ----
// Same proven conversation as /api/inquiry minus the Reply-To header: the
// testimonial form deliberately collects no email address (TCN design).
async function smtpSend(appPassword, subject, bodyText) {
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
    await expect(3, "AUTH LOGIN"); // 334 username prompt
    await expect(3, btoa(SMTP_USER)); // 334 password prompt
    await expect(2, btoa(appPassword)); // 235 authed — single attempt, never retry a 535
    await expect(2, "MAIL FROM:<" + SMTP_USER + ">"); // 250
    await expect(2, "RCPT TO:<" + RECIPIENT + ">"); // 250
    await expect(3, "DATA"); // 354

    const headers = [
      "From: " + FROM_NAME + " <" + SMTP_USER + ">",
      "To: <" + RECIPIENT + ">",
      "Subject: " + encodeHeaderWord(subject),
      "Date: " + rfc2822Date(new Date()),
      "Message-ID: <" + crypto.randomUUID() + "@executivemind.io>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
    ].join("\r\n");
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

// ---- handlers ----
export async function onRequestPost(context) {
  const { request, env } = context;
  const secret =
    (env && env.ZOHO_EM_ENDPOINT) ||
    (typeof process !== "undefined" && process.env ? process.env.ZOHO_EM_ENDPOINT : undefined);
  if (!secret) {
    return json({ success: false, message: "Testimonial endpoint is not configured yet. Please email admin@executivemind.io directly." }, 503);
  }

  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) {
      return json({ success: false, message: "Too many submissions from this address in a short time. Please try again later." }, 429);
    }

    const ctype = (request.headers.get("content-type") || "").toLowerCase();
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ success: false, message: "Submission too large." }, 400);
    }

    let data = {};
    if (ctype.includes("application/json")) {
      try { data = JSON.parse(raw); } catch { return json({ success: false, message: "Invalid JSON body." }, 400); }
    } else if (ctype.includes("form-urlencoded") || ctype.includes("multipart/form-data")) {
      data = Object.fromEntries(new URLSearchParams(raw));
    } else {
      try { data = JSON.parse(raw); } catch { return json({ success: false, message: "Unsupported content type." }, 400); }
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) data = {};

    // honeypot — none of the site's forms have a visible "website" field
    if (clean(data.website, 100)) {
      return json({ success: true, message: "Thanks — your testimonial has been sent." });
    }

    const name = clean(data.name, 200);
    const text = clean(data.text, 5000);
    const role = clean(data.role, 200);
    let rating = parseInt(data.rating, 10);
    if (!Number.isFinite(rating)) rating = 0;
    rating = Math.min(5, Math.max(0, rating));

    if (!name) {
      return json({ success: false, message: "Your name is required." }, 400);
    }
    if (!text) {
      return json({ success: false, message: "Please add a few words — the wall runs on real words." }, 400);
    }

    const stars = rating > 0 ? "★".repeat(rating) + "☆".repeat(5 - rating) + " (" + rating + "/5)" : "(no star rating given)";
    const subject = "Website Testimonial — " + name.slice(0, 80) + (rating > 0 ? " (" + rating + "/5)" : "");

    const lines = [
      "New testimonial via executivemind.io",
      "",
      "Rating: " + stars,
      "Name: " + name,
      role ? "Role & company: " + role : null,
      "",
      "Their words:",
      text,
      "",
      "—",
      "Sent by the Executive Mind testimonial endpoint (POST /api/testimonial).",
    ].filter((l) => l !== null);
    const bodyText = lines.join("\n");

    await smtpSend(secret, subject, bodyText);
    return json({ success: true, message: "Thank you — your testimonial has been sent. It will appear on the wall once approved." });
  } catch (err) {
    console.error("testimonial endpoint failure:", err && err.message);
    return json({ success: false, message: "We couldn't send your testimonial just now — please try again later." }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet() {
  return json({ success: false, message: "Method not allowed. POST a testimonial as JSON." }, 405);
}