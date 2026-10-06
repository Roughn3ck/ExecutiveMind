// POST /api/inquiry — Executive Mind website inquiry endpoint.
// Receives form submissions from executivemind.io pages and relays them
// by email to admin@executivemind.io via Zoho SMTP over implicit TLS (465).
//
// Transport: minimal SMTP client over cloudflare:sockets connect().
// Credential: ZOHO_EM_ENDPOINT secret (Cloudflare Pages secret store) —
// a dedicated Zoho app-password. It is never in this repo and never in chat.
//
// Contract (aria memory/2026-10-06.md + Kris wire-up contract 2026-10-06):
//   POST JSON {name, company, email*, phone, package, message, subject?}
//   -> 200 {success:true,  message}
//   -> 400 {success:false, message}   validation
//   -> 429 {success:false, message}   per-IP throttle (best-effort, isolate-local)
//   -> 502 {success:false, message}   SMTP failure — frontends fall back to mailto
//   -> 503 {success:false, message}   endpoint not configured
// Frontends wired to this endpoint: index.html, let-the-agents-live.html, book.html.
// A 307 in _redirects keeps any cached copy posting the old /agent/send_form.php
// path flowing into this handler.

import { connect } from "cloudflare:sockets";

const SMTP_HOST = "smtppro.zoho.com.au";
const SMTP_PORT = 465;
const SMTP_USER = "admin@executivemind.io"; // the app-password owns this identity
const RECIPIENT = "admin@executivemind.io";
const FROM_NAME = "Executive Mind Website";
const ALLOWED_ORIGIN = "https://executivemind.io";
const RATE_LIMIT = 5; // inquiries per IP per window (humans; QR-card traffic)
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

function validEmail(v) {
  return (
    typeof v === "string" &&
    v.length <= 254 &&
    /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(v)
  );
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
async function smtpSend(appPassword, subject, replyTo, replyToName, bodyText) {
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
    await expect(2, btoa(appPassword)); // 235 authed
    await expect(2, "MAIL FROM:<" + SMTP_USER + ">"); // 250
    await expect(2, "RCPT TO:<" + RECIPIENT + ">"); // 250
    await expect(3, "DATA"); // 354

    const safeName = replyToName.replace(/["\\]/g, "'");
    const headers = [
      "From: " + FROM_NAME + " <" + SMTP_USER + ">",
      "To: <" + RECIPIENT + ">",
      "Reply-To: " + (replyToName ? (/^[\x20-\x7E]*$/.test(safeName) ? '"' + safeName + '"' : encodeHeaderWord(safeName)) + " <" + replyTo + ">" : "<" + replyTo + ">"),
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
    return json({ success: false, message: "Inquiry endpoint is not configured yet. Please email admin@executivemind.io directly." }, 503);
  }

  try {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) {
      return json({ success: false, message: "Too many inquiries from this address in a short time. Please email admin@executivemind.io directly." }, 429);
    }

    const ctype = (request.headers.get("content-type") || "").toLowerCase();
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ success: false, message: "Inquiry too large." }, 400);
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

    // honeypot — none of the site's forms have a "website" field
    if (clean(data.website, 100)) {
      return json({ success: true, message: "Thanks — your inquiry has been received." });
    }

    const email = clean(data.email, 254);
    if (!validEmail(email)) {
      return json({ success: false, message: "A valid email address is required." }, 400);
    }

    const name = clean(data.name, 200);
    const company = clean(data.company, 200);
    const phone = clean(data.phone, 60);
    const pkg = clean(data.package, 120);
    const message = clean(data.message, 5000);
    const clientSubject = clean(data.subject, 200);

    // preserve additional fields (parity with the legacy handler's extra-key pass-through)
    const KNOWN = new Set(["name", "company", "email", "phone", "package", "message", "subject", "website"]);
    const extras = [];
    for (const [k, v] of Object.entries(data)) {
      if (KNOWN.has(k)) continue;
      if (extras.length >= 8) break;
      const sv = clean(typeof v === "string" ? v : JSON.stringify(v), 300);
      if (sv) extras.push(clean(k, 40) + ": " + sv);
    }

    const subject = clientSubject
      ? clientSubject
      : "Website Inquiry — " + (pkg || "Discovery Call");

    const lines = [
      "New website inquiry via executivemind.io",
      "",
      pkg ? "Package: " + pkg : null,
      "Name: " + (name || "(not given)"),
      company ? "Company: " + company : null,
      "Email: " + email,
      phone ? "Phone: " + phone : null,
      extras.map((e) => "Additional — " + e),
      "",
      "Message:",
      message || "(no message)",
      "",
      "—",
      "Sent by the Executive Mind inquiry endpoint (POST /api/inquiry).",
    ].flat().filter((l) => l !== null);
    const bodyText = lines.join("\n");

    const replyName = name.replace(/["\\]/g, "'").slice(0, 120);

    await smtpSend(secret, subject, email, replyName, bodyText);
    return json({ success: true, message: "Thanks — your inquiry has been received. We'll be in touch shortly." });
  } catch (err) {
    console.error("inquiry endpoint failure:", err && err.message);
    return json({ success: false, message: "We couldn't send your inquiry just now — please email admin@executivemind.io directly." }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet() {
  return json({ success: false, message: "Method not allowed. POST an inquiry as JSON." }, 405);
}