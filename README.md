# Hazel's Wearcast 🌤️

A cute Y2K pixel-art outfit recommender. Enter a location, date, time window, and
occasion, and Hazel auto-dresses (dress-up-game style) for the weather, with a short
text summary. Frontend-only, no backend, no API key.

## Run it locally

It's a static site. Easiest is a tiny local server (needed for "Use my location",
which browsers only allow on `localhost`/https):

```bash
cd "Hazel's Wearcast"
python3 serve.py 8000          # tiny no-cache static server (recommended)
# or: python3 -m http.server 8000
# then open http://localhost:8000
```

You can also just open `index.html` directly — city **search** and forecasts work over
`file://`; only the browser-geolocation button needs `localhost`/https.

## Deploy

Drop the whole folder on any static host (Netlify, Vercel, GitHub Pages). No build step.

## How it works

- **Weather:** [Open-Meteo](https://open-meteo.com/) geocoding + hourly forecast, called
  straight from the browser (CORS-enabled, CC BY 4.0 — attribution shown in the footer).
- **The brain** (`js/engine.js`): everything keys off the **body-adjusted feels-like**
  ("what it feels like to her") — warmth band → occasion style → conditions add accessories
  (rain / UV / wind / cold), plus a removable-layer memo. Rules enforced: a **dress** replaces
  top + bottoms/skirts (only outerwear / footwear / headwear / accessories may join it); every
  single-slot category wears **exactly one** item (one top, one footwear, one hat…) and the
  hand holds **one** thing (umbrella ▸ hand-warmer ▸ parasol by priority); **accessories** are
  the only multi-item section. Notable conditions (rain, snow, storms, wind, UV, heat, freezing,
  fog) surface in a **pop-up alert**.
- **Sleep mode** (`js/app.js`): a time window during sleeping hours (**11 PM–5 AM**) skips the
  weather entirely — Hazel stays in her **Sleeping pajamas** (own `pajama` category) and a
  *"Sleeping time! Don't think about going out :/"* pop-up appears.
- **Dress-up** (`js/character.js`): the garment sprites share the base character's
  registration (same 437×1211 canvas, each item drawn in its body position — PRD §11), so
  every worn layer simply fills the stage and lines up automatically. Garments fly in from
  the closet in layer order, stacked back→front: **socks · footwear · tights · bottoms/skirts ·
  dresses/pajama · tops · outerwear · face-over-outerwear · headwear · accessories · weather gear**.
  (The face-over-outerwear sprite is auto-added whenever a coat is worn, re-drawing the face above
  a high collar — eye-matched to the base, hidden from the closet/list.) Closet/result
  thumbnails are auto-cropped to each garment on a canvas.
- **Coordinate mode** (`js/app.js` + `Character.coordinate`): before pressing Start you can dress
  Hazel by hand — tap any closet item to wear it. One item per category (tapping another in the
  same category swaps it; a dress replaces top+bottom; bottom/skirt share the lower slot), while
  **accessories stack**; tap a worn item to take it off. Pressing **Start** hands over to the
  weather pick and locks coordination; the **✨ Coordinate your own** button re-opens it.
- **Settings** persist in `localStorage` (body type now; face photo is a disabled v1 slot).

## Files

```
index.html          structure
styles.css          Y2K pixel styling + responsive layout
js/catalog.js       the 59-item wardrobe (id == sprite filename)
js/weather.js       Open-Meteo client
js/engine.js        recommendation engine (PRD §8)
js/character.js     layering + dress-up animation (PRD §10)
js/app.js           inputs, settings, closet, Start flow
Images in Closet/   character base, garment sprites, closet art
```
