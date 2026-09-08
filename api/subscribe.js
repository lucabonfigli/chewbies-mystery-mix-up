import { createHash } from "node:crypto";

/**
 * POST /api/subscribe — the only server-side piece of Mystery Mix-Up.
 *
 * Stateless pass-through. Validates, verifies the captcha, upserts one
 * Mailchimp contact, returns. Nothing is stored here and nothing is logged
 * that contains an email address.
 *
 * Request body is the game's `entry` payload, forwarded verbatim by the host
 * page. See docs/INTEGRATION.md.
 */

const REQUIRED_ENV = ["MAILCHIMP_API_KEY", "MAILCHIMP_LIST_ID"];
const TAG = process.env.CAMPAIGN_TAG || "mystery-mix-2026";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

const json = (res, code, body) => res.status(code).json(body);

function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (allowed.length === 0 || (origin && allowed.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function verifyCaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return { ok: true, skipped: true };      // not configured yet
  if (!token) return { ok: false, reason: "missing captcha token" };
  const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token })
  });
  const d = await r.json();
  const min = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5);
  if (!d.success) return { ok: false, reason: "captcha rejected" };
  if (typeof d.score === "number" && d.score < min)
    return { ok: false, reason: "captcha score too low" };
  return { ok: true, score: d.score };
}

const mc = {
  base() {
    const dc = process.env.MAILCHIMP_DC || process.env.MAILCHIMP_API_KEY.split("-")[1];
    return `https://${dc}.api.mailchimp.com/3.0/lists/${process.env.MAILCHIMP_LIST_ID}/members`;
  },
  auth() {
    return "Basic " + Buffer.from("key:" + process.env.MAILCHIMP_API_KEY).toString("base64");
  },
  hash(email) {
    return createHash("md5").update(email.toLowerCase()).digest("hex");
  },
  async get(email) {
    const r = await fetch(`${this.base()}/${this.hash(email)}`,
      { headers: { Authorization: this.auth() } });
    return r.status === 404 ? null : r.json();
  },
  async put(email, body) {
    const r = await fetch(`${this.base()}/${this.hash(email)}`, {
      method: "PUT",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { ok: r.ok, status: r.status, data: await r.json() };
  }
};

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length)
    return json(res, 503, { error: `Not configured: ${missing.join(", ")}` });

  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const firstName = String(b.firstName ?? "").trim();
  const lastName  = String(b.lastName  ?? "").trim();
  const email     = String(b.email     ?? "").trim();
  const favourite = String(b.favourite ?? "").trim();
  const guess     = Array.isArray(b.guess) ? b.guess.map(String) : [];

  if (!firstName)               return json(res, 400, { error: "First name is required." });
  if (!lastName)                return json(res, 400, { error: "Last name is required." });
  if (!EMAIL_RE.test(email))    return json(res, 400, { error: "That email doesn't look right." });
  if (!favourite)               return json(res, 400, { error: "Favorite flavor is required." });
  if (guess.length !== 2)       return json(res, 400, { error: "Two flavors must be mixed." });

  const captcha = await verifyCaptcha(b.recaptchaToken);
  if (!captcha.ok) return json(res, 400, { error: "Couldn't verify that you're human." });

  try {
    // first entry wins: never overwrite a guess that is already recorded
    const existing = await mc.get(email);
    if (existing?.merge_fields?.GUESS1)
      return json(res, 200, { ok: true, duplicate: true });

    const result = await mc.put(email, {
      email_address: email,
      status_if_new: "subscribed",
      merge_fields: {
        FNAME: firstName,
        LNAME: lastName,
        FLAVOR: favourite,
        GUESS1: guess[0],
        GUESS2: guess[1],
        MIXCOLOR: String(b.mixColour ?? "")
      },
      tags: [TAG]
    });

    if (!result.ok) {
      const detail = result.data?.title || result.data?.detail;
      return json(res, 502, { error: detail || "Mailchimp rejected that entry." });
    }
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 502, { error: "Couldn't reach Mailchimp. Please try again." });
  }
}
