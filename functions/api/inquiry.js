// POST /api/inquiry — Executive Mind website inquiry endpoint.
// Receives form submissions from executivemind.io pages and relays them
// by email to admin@executivemind.io via Zoho SMTP over implicit TLS (465).
//
// Transport + credential: ZOHO_EM_ENDPOINT secret (Cloudflare Pages secret
// store) — a dedicated Zoho app-password. Read from env at runtime only;
// never in this repo and never in chat. If AUTH is rejected (expired/rotated
// password) the endpoint serves 503, not a retry-forever 502.
//
// 2026-10-09 hardening batch (Garrison reviews, both reports) — shared guard
// logic lives in ./_guard.js, identical to /api/testimonial: server-side
// Origin/Sec-Fetch-Site enforcement (form-encoded requires same-origin
// attestation; multipart dropped), KV-backed rate limiting over the aged
// isolate map, byte-accurate body cap, honeypot with identical success copy,
// Retry-After on 429, Allow on 405. Reply-To / extras pass-through / client
// subject passthrough preserved unchanged.
//
// Contract (aria memory/2026-10-06.md + Kris wire-up contract 2026-10-06):
//   POST JSON {name, company, email*, phone, package, message, subject?, website(honeypot)}
//   -> 200 {success:true,  message}
//   -> 400 {success:false, message}   validation
//   -> 403 {success:false, message}   cross-origin POST rejected
//   -> 429 {success:false, message}   per-IP throttle (isolate + KV)
//   -> 502 {success:false, message}   SMTP failure — frontends fall back to mailto
//   -> 503 {success:false, message}   endpoint not configured / AUTH rejected
// Frontends wired to this endpoint: index.html, let-the-agents-live.html, book.html.
// A 307 in _redirects keeps any cached copy posting the old /agent/send_form.php
// path flowing into this handler.

import { json, clean, rateLimited, originOk, smtpSend, CORS, MAX_BODY_BYTES } from "./_guard.js";

const SCOPE = "inquiry";
const SUCCESS_MESSAGE = "Thanks — your inquiry has been received. We'll be in touch shortly.";

function validEmail(v) {
  return (
    typeof v === "string" &&
    v.length <= 254 &&
    /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(v)
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env && env.ZOHO_EM_ENDPOINT;
  if (!secret) {
    return json({ success: false, message: "Inquiry endpoint is not configured yet. Please email admin@executivemind.io directly." }, 503);
  }

  try {
    const ctype = (request.headers.get("content-type") || "").toLowerCase();
    if (ctype.includes("multipart/form-data")) {
      // never parsed correctly by the legacy handler either — dropped per review L5
      return json({ success: false, message: "Unsupported content type." }, 400);
    }
    const formEncoded = ctype.includes("form-urlencoded");
    if (!originOk(request, formEncoded)) {
      return json({ success: false, message: "Submission blocked — please use the form at executivemind.io." }, 403);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await rateLimited(env, SCOPE, ip)) {
      return json({ success: false, message: "Too many inquiries from this address in a short time. Please email admin@executivemind.io directly." }, 429, { "Retry-After": "600" });
    }

    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_BYTES) {
      return json({ success: false, message: "Inquiry too large." }, 400);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json({ success: false, message: "Inquiry too large." }, 400);
    }

    let data = {};
    if (formEncoded) {
      data = Object.fromEntries(new URLSearchParams(raw));
    } else {
      try { data = JSON.parse(raw); } catch { return json({ success: false, message: "Invalid JSON body." }, 400); }
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) data = {};

    // honeypot — none of the site's forms have a visible "website" field; ANY
    // content means a bot. Byte-identical success copy so the trap is not
    // fingerprintable.
    if (typeof data.website === "string" && data.website.length > 0) {
      return json({ success: true, message: SUCCESS_MESSAGE });
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

    await smtpSend(secret, subject, bodyText, { replyTo: email, replyToName: replyName });
    return json({ success: true, message: SUCCESS_MESSAGE });
  } catch (err) {
    if (err && err.smtpAuthFailure) {
      console.error("inquiry endpoint: SMTP AUTH rejected — serving 503 (ZOHO_EM_ENDPOINT unusable)");
      return json({ success: false, message: "Inquiry endpoint is not configured yet. Please email admin@executivemind.io directly." }, 503);
    }
    console.error("inquiry endpoint failure:", err && err.message);
    return json({ success: false, message: "We couldn't send your inquiry just now — please email admin@executivemind.io directly." }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet() {
  return json({ success: false, message: "Method not allowed. POST an inquiry as JSON." }, 405, { Allow: "POST, OPTIONS" });
}