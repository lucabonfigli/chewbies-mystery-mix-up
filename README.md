# Chewbie's Mystery Mix-Up

Halloween campaign game for HI-CHEW. Players mix two of twenty flavour potions
in Chewbie's cauldron and guess the secret Mystery Mix flavour.

Built for Multiply. Follows the same embed pattern as the previous campaign
games — a self-contained build served from GitHub Pages, embedded in the
Shopify storefront through a theme section and communicating by `postMessage`.

## Layout

```
index.html                          the built game — this is what Pages serves
src/index.html                      source template (assets as __ASSETS__)
src/build.py                        inlines every asset as a data URI
src/discs.json                      flavour disc geometry and colours
assets/                             48 WebP assets (~1 MB)
shopify/sections/                   theme section for the storefront embed
```

## Build

```bash
python3 src/build.py
```

Rewrites `index.html` from `src/index.html` with all 48 assets inlined. No
dependencies beyond Python 3. The output is a single file with no external
requests of any kind.

## Embedding

Install `shopify/sections/mystery-mix-game.liquid` on the theme and add the
"Mystery Mix Game" section. It takes the game URL, a reCAPTCHA v3 site key,
background colour, width and padding as section settings.

## Integration

The game makes no network requests and stores nothing. Everything a player does
leaves through `postMessage` to the parent frame — including the entry payload,
which the host page forwards to whatever captures it.

Events: `ready`, `resize`, `screen`, `flavour_selected`, `flavour_deselected`,
`mix_created`, `restart`, `entry_submitted`.

Configure by setting `window.MYSTERY_MIX_CONFIG` before the game script runs —
`targetOrigin`, `waitForHost`, `recaptcha`, `recaptchaMs`, `flavours`.

Full contract in the integration document supplied separately.
