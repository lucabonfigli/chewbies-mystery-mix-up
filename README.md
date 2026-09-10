# Franken Chewbie's Flavor Mash

HI-CHEW's Halloween 2026 campaign game. Pick two flavours from the lab, pull
the lever, enter the sweepstakes. Runs inline in the Shopify theme; entries go
to a Vercel function that writes them to Mailchimp.

```
Shopify theme section  flavor-mash-game.liquid  +  assets/mm-*   (built by build_theme.py)
        │  POST entry (+ reCAPTCHA token)
        ▼
Vercel  api/subscribe.js  ──▶  Mailchimp audience
```

## Sources (edit these, nothing else)

| file | what |
|---|---|
| `index.html` | the game's markup, inside `#mm-game`; also the GitHub review page |
| `game.js` / `game.css` | the game; scoped to `#mm-game`, configured by `window.FLAVOR_MASH_CONFIG` |
| `build-assets/manifest.json` | every position, per layout (desktop 2880×2160, mobile 1080×1920) |
| `build-assets/*.webp`, `audio/*.mp3` | art and sound, from `assets-final/` |
| `api/subscribe.js` | the entry endpoint; `npm test` |

`python3 stamp.py` after editing the game (cache-busts the review page).
`python3 build_theme.py` assembles `shopify/theme/` from the sources above.

## Shopify

The theme carries the whole game — no outside host.

```
sections/flavor-mash-game.liquid   markup + settings: API URL, reCAPTCHA site key, music A/B, frame, page background
assets/mm-game.js · mm-game.css · mm-manifest.json · mm-*.webp · mm-*.mp3
templates/page.flavor-mash.json    page template carrying the section
```

Install into a theme (draft or live — it only adds files):

```bash
python3 build_theme.py
shopify theme pull --store hi-chew-tp.myshopify.com --theme <ID> --path /tmp/theme
cp -R shopify/theme/. /tmp/theme/
shopify theme push  --store hi-chew-tp.myshopify.com --theme <ID> --path /tmp/theme \
  --only sections/flavor-mash-game.liquid templates/page.flavor-mash.json "assets/mm-*"
```

Then Content → Pages: the campaign page, template `flavor-mash`, Visible at launch.
Section settings live in the theme editor; `PageBackground.jpg` goes in Files and
is picked there.

Draft in place: `Hi-Chew - Flavor Mash` (#188935766296), unpublished.

## Vercel — `we-are-multiply` / `hi-chew-mystery-mix`

`/api/subscribe` validates, verifies the reCAPTCHA token (min score 0.5), then
upserts the contact — first entry wins — with merge fields `FNAME LNAME FLAVOR
GUESS1 GUESS2 MIXCOLOR` and tag `mystery-mix-2026`. Returns 503 until configured.

```
MAILCHIMP_API_KEY   MAILCHIMP_LIST_ID   RECAPTCHA_SECRET   ALLOWED_ORIGINS=https://www.hi-chew.com
```

## Review page

GitHub Pages serves `index.html` (the game, full viewport) and `preview.html`
(the game inside the Shopify framing). `?audio=b` switches the music arrangement.
