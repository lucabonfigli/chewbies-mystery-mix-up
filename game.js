/* Franken Chewbie's Flavor Mash
 *
 * Two artwork canvases — desktop 2880x2160, mobile 1080x1920 — chosen by frame
 * aspect. Every position is a percentage of the active canvas, so swapping art
 * moves nothing and the same DOM serves both.
 *
 * The game makes no network requests. Entry data leaves only via postMessage
 * to the host page. See docs/INTEGRATION.md.
 */
(async function () {
  "use strict";

  const A   = "build-assets/";
  // versioned with the script so a cached manifest can never pin stale positions
  const V   = new URL(document.currentScript?.src || location.href).searchParams.get("v") || Date.now();
  const MAN = await fetch(A + "manifest.json?v=" + V).then(r => r.json());
  const pct = (v, total) => (v / total * 100) + "%";

  const QS  = new URLSearchParams(location.search);
  const CFG = Object.assign({
    targetOrigin : "*",
    waitForHost  : QS.get("wait")    === "1",
    recaptcha    : QS.get("captcha") === "1",
    recaptchaMs  : 8000,
    instagram    : "https://www.instagram.com/hichewusa/",
    tiktok       : "https://www.tiktok.com/@hichewusa",
    // Dates below are the ones supplied; the URL follows the Easter page's
    // pattern (hi-chew.com/pages/<campaign>) and is a guess until the page exists.
    rulesUrl     : "https://www.hi-chew.com/pages/flavormash",
    legal        : "*NO PURCHASE NECESSARY. Void where prohibited. Open to legal "
                 + "residents of the 50 U.S. & D.C., [18+] years or older. Sweepstakes "
                 + "begins (02/24/2026) and ends (04/04/2026). Subject to Official Rules "
                 + "at HI-CHEW.com/pages/flavormash.",
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

  /* ------------------------------------------------------------- audio
     Dave's files. One 80s music loop runs for the whole game, a bubbling loop
     sits under the game screen, and the rest are one-shots. Music ducks while
     a one-shot plays, as the previous games did. Nothing plays before the
     first user gesture — the title click starts it all. */
  const AU = "audio/", HOVER = matchMedia("(hover:hover)");
  const snd = (() => {
    const mk = (n, loop, vol) => { const a = new Audio(AU + n + ".mp3"); a.preload = "auto"; a.loop = loop; a.volume = vol; return a; };
    const MUSIC = .25, DUCK = .1;
    const music = mk("music", true, MUSIC), amb = mk("bubbling", true, .3);
    const pool = Object.fromEntries(["electricity","lever1","lever2","btn-rollover","back-rollover",
                                     "btn-click","submit-click","back-click"].map(n => [n, mk(n, false, .8)]));
    let muted = false, started = false, duckT = null;
    function play(n) {
      const a = pool[n]; if (!a || muted || !started) return;
      try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
      music.volume = DUCK; clearTimeout(duckT);
      duckT = setTimeout(() => { music.volume = MUSIC; }, Math.max(300, (a.duration || 1) * 1000));
    }
    function start()      { if (!started) { started = true; music.play().catch(() => {}); } }
    function ambience(on) { if (!started) return; on ? amb.play().catch(() => {}) : amb.pause(); }
    function toggleMute() { muted = !muted; music.muted = amb.muted = muted; return muted; }
    return { play, start, ambience, toggleMute };
  })();

  /* ------------------------------------------------------------- state */
  const FLAVOURS = MAN.flavours.map((f, i) =>
    Object.assign({}, f, (CFG.flavours && CFG.flavours[i]) || {}));
  const state = { picks: [], sent: false };

  const panel = $("#panel");

  /* --------------------------------------------------------- layout
     Two coordinate spaces: desktop artwork is 2880x2160, mobile is 1080x1920.
     Everything below is expressed as a percentage of whichever is active, so
     one set of DOM nodes serves both. Re-runs on orientation change. */
  const MOBILE = matchMedia("(max-aspect-ratio: 1/1)");
  let L, CW, CH;

  // deterministic per-flavour scatter, so the arrangement is stable between loads
  const rnd = (i, salt) => { const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); };

  function applyLayout() {
    L  = MAN.layouts[MOBILE.matches ? "mobile" : "desktop"];
    [CW, CH] = L.canvas;
    document.body.dataset.layout = MOBILE.matches ? "mobile" : "desktop";
    const R = document.documentElement.style;
    R.setProperty("--cw", CW); R.setProperty("--ch", CH);
    fitCanvas();

    $$(".screen").forEach(sc => {
      sc.style.backgroundImage = `url(${A}${L.bg[sc.dataset.bg]}.webp)`;
    });
    $("#bgLive").style.backgroundImage = `url(${A}${L.bg["game-live"]}.webp)`;
    // every screen's art is fetched now, so no screen ever pops in on first show
    Object.values(L.bg).forEach(n => { const pre = new Image(); pre.src = `${A}${n}.webp`; });

    // title button: a placed overlay on desktop, a sized sprite on mobile
    const tb = L.titleBtn, o = MAN.overlay[tb.overlay], btn = $("#btn-play");
    const tw = tb.w || o.w, th = tw * o.h / o.w;
    btn.style.width  = pct(tw, CW);
    btn.style.height = pct(th, CH);
    btn.style.left   = pct(tb.cx != null ? tb.cx - tw / 2 : o.x, CW);
    btn.style.top    = pct(tb.cy != null ? tb.cy - th / 2 : o.y, CH);
    swapOnHover(btn, tb.overlay, tb.ro);

    for (const [id, key] of [["#lnk-ig", "ig"], ["#lnk-tt", "tiktok"]]) {
      const ov = MAN.overlay[L.social[key].overlay], el = $(id);
      el.style.left = pct(ov.x, CW); el.style.top = pct(ov.y, CH);
      el.style.width = pct(ov.w, CW); el.style.height = pct(ov.h, CH);
      el.style.backgroundImage = `url(${A}${L.social[key].overlay}.webp)`;
    }

    for (const [id, base, ro] of [["#s2-submit","s2-submit","s2-submit-ro"],
                                  ["#s2-back","s2-back","s2-back-ro"],
                                  ["#f-submit","s3-submit","s3-submit-ro"],
                                  ["#f-back","s3-back","s3-back-ro"]]) {
      const el = $(id), pos = L.sprites[id.slice(1)], [sw, sh] = MAN.sprite[base];
      const w = pos.w || sw, h = w * sh / sw;
      el.style.width  = pct(w, CW);  el.style.height = pct(h, CH);
      el.style.left   = pct(pos.cx - w / 2, CW);
      el.style.top    = pct(pos.cy - h / 2, CH);
      swapOnHover(el, base, ro);
    }

    // lever: the dome is a separate overlay on desktop, baked into the art on mobile
    const dm = L.dome, domeEl = $("#leverDome");
    if (dm.art) {
      domeEl.style.display = "block";
      domeEl.style.left = pct(dm.x, CW); domeEl.style.top = pct(dm.y, CH);
      domeEl.style.width = pct(dm.w, CW); domeEl.style.height = pct(dm.h, CH);
      domeEl.style.backgroundImage = `url(${A}${dm.art}.webp)`;
    } else domeEl.style.display = "none";

    const [aw, ah] = [L.arm.w, L.arm.h];
    const [rawW, rawH] = MAN.sprite["lever"];
    const piv = { x: 290 / rawW * aw, y: 245 / rawH * ah };
    const hinge = { x: dm.x + dm.w / 2, y: dm.y + dm.h };
    arm.style.width  = pct(aw, CW);  arm.style.height = pct(ah, CH);
    arm.style.left   = pct(hinge.x - piv.x, CW);
    arm.style.top    = pct(hinge.y - piv.y, CH);
    arm.style.transformOrigin = (piv.x / aw * 100) + "% " + (piv.y / ah * 100) + "%";
    arm.style.backgroundImage = `url(${A}lever.webp)`;

    const P = L.panel, [cols, rows] = L.grid, panel = $("#panel");
    panel.style.left = pct(P.x, CW);  panel.style.top = pct(P.y, CH);
    panel.style.width = pct(P.w, CW); panel.style.height = pct(P.h, CH);
    panel.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    panel.style.gridTemplateRows    = `repeat(${rows},1fr)`;

    // Dave's mock scatters and tilts the tubes rather than gridding them
    $$(".cell").forEach((cell, i) => {
      if (L.scatter) {
        cell.style.transform =
          `translate(${(rnd(i,1)-.5)*26}%, ${(rnd(i,2)-.5)*18}%)`;
        cell.querySelector(".choice").style.setProperty("--tilt", ((rnd(i,3)-.5)*22).toFixed(1) + "deg");
      } else {
        cell.style.transform = "";
        cell.querySelector(".choice").style.setProperty("--tilt", "0deg");
      }
    });

    const FB = L.fieldBox;
    ["#f-first","#f-last","#f-email","#f-fav"].forEach((id, n) => {
      const el = $(id);
      el.style.left = pct(FB.x, CW); el.style.width = pct(FB.w, CW);
      el.style.top  = pct(FB.tops[n], CH); el.style.height = pct(FB.h, CH);
    });
    Object.assign($("#formErr").style, { left: pct(FB.x, CW), width: pct(FB.w, CW),
      top: pct(FB.tops[3] + FB.h + 12, CH) });
    Object.assign($("#formLegal").style, MOBILE.matches
      ? { left: "6%", width: "88%", top: "93%" }
      : { left: "52%", width: "44%", top: "88%" });
  }

  /* Cover only when the frame is within ~11% of the canvas aspect, so the crop
     stays under about a tenth. Beyond that, contain and letterbox instead —
     a phone frame is far enough from 9:16 that covering would clip the panel. */
  function fitCanvas() {
    const frame = innerWidth / innerHeight, canvas = CW / CH;
    document.body.classList.toggle("cover", Math.abs(Math.log(frame / canvas)) < 0.107);
  }

  function swapOnHover(el, base, ro) {
    if (el._swap) { el.removeEventListener("pointerenter", el._swap.on);
                    el.removeEventListener("pointerleave", el._swap.off);
                    el.removeEventListener("focus", el._swap.on);
                    el.removeEventListener("blur", el._swap.off); }
    el.style.backgroundImage = `url(${A}${base}.webp)`;
    if (!ro) { el._swap = null; return; }
    const pre = new Image(); pre.src = A + ro + ".webp";
    const on  = () => { if (el.disabled) return;
                        el.style.backgroundImage = `url(${A}${ro}.webp)`;
                        if (HOVER.matches) snd.play(/back/.test(base) ? "back-rollover" : "btn-rollover"); };
    const off = () => el.style.backgroundImage = `url(${A}${base}.webp)`;
    el.addEventListener("pointerenter", on); el.addEventListener("pointerleave", off);
    el.addEventListener("focus", on);        el.addEventListener("blur", off);
    el._swap = { on, off };
  }

  const LEVER_ANGLE = [0, 50, 100];   // left · middle · hard right
  const arm = $("#leverArm");

  panel.innerHTML = FLAVOURS.map((f, i) => `
    <div class="cell">
      <button class="choice" data-i="${i}" role="button" aria-pressed="false"
              aria-label="${f.name}" style="background-image:url(${A}c-${f.key}.webp)"></button>
    </div>`).join("");
  FLAVOURS.forEach(f => { const pre = new Image(); pre.src = `${A}c-${f.key}-sel.webp`; });
  panel.addEventListener("click", e => {
    const b = e.target.closest(".choice"); if (b) toggle(+b.dataset.i);
  });

  $("#flavourList").innerHTML = FLAVOURS.map(f => `<option value="${f.name}">`).join("");
  // link the whole "Official Rules at <url>" phrase, whatever the url is
  $("#formLegal").innerHTML = CFG.legal.replace(/Official Rules.*(?=\.\s*$)/, m =>
    `<a href="${CFG.rulesUrl}" target="_blank" rel="noopener">${m}</a>`);
  $("#lnk-ig").href = CFG.instagram;
  $("#lnk-tt").href = CFG.tiktok;

  applyLayout();
  // hold the whole app until the title art has decoded, then fade it in —
  // otherwise the page purple shows, then the picture pops in over it
  {
    const app = $("#app"), first = new Image();
    let shown = false;
    const reveal = () => { if (!shown) { shown = true; app.classList.add("ready"); } };
    first.src = `${A}${L.bg.title}.webp`;
    first.decode().catch(() => {}).then(reveal);
    setTimeout(reveal, 1500);                          // never hold a blank screen
  }
  MOBILE.addEventListener("change", () => { applyLayout(); render(); });
  addEventListener("resize", fitCanvas);

  /* ------------------------------------------------------ selection */
  function toggle(i) {
    if (state.sent) return;
    const at = state.picks.indexOf(i);
    if (at > -1) { state.picks.splice(at, 1); emit("flavour_deselected", { index: i, name: FLAVOURS[i].name }); }
    else {
      // as in the previous games: a third pick starts the pair over
      if (state.picks.length >= 2) state.picks = [i]; else state.picks.push(i);
      emit("flavour_selected", { index: i, name: FLAVOURS[i].name });
    }
    const n = state.picks.length;
    snd.play(n === 2 ? "lever2" : "lever1");
    if (n === 2) snd.play("electricity");
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
      b.style.setProperty("--pick", on ? ((i % 2 ? -1 : 1) * 7) + "deg" : "0deg");
      b.setAttribute("aria-pressed", String(on));
    });
    const n = state.picks.length;
    arm.style.transform = `rotate(${LEVER_ANGLE[n]}deg)`;
    $("#leverState").textContent =
      ["No flavors picked yet.", "One flavor picked.", "Two flavors picked — ready to submit."][n];
    const sub = $("#s2-submit");
    sub.disabled = !ready;
    sub.style.opacity = ready ? "1" : ".55";
    $("#bgLive").classList.toggle("on", ready);   // electrified layer fades in over the idle art
  }

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
    snd.play("btn-click");
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
    if (window.parent === window) return cb(null);   // no host to ask when standalone
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
    snd.ambience(id === "s-game");
    emit("screen", { screen: id.replace("s-", "") });
  }
  function submitGuess() {
    if (state.picks.length !== 2 || state.sent) return;
    state.sent = true;
    snd.play("submit-click");
    setTimeout(() => show("s-form"), 650);
  }
  function showDone() { show("s-done"); }

  $("#btn-play").addEventListener("click", () => { snd.start(); snd.play("btn-click"); show("s-game"); });
  $("#s2-submit").addEventListener("click", submitGuess);
  $("#s2-back").addEventListener("click", () => { snd.play("back-click"); show("s-title"); });
  $("#f-back").addEventListener("click", () => {
    snd.play("back-click"); state.sent = false; render(); show("s-game");
  });
  $("#entryForm").addEventListener("submit", onSubmit);
  $("#mute").addEventListener("click", e => {
    const muted = snd.toggleMute(); e.currentTarget.textContent = muted ? "✕" : "♫";
    e.currentTarget.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  });

  render();
  emit("ready", { flavours: FLAVOURS.map(f => f.name) });
})();
