// POST /api/testimonial — Executive Mind "Leave a testimonial" endpoint.
// Receives testimonial submissions from the homepage Testimonials section and
// relays them by email to admin@executivemind.io via Zoho SMTP over implicit TLS (465).
//
// Port of the TCN review system (testimonials.md, 2026-10-07) onto EM's proven
// direct-send lane: TCN parks submissions in KV for a host-side relay because
// its Worker cannot reach Gmail SMTP from Cloudflare IPs; EM's Pages runtime
// CAN reach Zoho SMTPS (verified live 2026-10-07 via /api/inquiry), so the
// submission goes straight from the form to the inbox — nothing stored anywhere.
// No email address is collected (TCN design).
//
// Publishing rule (TCN model, carried over): a human reads every submission;
// published testimonials are hand-curated into the page copy. Nothing auto-renders.
//
// Credential: ZOHO_EM_ENDPOINT secret (Cloudflare Pages secret store, a dedicated
// Zoho app-password for admin@) — read from env at runtime only. Never in this
// repo, never in chat. If AUTH is rejected (expired/rotated password) the
// endpoint serves 503, not a retry-forever 502.
//
// 2026-10-09 hardening batch (Garrison reviews, both reports) — shared guard
// logic lives in ./_guard.js: server-side Origin/Sec-Fetch-Site enforcement
// (form-encoded requires same-origin attestation; multipart dropped), KV-backed
// rate limiting (5/hr/IP per scope; SHA-256 keys; fail-open) over the aged
// isolate map, byte-accurate body cap (Content-Length pre-check), strict
// integer rating, honeypot with identical success copy, Retry-After on 429,
// Allow on 405. Success copy + 5-star Google review CTA (commit 1640c89)
// preserved unchanged.
//
// Contract:
//   POST JSON {name*, role, rating 0-5 (strict integer), text*, website(honeypot)}
//   -> 200 {success:true, message, google_review?}   emailed to admin@ inbox
//   -> 400 {success:false, message}   validation / unsupported content type
//   -> 403 {success:false, message}   cross-origin POST rejected
//   -> 429 {success:false, message}   per-IP throttle (isolate + KV)
//   -> 502 {success:false, message}   SMTP failure
//   -> 503 {success:false, message}   endpoint not configured / AUTH rejected
// Frontends wired to this endpoint: index.html #testimonials form.
// Subject shape: "Website Testimonial — <Name> (<n>/5)" for Oyola's inbox triage.

import { json, clean, rateLimited, originOk, smtpSend, CORS, MAX_BODY_BYTES } from "./_guard.js";

const SCOPE = "testimonial";
const SUCCESS_MESSAGE = "Thank you — your testimonial has been sent. It will appear on this wall very soon!";

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env && env.ZOHO_EM_ENDPOINT;
  if (!secret) {
    return json({ success: false, message: "Testimonial endpoint is not configured yet. Please email admin@executivemind.io directly." }, 503);
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
    if (await rateLimited(env, SCOPE, ip, context)) {
      return json({ success: false, message: "Too many submissions from this address in a short time. Please try again later." }, 429, { "Retry-After": "600" });
    }

    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_BYTES) {
      return json({ success: false, message: "Submission too large." }, 400);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json({ success: false, message: "Submission too large." }, 400);
    }

    let data = {};
    if (formEncoded) {
      data = Object.fromEntries(new URLSearchParams(raw));
    } else {
      try { data = JSON.parse(raw); } catch { return json({ success: false, message: "Invalid JSON body." }, 400); }
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) data = {};

    // honeypot — the site's forms never show a "website" field; ANY content
    // (even whitespace) means a bot. Response is byte-identical to a real
    // success so the trap cannot be fingerprinted, and no CTA is attached.
    if (typeof data.website === "string" && data.website.length > 0) {
      return json({ success: true, message: SUCCESS_MESSAGE });
    }

    const name = clean(data.name, 200);
    const text = clean(data.text, 5000);
    const role = clean(data.role, 200);
    const ratingNum = Number(data.rating);
    const rating = Number.isInteger(ratingNum) ? Math.min(5, Math.max(0, ratingNum)) : 0;

    if (!name) {
      return json({ success: false, message: "Your name is required." }, 400);
    }
    if (!text) {
      return json({ success: false, message: "Please add a few words — the wall runs on real words." }, 400);
    }

    const stars = rating > 0 ? "★".repeat(rating) + "☆".repeat(5 - rating) + " (" + rating + "/5)" : "(no star rating given)";
    const subject = "Website Testimonial — " + [...name].slice(0, 80).join("") + (rating > 0 ? " (" + rating + "/5)" : "");

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
    const body = {
      success: true,
      message: SUCCESS_MESSAGE,
    };
    if (rating === 5) {
      body.google_review = {
        url: "https://g.page/r/Cely2d4cnJ9TEAI/review",
        prompt: "It means a lot that it landed a 5 — would you also leave a quick Google review? It helps Brisbane businesses find us.",
      };
    }
    return json(body);
  } catch (err) {
    if (err && err.smtpAuthFailure) {
      console.error("testimonial endpoint: SMTP AUTH rejected — serving 503 (ZOHO_EM_ENDPOINT unusable)");
      return json({ success: false, message: "Testimonial endpoint is not configured yet. Please email admin@executivemind.io directly." }, 503);
    }
    console.error("testimonial endpoint failure:", err && err.message);
    return json({ success: false, message: "We couldn't send your testimonial just now — please try again later." }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet() {
  return json({ success: false, message: "Method not allowed. POST a testimonial as JSON." }, 405, { Allow: "POST, OPTIONS" });
}