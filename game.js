/* Franken Chewbie's Flavor Mash
 *
 * Everything is laid out against the artwork's 2880x2160 canvas and expressed
 * as percentages, so swapping placeholder art for final art moves nothing.
 *
 * The game makes no network requests. Entry data leaves only via postMessage
 * to the host page. See docs/INTEGRATION.md.
 */
(async function () {
  "use strict";

  const A   = "build-assets/";
  const MAN = await fetch(A + "manifest.json").then(r => r.json());
  const [CW, CH] = MAN.canvas;
  const pct = (v, total) => (v / total * 100) + "%";

  const QS  = new URLSearchParams(location.search);
  const CFG = Object.assign({
    targetOrigin : "*",
    waitForHost  : QS.get("wait")    === "1",
    recaptcha    : QS.get("captcha") === "1",
    recaptchaMs  : 8000,
    instagram    : "https://www.instagram.com/hichewusa/",
    tiktok       : "https://www.tiktok.com/@hichewusa",
    rulesUrl     : "#",
    legal        : "*NO PURCHASE NECESSARY. Void where prohibited. Open to legal "
                 + "residents of the 50 U.S. & D.C., 18+ years or older. Sweepstakes "
                 + "begins [START] and ends [END]. Subject to Official Rules.",
    flavours     : null
  }, window.FLAVOR_MASH_CONFIG || {});

  const VERSION = "2.0.0";
  const $  = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ---------------------------------------------------------- messaging */
  function emit(type, data) {
    const msg = Object.assign({ source: "mystery-mix", version: VERSION, type }, data || {});
    try { if (window.parent !== window) window.parent.postMessage(msg, CFG.targetOrigin); } catch (e) {}
    window.dispatchEvent(new CustomEvent("mysterymix:" + type, { detail: msg }));
  }

  /* ------------------------------------------------------------- audio */
  let actx = null, muted = false;
  const ac = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, type = "sine", vol = .16, slide = 0) {
    if (muted) return;
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + .012);
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + .02);
  }
  const sfxPick   = i => { tone(480 + i * 18, .15, "triangle", .15, 240); tone(1120 + i * 24, .09, "sine", .06, 260); };
  const sfxDrop   = () => tone(290, .17, "sine", .13, -130);
  const sfxZap    = () => { for (let k = 0; k < 9; k++) setTimeout(() => tone(140 + Math.random() * 900, .07, "sawtooth", .09), k * 55); };
  const sfxWin    = () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone(f, .32, "triangle", .14), k * 100));

  /* ------------------------------------------------------------- state */
  const FLAVOURS = MAN.flavours.map((f, i) =>
    Object.assign({}, f, (CFG.flavours && CFG.flavours[i]) || {}));
  const state = { picks: [], sent: false };

  /* ------------------------------------------------------- backgrounds */
  $$(".screen").forEach(s => {
    s.style.backgroundImage = `url(${A}${s.dataset.bg}.webp)`;
  });

  /* ------------------------------------- overlay buttons (pre-placed art) */
  function placeOverlay(el, name, roName) {
    const o = MAN.overlay[name];
    el.style.left   = pct(o.x, CW);
    el.style.top    = pct(o.y, CH);
    el.style.width  = pct(o.w, CW);
    el.style.height = pct(o.h, CH);
    el.style.backgroundImage = `url(${A}${name}.webp)`;
    if (roName) {
      const ro = new Image(); ro.src = A + roName + ".webp";      // preload
      el.addEventListener("pointerenter", () => el.style.backgroundImage = `url(${A}${roName}.webp)`);
      el.addEventListener("pointerleave", () => el.style.backgroundImage = `url(${A}${name}.webp)`);
      el.addEventListener("focus",  () => el.style.backgroundImage = `url(${A}${roName}.webp)`);
      el.addEventListener("blur",   () => el.style.backgroundImage = `url(${A}${name}.webp)`);
    }
  }
  placeOverlay($("#btn-play"), "title-btn", "title-btn-ro");
  placeOverlay($("#lnk-ig"),   "ig");
  placeOverlay($("#lnk-tt"),   "tiktok");
  $("#lnk-ig").href = CFG.instagram;
  $("#lnk-tt").href = CFG.tiktok;

  /* ------------------------------------------- loose sprite buttons */
  // measured against the 2880x2160 canvas
  const SPRITE_POS = {
    "s2-back":   { cx: 300,  cy: 2010 },
    "f-submit":  { cx: 2060, cy: 1750 },
    "f-back":    { cx: 1560, cy: 1750 }
  };
  function placeSprite(el, base, ro, pos) {
    const [w, h] = MAN.sprite[base];
    el.style.width  = pct(w, CW);
    el.style.height = pct(h, CH);
    el.style.left   = pct(pos.cx - w / 2, CW);
    el.style.top    = pct(pos.cy - h / 2, CH);
    el.style.backgroundImage = `url(${A}${base}.webp)`;
    if (ro) {
      const p = new Image(); p.src = A + ro + ".webp";
      const on  = () => { if (!el.disabled) el.style.backgroundImage = `url(${A}${ro}.webp)`; };
      const off = () => el.style.backgroundImage = `url(${A}${base}.webp)`;
      el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
      el.addEventListener("focus", on);        el.addEventListener("blur", off);
    }
  }
  placeSprite($("#s2-back"),  "s2-back", "s2-back-ro", SPRITE_POS["s2-back"]);
  placeSprite($("#f-submit"), "s3-submit", "s3-submit-ro", SPRITE_POS["f-submit"]);
  placeSprite($("#f-back"),   "s3-back",   "s3-back-ro",   SPRITE_POS["f-back"]);

  /* ------------------------------------------------------------- lever */
  const lever = $("#lever"), lp = MAN.overlay["lever-pulled"];
  const [lw, lh] = MAN.sprite["lever"];
  // the pulled-state art tells us exactly where the housing is
  const leverCx = lp.x + lp.w / 2, leverBottom = lp.y + lp.h;
  lever.style.width  = pct(lw, CW);
  lever.style.height = pct(lh, CH);
  lever.style.left   = pct(leverCx - lw / 2, CW);
  lever.style.top    = pct(leverBottom - lh, CH);
  lever.style.backgroundImage = `url(${A}lever.webp)`;

  /* ------------------------------------------------------------- panel */
  const P = MAN.panel, COLS = 5, ROWS = 4;
  const panel = $("#panel");
  panel.style.left = pct(P.x, CW);
  panel.style.top  = pct(P.y, CH);
  panel.style.width  = pct(P.w, CW);
  panel.style.height = pct(P.h, CH);
  panel.style.gridTemplateColumns = `repeat(${COLS},1fr)`;
  panel.style.gridTemplateRows    = `repeat(${ROWS},1fr)`;

  panel.innerHTML = FLAVOURS.map((f, i) => `
    <div class="cell">
      <button class="choice" data-i="${i}" role="button" aria-pressed="false"
              aria-label="${f.name}" style="background-image:url(${A}c-${f.key}.webp)"></button>
    </div>`).join("");

  FLAVOURS.forEach(f => { const p = new Image(); p.src = `${A}c-${f.key}-sel.webp`; });

  panel.addEventListener("click", e => {
    const b = e.target.closest(".choice"); if (b) toggle(+b.dataset.i);
  });

  function toggle(i) {
    if (state.sent) return;
    const at = state.picks.indexOf(i);
    if (at > -1) { state.picks.splice(at, 1); sfxDrop(); emit("flavour_deselected", { index: i, name: FLAVOURS[i].name }); }
    else {
      // as in the previous games: a third pick starts the pair over
      if (state.picks.length >= 2) state.picks = [i]; else state.picks.push(i);
      sfxPick(i); emit("flavour_selected", { index: i, name: FLAVOURS[i].name });
    }
    render();
    if (state.picks.length === 2) emit("mix_created", {
      guess: state.picks.map(k => FLAVOURS[k].name),
      guessIndexes: [...state.picks]
    });
  }

  function render() {
    const ready = state.picks.length === 2;
    $$(".choice").forEach(b => {
      const i = +b.dataset.i, on = state.picks.includes(i), f = FLAVOURS[i];
      b.style.backgroundImage = `url(${A}c-${f.key}${on ? "-sel" : ""}.webp)`;
      b.classList.toggle("sel", on);
      b.classList.toggle("dim", ready && !on);
      b.setAttribute("aria-pressed", String(on));
    });
    lever.classList.toggle("ready", ready);
    lever.disabled = !ready;
    $("#s-game").style.backgroundImage = `url(${A}${ready ? "bg-game-live" : "bg-game"}.webp)`;
  }

  /* -------------------------------------------------------------- form */
  $("#flavourList").innerHTML = FLAVOURS.map(f => `<option value="${f.name}">`).join("");
  const FB = MAN.fieldBox, ids = ["#f-first", "#f-last", "#f-email", "#f-fav"];
  ids.forEach((id, n) => {
    const el = $(id);
    el.style.left   = pct(FB.x, CW);
    el.style.width  = pct(FB.w, CW);
    el.style.top    = pct(FB.tops[n], CH);
    el.style.height = pct(FB.h, CH);
    el.style.fontSize = "clamp(11px, 2.6vh, 30px)";
  });
  Object.assign($("#formErr").style, { left: pct(FB.x, CW), width: pct(FB.w, CW),
    top: pct(FB.tops[3] + FB.h + 14, CH), fontSize: "clamp(10px,1.9vh,22px)" });
  Object.assign($("#formLegal").style, { left: "52%", width: "44%", top: "88%",
    fontSize: "clamp(7px,1.15vh,13px)" });
  $("#formLegal").innerHTML = CFG.legal.replace(/Official Rules/,
    `<a href="${CFG.rulesUrl}" target="_blank" rel="noopener">Official Rules</a>`);

  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
  function onSubmit(e) {
    e.preventDefault();
    const first = $("#f-first").value.trim(), last = $("#f-last").value.trim(),
          email = $("#f-email").value.trim(), fav = $("#f-fav").value.trim();
    const err = $("#formErr");
    if (!first)              return err.textContent = "Chewbie needs a first name!";
    if (!last)               return err.textContent = "And a last name!";
    if (!EMAIL.test(email))  return err.textContent = "That email doesn't look right.";
    if (!fav)                return err.textContent = "Pick your favorite flavor.";
    err.textContent = "";
    const entry = {
      firstName: first, lastName: last, email, favourite: fav, optIn: true,
      guess: state.picks.map(k => FLAVOURS[k].name),
      guessIndexes: [...state.picks],
      ts: new Date().toISOString()
    };
    if (CFG.recaptcha) { setPending(true); requestToken(t => finish(entry, t)); }
    else finish(entry, null);
  }
  function finish(entry, token) {
    if (token) entry.recaptchaToken = token;
    emit("entry_submitted", { entry });
    if (CFG.waitForHost) setPending(true);
    else { setPending(false); showDone(); }
  }
  function setPending(on) {
    const b = $("#f-submit"); if (!b) return;
    b.disabled = on; b.style.opacity = on ? ".6" : "1";
  }

  /* the handshake the theme section already implements */
  let tokenCb = null, tokenTimer = null;
  function requestToken(cb) {
    tokenCb = cb; clearTimeout(tokenTimer);
    tokenTimer = setTimeout(() => { const f = tokenCb; tokenCb = null; if (f) f(null); }, CFG.recaptchaMs);
    try { if (window.parent !== window) window.parent.postMessage("request-recaptcha", CFG.targetOrigin); }
    catch (e) { clearTimeout(tokenTimer); tokenCb = null; cb(null); }
  }
  addEventListener("message", e => {
    const m = e.data;
    if (m && m.type === "recaptcha-token" && tokenCb) {
      clearTimeout(tokenTimer); const f = tokenCb; tokenCb = null; f(m.token || null); return;
    }
    if (!m || m.source !== "mystery-mix-host") return;
    if (m.type === "entry_accepted") { setPending(false); showDone(); }
    if (m.type === "entry_rejected") {
      setPending(false);
      $("#formErr").textContent = m.message || "Chewbie couldn't save that. Try again.";
    }
  });

  /* --------------------------------------------------------------- flow */
  function show(id) {
    $$(".screen").forEach(s => s.classList.toggle("on", s.id === id));
    emit("screen", { screen: id.replace("s-", "") });
  }
  function pullLever() {
    if (state.picks.length !== 2 || state.sent) return;
    state.sent = true;
    lever.classList.add("pulled"); lever.disabled = true;
    sfxZap();
    setTimeout(() => show("s-form"), 700);
  }
  function showDone() { sfxWin(); show("s-done"); }

  $("#btn-play").addEventListener("click", () => { ac().resume(); tone(660, .2, "triangle"); show("s-game"); });
  lever.addEventListener("click", pullLever);
  $("#s2-back").addEventListener("click", () => show("s-title"));
  $("#f-back").addEventListener("click", () => {
    state.sent = false; lever.classList.remove("pulled"); render(); show("s-game");
  });
  $("#entryForm").addEventListener("submit", onSubmit);
  $("#mute").addEventListener("click", e => {
    muted = !muted; e.currentTarget.textContent = muted ? "✕" : "♫";
    e.currentTarget.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  });

  render();
  emit("ready", { flavours: FLAVOURS.map(f => f.name) });
})();
