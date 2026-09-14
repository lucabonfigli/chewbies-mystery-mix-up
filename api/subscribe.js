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
  // entries like "https://*.shopifypreview.com" match any subdomain (theme previews)
  const ok = o => allowed.some(a => a.startsWith("https://*.")
    ? o.startsWith("https://") && o.endsWith(a.slice("https://*".length)) && !o.slice(8, -a.slice("https://*".length).length).includes("/")
    : a === o);
  if (allowed.length === 0 || (origin && ok(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/* Upstream calls never hang (8s) and a busy Mailchimp — it allows 10 simultaneous
   connections per key — gets three tries with backoff instead of an error to the player. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(url, opts = {}, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
    if ((r.status === 429 || r.status >= 500) && attempt < retries) {
      const after = Number(r.headers.get("retry-after")) * 1000 || 0;
      await sleep(Math.max(after, 400 * 2 ** attempt + Math.random() * 300));
      continue;
    }
    return r;
  }
}

async function verifyCaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return { ok: true, skipped: true };      // not configured yet
  if (!token) return { ok: false, reason: "missing captcha token" };
  const r = await call("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token })
  });
  const d = await r.json();
  const min = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5);
  if (!d.success) return { ok: false, reason: "captcha rejected: " + (d["error-codes"] || []).join(",") };
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
    const r = await call(`${this.base()}/${this.hash(email)}`,
      { headers: { Authorization: this.auth() } }, { retries: 3 });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`lookup ${r.status}`);   // never mistake an outage for "new contact"
    return r.json();
  },
  // The audience needs a text field per merge tag the entry writes. Created on
  // first use, remembered for the life of the instance. The audience's own
  // "Mystery Flavor Guess" and "Form" fields (from last year's game) are found
  // by name so the team's existing columns and filters keep working.
  fieldsReady: null, guessTag: null, formTag: null,
  async ensureFields() {
    if (this.fieldsReady) return this.fieldsReady;
    return this.fieldsReady = (async () => {
      const base = this.base().replace(/\/members$/, "/merge-fields");
      const r = await call(`${base}?fields=merge_fields.tag,merge_fields.name&count=100`, { headers: { Authorization: this.auth() } }, { retries: 3 });
      const fields = (await r.json()).merge_fields || [];
      const have = new Set(fields.map(m => m.tag));
      this.guessTag = fields.find(m => /mystery\s*flavou?r\s*guess/i.test(m.name))?.tag || null;
      this.formTag  = fields.find(m => m.tag === "FORM" || /^form$/i.test(m.name))?.tag || null;
      for (const [tag, name] of [["PHONE", "Phone"], ["CITYSTATE", "City, State"], ["GUESS1", "Guess 1"], ["GUESS2", "Guess 2"], ["MIXCOLOR", "Mix colour"]]) {
        if (have.has(tag)) continue;
        const c = await call(base, { method: "POST", headers: { Authorization: this.auth(), "Content-Type": "application/json" },
                                      body: JSON.stringify({ tag, name, type: "text", required: false, public: false }) });
        if (!c.ok) { this.fieldsReady = null; throw new Error(`merge field ${tag}: ${(await c.json()).detail || c.status}`); }
      }
    })();
  },
  async put(email, body) {
    const r = await call(`${this.base()}/${this.hash(email)}`, {
      method: "PUT",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }, { retries: 3 });
    return { ok: r.ok, status: r.status, data: await r.json() };
  },
  // PUT only tags brand-new members; a returning Chew Crew contact keeps its old
  // tags. The tags endpoint applies to everyone.
  async tag(email, name) {
    const r = await call(`${this.base()}/${this.hash(email)}/tags`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [{ name, status: "active" }] })
    }, { retries: 3 });
    return r.ok || r.status === 204;
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
  // the Sep 14 form sends name/phone/cityState; the form before it sent firstName/lastName
  const legacy    = b.name == null && b.firstName != null;
  const name      = legacy ? `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() : String(b.name ?? "").trim();
  const phone     = String(b.phone     ?? "").trim();
  const email     = String(b.email     ?? "").trim();
  const cityState = String(b.cityState ?? "").trim();
  const guess     = Array.isArray(b.guess) ? b.guess.map(String) : [];
  // Mailchimp keeps first and last apart; the form asks for one name
  const [firstName, ...rest] = name.split(/\s+/); const lastName = rest.join(" ");

  if (!name)                                        return json(res, 400, { error: "Name is required." });
  if (!legacy && phone.replace(/\D/g, "").length < 7) return json(res, 400, { error: "That phone number doesn't look right." });
  if (!EMAIL_RE.test(email))                        return json(res, 400, { error: "That email doesn't look right." });
  if (!legacy && !cityState)                        return json(res, 400, { error: "City and state are required." });
  if (guess.length !== 2)       return json(res, 400, { error: "Two flavors must be mixed." });

  const captcha = await verifyCaptcha(b.recaptchaToken);
  if (!captcha.ok) {
    console.error("captcha refused:", captcha.reason, "| origin:", req.headers.origin, "| token:", b.recaptchaToken ? "present" : "none");
    return json(res, 400, { error: "Couldn't verify that you're human." });
  }

  try {
    // first entry wins: never overwrite a guess that is already recorded
    const existing = await mc.get(email);
    if (existing?.merge_fields?.GUESS1) {
      console.log("entry duplicate:", mc.hash(email).slice(0, 8), "| origin:", req.headers.origin);
      return json(res, 200, { ok: true, duplicate: true });
    }

    await mc.ensureFields();
    const result = await mc.put(email, {
      email_address: email,
      status_if_new: "subscribed",
      merge_fields: {
        FNAME: firstName,
        LNAME: lastName,
        PHONE: phone,
        CITYSTATE: cityState,
        GUESS1: guess[0],
        GUESS2: guess[1],
        MIXCOLOR: String(b.mixColour ?? ""),
        ...(mc.guessTag ? { [mc.guessTag]: guess.join(" + ") } : {}),
        ...(mc.formTag  ? { [mc.formTag]: "Flavor Mash Game" } : {})
      },
      tags: [TAG]
    });

    if (!result.ok) {
      const detail = result.data?.detail || result.data?.title;
      console.error("mailchimp rejected:", result.status, detail);
      return json(res, 502, { error: detail || "Mailchimp rejected that entry." });
    }
    const tagged = await mc.tag(email, TAG);
    console.log("entry ok:", mc.hash(email).slice(0, 8), "| guess:", guess.join(" + "), "| status:", result.data?.status,
                "| tagged:", tagged, "| origin:", req.headers.origin, "| captcha:", captcha.score ?? "skipped");
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("mailchimp unreachable:", e && e.message, "→", mc.base().replace(/lists\/.*/, "lists/…"));
    return json(res, 502, { error: "Couldn't reach Mailchimp. Please try again." });
  }
}
