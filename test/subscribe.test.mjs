// Runs the real handler against a stubbed Mailchimp and reCAPTCHA.
// No credentials, no network: node --test test/subscribe.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.MAILCHIMP_API_KEY = "test-us21";
process.env.MAILCHIMP_LIST_ID = "listid";
process.env.RECAPTCHA_SECRET = "secret";
process.env.ALLOWED_ORIGINS = "https://www.hi-chew.com";

const { default: handler } = await import("../api/subscribe.js");

let calls = [];
function stub({ member = null, putOk = true, score = 0.9 } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body });
    if (String(url).includes("siteverify"))
      return { json: async () => ({ success: true, score }) };
    if ((opts.method || "GET") === "GET")
      return member ? { status: 200, json: async () => member } : { status: 404, json: async () => ({}) };
    return { ok: putOk, status: putOk ? 200 : 400, json: async () => ({ title: "Invalid Resource" }) };
  };
}

const res = () => {
  const r = { code: 0, body: null, headers: {} };
  r.status = c => (r.code = c, r);
  r.json = b => (r.body = b, r);
  r.end = () => r;
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
};
const entry = (over = {}) => ({
  firstName: "Luca", lastName: "Bonfigli", email: "l@example.com",
  favourite: "Mango", guess: ["Lemon", "Mango"], mixColour: "#f5c305",
  recaptchaToken: "tok", ...over
});
const post = (body, origin = "https://www.hi-chew.com") =>
  ({ method: "POST", headers: { origin }, body });

test("accepts a valid entry and upserts", async () => {
  stub();
  const r = res(); await handler(post(entry()), r);
  assert.equal(r.code, 200);
  assert.deepEqual(r.body, { ok: true });
  const put = calls.find(c => c.method === "PUT");
  const sent = JSON.parse(put.body);
  assert.equal(sent.merge_fields.FNAME, "Luca");
  assert.equal(sent.merge_fields.GUESS1, "Lemon");
  assert.equal(sent.merge_fields.GUESS2, "Mango");
  assert.equal(sent.status_if_new, "subscribed");
  assert.deepEqual(sent.tags, ["mystery-mix-2026"]);
});

test("first entry wins — a second play does not overwrite", async () => {
  stub({ member: { merge_fields: { GUESS1: "Cherry", GUESS2: "Peach" } } });
  const r = res(); await handler(post(entry()), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.duplicate, true);
  assert.equal(calls.some(c => c.method === "PUT"), false);
});

test("rejects bad input before touching Mailchimp", async () => {
  for (const [over, field] of [
    [{ firstName: "" }, "First name"], [{ lastName: "" }, "Last name"],
    [{ email: "nope" }, "email"], [{ favourite: "" }, "Favorite"],
    [{ guess: ["only-one"] }, "Two flavors"]
  ]) {
    stub();
    const r = res(); await handler(post(entry(over)), r);
    assert.equal(r.code, 400, JSON.stringify(over));
    assert.match(r.body.error, new RegExp(field, "i"));
    assert.equal(calls.length, 0);
  }
});

test("rejects a low captcha score", async () => {
  stub({ score: 0.1 });
  const r = res(); await handler(post(entry()), r);
  assert.equal(r.code, 400);
  assert.match(r.body.error, /human/);
});

test("surfaces a Mailchimp failure rather than claiming success", async () => {
  stub({ putOk: false });
  const r = res(); await handler(post(entry()), r);
  assert.equal(r.code, 502);
  assert.equal(r.body.error, "Invalid Resource");
});

test("says so when it is not configured", async () => {
  const keep = process.env.MAILCHIMP_API_KEY;
  delete process.env.MAILCHIMP_API_KEY;
  stub();
  const r = res(); await handler(post(entry()), r);
  assert.equal(r.code, 503);
  assert.match(r.body.error, /Not configured/);
  process.env.MAILCHIMP_API_KEY = keep;
});

test("OPTIONS preflight and method guard", async () => {
  stub();
  let r = res(); await handler({ method: "OPTIONS", headers: {} }, r);
  assert.equal(r.code, 204);
  r = res(); await handler({ method: "GET", headers: {} }, r);
  assert.equal(r.code, 405);
});
