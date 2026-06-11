# Hazel's Wearcast: Outfit Recommender Website (PRD)

> Build spec for Claude Code. Build a responsive, single-page website per the
> sections below. All UI text is in English. Pixel-art assets are provided
> separately by the owner; wire them per Section 11. No backend is required.

---

## 1. Overview

Hazel's Wearcast is a single-page website that recommends a complete, weather-appropriate
outfit for a given location, date, outing time window, and occasion. It is built for a user
who finds it hard to judge what to wear for the weather. The recommendation is shown
visually on a cute pixel-art character that auto-dresses (dress-up-game style) when the user
fills in the conditions and presses Start, plus a short text summary.

- Target user: someone with weak "weather sense" who wants concrete daily outfit guidance from a fixed personal wardrobe.
- Platform: responsive web, usable on both desktop and mobile.
- Language: English.

## 2. Goals and non-goals

### Goals
- From location, date, time window, and occasion, produce one complete outfit from a fixed wardrobe.
- Drive warmth from feels-like temperature; add accessories from rain, UV, and wind.
- Account for temperature change across the outing (recommend for the colder end, flag removable layers).
- Account for the user's cold/heat tolerance.
- Present the outfit visually (dressed character) and as a concise text summary.

### Non-goals (v1)
- No drag-and-drop dressing. Dressing is automatic on Start only.
- No face-photo personalization in v1. Reserve a face slot for later.
- No accounts or login. Settings persist locally only.
- No multi-day planning, sharing, history, or shopping.

## 3. Tech and constraints

- Frontend-only static website. Vanilla HTML/CSS/JS or a lightweight React setup is fine (builder's choice). No server, no database.
- Weather data: Open-Meteo (free conditions in Section 4). CORS is supported, so call it directly from the browser.
- Persistence: browser localStorage for settings (body type now, face photo later as a data URL).
- Deployment target: any static host (Netlify, Vercel, GitHub Pages).
- Assets: pixel-art sprites provided separately by the owner. The website composites and layers them.
- Attribution: display "Weather data by Open-Meteo.com (CC BY 4.0)" somewhere visible.

## 4. Weather API: Open-Meteo (verified)

- No API key, no sign-up, no credit card. Free for non-commercial use (a personal website with no ads or subscriptions qualifies).
- Rate limits: under 10,000 calls/day, 5,000/hour, 600/minute. More than enough.
- Data licence: CC BY 4.0, so attribution is required.
- CORS supported, JSON over plain HTTP GET, no SDK.

### Endpoints
- Forecast: `https://api.open-meteo.com/v1/forecast`
  - Query params: `latitude`, `longitude`, `timezone=auto`, and either `start_date` + `end_date` or `forecast_days`.
  - Hourly variables to request: `temperature_2m`, `apparent_temperature`, `precipitation_probability`, `uv_index`, `wind_speed_10m`, `weather_code`.
  - Hourly forecast is available up to 16 days ahead.
- Geocoding (location search by name): `https://geocoding-api.open-meteo.com/v1/search?name={query}&count=5&language=en`
- Units: Celsius by default. Outfit logic uses `apparent_temperature` (feels-like), not the raw temperature.

## 5. User inputs (entered each time)

1. Location: text search (geocoding endpoint) plus a "Use my location" button (browser geolocation).
2. Date: default today; selectable up to about 14-16 days ahead.
3. Outing time window: start time and end time (for example 09:00-18:00).
4. Occasion: one of Play, Active, School, Work.
5. Start button: triggers the recommendation and the dressing animation.

## 6. Settings (set once, persisted in localStorage)

- Body type / temperature tolerance: Cold-sensitive, Normal, or Heat-sensitive.
- Face photo (deferred to a later version): an upload slot. When provided, the photo overlays the character's head. v1 ships the slot disabled or as a placeholder.

## 7. Wardrobe data model

The wardrobe is a fixed catalog. The user owns every item. Model each item as:
`{ id, name, category, layer, warmthTag, seasonTags, spriteId, anchor }` where `layer` is one of
base-top, bottom, skirt, dress, outerwear, footwear, headwear, accessory, weather-gear.

### Catalog

**Tops** (thin to thick)

| Item | Typical use |
|---|---|
| Tank top | Hot (28C and up) |
| Short-sleeve tee | Summer (23C and up) |
| Polo shirt | Summer to early autumn |
| Light shirt / blouse | Transitional |
| Light long-sleeve tee | Transitional |
| Sweatshirt | Transitional |
| Hoodie | Transitional |
| Light knit | Transitional to early winter |
| Heavy knit / sweater | Winter |
| Turtleneck | Winter |

**Bottoms**

| Item | Typical use |
|---|---|
| Shorts | Summer |
| Denim shorts | Summer |
| Chinos | All-season |
| Slacks | All-season (smart) |
| Jeans | All-season |
| Joggers | All-season (active) |
| Short leggings | Spring/summer (active) |
| Long leggings | Transitional to winter (active) |
| Fleece-lined pants | Winter |
| Fleece-lined jeans | Winter |

**Skirts**

| Item | Typical use |
|---|---|
| Mini skirt | Summer |
| Midi skirt | Transitional |
| Long skirt | All-season |
| Fleece-lined skirt | Winter |

**Dresses**

| Item | Typical use |
|---|---|
| Sleeveless dress | Summer |
| Short-sleeve dress | Summer |
| Long-sleeve dress | Transitional |
| Knit dress | Winter |

**Outerwear** (light to heavy)

| Item | Typical use |
|---|---|
| Light cardigan | Transitional |
| Heavy / knit cardigan | Early winter |
| Windbreaker | Transitional (rain/wind) |
| Denim jacket | Transitional |
| Blazer | Transitional (smart) |
| Leather jacket | Transitional to early winter |
| Trench coat | Transitional |
| Coat | Winter |
| Fleece jacket | Early winter (active) |
| Light puffer | Early winter |
| Short puffer | Winter |
| Long puffer | Deep winter |

**Footwear**

| Item | Typical use |
|---|---|
| Sandals / slides | Summer |
| Sneakers | All-season |
| Loafers / dress shoes | Smart |
| Boots | Winter |
| Rain boots | Rain |

**Headwear**

| Item | Typical use |
|---|---|
| Cap | Sun |
| Bucket hat | Sun |
| Beanie | Winter (warmth) |

**Warmth and accessories**

| Item | Typical use |
|---|---|
| Scarf / muffler | Winter |
| Gloves | Winter |
| Tights | Transitional to winter (with skirts/dresses) |
| Regular socks | All-season |
| Thick socks | Winter |
| Jewelry | Any (style) |

**Weather gear**

| Item | Typical use |
|---|---|
| Sunglasses | Strong sun |
| Umbrella | Rain |
| Parasol | Strong sun / heat |
| Raincoat | Rain |
| Hand warmer | Deep winter |

## 8. Recommendation engine (the "brain")

Apply in this order: **Temperature decides warmth and thickness, then Occasion picks the style
among temperature-appropriate items, then Conditions add accessories.** Temperature always
wins on warmth.

### 8.1 Effective temperature
- Use `apparent_temperature` (feels-like).
- Across the hours in the selected window on the selected date, compute `feelsMin` and `feelsMax`.
- Apply a body-type offset to get a working temperature: Cold-sensitive subtracts 3C, Heat-sensitive adds 3C, Normal adds 0. (Subtracting makes a cold-sensitive user dress warmer.)
- Choose the core outfit based on the adjusted `feelsMin`, so the user is never underdressed.

### 8.2 Temperature to base outfit
Use the adjusted feels-like to pick the band, then choose candidates (Occasion narrows them in 8.3).

| Adjusted feels-like (C) | Top candidates | Bottom candidates | Outerwear candidates |
|---|---|---|---|
| 28 and up | Tank top, Short-sleeve tee | Shorts, Denim shorts, Mini skirt | None (Sleeveless or Short-sleeve dress as alternative) |
| 23 to 27 | Short-sleeve tee, Polo, Light shirt | Shorts, Chinos, Jeans, Mini/Midi skirt | Optional light cardigan (evening) |
| 20 to 22 | Light long-sleeve, Light shirt | Jeans, Chinos, Midi skirt | Light cardigan |
| 17 to 19 | Light long-sleeve, Sweatshirt | Jeans, Chinos | Light cardigan, Denim jacket, Blazer |
| 12 to 16 | Long-sleeve, Sweatshirt, Hoodie, Light knit | Jeans, Slacks | Trench coat, Denim or Leather jacket, Windbreaker |
| 9 to 11 | Sweatshirt, Light knit | Jeans, Slacks | Trench coat, Leather jacket, Fleece, Light puffer |
| 5 to 8 | Heavy knit, Turtleneck | Jeans, Fleece-lined pants | Coat, Short puffer, Fleece |
| 4 and below | Heavy knit, Turtleneck | Fleece-lined pants, Fleece-lined jeans | Long puffer, heavy Coat |

A dress (when in the band) may replace top + bottom for Play and Work occasions.

### 8.3 Occasion to style selection
From the band candidates, the occasion narrows and prioritizes.

| Occasion | Bottom preference | Outerwear lean | Footwear | Accessories |
|---|---|---|---|---|
| Play | Skirt or dress OK; jeans fine (free) | Any (denim, leather, cardigan) | Sneakers, Sandals, or Boots by temperature | Sunglasses and jewelry encouraged |
| Active | Jeans, Joggers, or Leggings; avoid skirts and dresses | Easy-to-remove light layer (windbreaker, fleece, light cardigan) | Sneakers | Minimal; umbrella only if needed |
| School | Jeans (comfortable casual) | Cardigan-leaning, neat | Sneakers or Loafers | Basic only |
| Work | Slacks, or jeans / midi skirt kept tidy | Blazer, Trench, or Cardigan (smart) | Loafers or Dress shoes | Restrained |

### 8.4 Conditions to accessories (rules)
Use peak values across the window.
- Precipitation probability peak at least 50 percent: add Umbrella. At 80 percent or more, or heavy rain with wind, prefer Raincoat and consider Rain boots.
- UV index peak at least 6, or clear/sunny `weather_code`: add Sunglasses. In strong sun add Cap or Bucket hat. If hot (28C and up) with high UV, offer Parasol.
- Adjusted `feelsMin` at or below 4C, or strong wind (`wind_speed_10m` about 30 km/h or more): add Scarf, Gloves, Beanie. If very cold (0C and below) add Hand warmer.
- If a skirt or dress is chosen and adjusted temperature is below about 12C: add Tights.
- Socks: Thick socks when 4C and below, otherwise Regular socks.

### 8.5 Time-window and removable-layer memo
- If `feelsMax` minus `feelsMin` is 5C or more, or the window crosses a band boundary, add a memo such as: "It warms to {feelsMax}C around {peak hour}, so you can take off your {outer layer} later."
- If it gets noticeably colder by the end of the window (for example an evening return), add a memo to keep the layer on or bring it.

### 8.6 Output object
- Recommended items grouped by slot: top, bottom or skirt or dress, outerwear, footwear, headwear, accessories, weather-gear.
- Weather summary: feelsMin to feelsMax (and the actual temperature range), peak precipitation probability, peak UV index.
- Layering memo from 8.5 (may be empty).

## 9. Screen layout and UI

- Header: the site title and a Settings gear icon (opens a modal for body type and the deferred face-photo slot).
- Conditions bar (top): location, date, time window, occasion, and the Start button.
- Main area:
  - Wide screens (about 900px and up): two columns, Character panel on the left, Closet panel on the right.
  - Narrow screens (mobile): stacked vertically in this order: Conditions, Character (with the outfit summary), Closet. The Closet may be collapsible or scrollable.
- Character panel: the pixel-art character. Base state is pajamas. Below the character sits the Result panel (item list, weather summary, memo).
- Closet panel: all owned clothing items shown as pixel sprites grouped by category. This is the source of the dressing animation.

```
Wide layout
+-------------------------------------------------+
| Hazel's Wearcast                     [* Settings]|
+-------------------------------------------------+
| Location[___] Date[v] Time[09:00-18:00] Occasion[School v]
|                                         [ Start > ]
+----------------------+--------------------------+
|       CHARACTER       |          CLOSET          |
|                      |  Tops  [][][]  Bottoms [][][]
|  (pajamas -> dressed) |  Outer [][][]  Shoes  [][]
|                      |  Hats  [][]    Gear   [][]
|  -- Today's Outfit -- |                          |
|  Long-sleeve, Jeans,  |  (all owned items shown) |
|  Light cardigan       |                          |
|  Feels 12-22C, Rain 0%|                          |
|  Note: take off the   |                          |
|  cardigan in the      |                          |
|  afternoon            |                          |
+----------------------+--------------------------+

Mobile (< 900px): stacked -> Conditions, then Character + Outfit, then Closet
```

## 10. Interaction and animation

- Initial state: character in pajamas; closet shows every owned item.
- On Start: compute the outfit, then animate the selected garments so they "fly" from their closet tile onto the character. Layer them in this order: legwear or bottom, then top, then outerwear, then footwear, then headwear, then face and neck accessories (sunglasses, scarf), then handheld (umbrella). The pajama base is hidden or covered as real clothes land.
- Re-run: when conditions change and Start is pressed again, clear or smoothly swap the current outfit and fly in the new pieces (the quick "whoosh" effect).
- Keep each item's flight quick (about 0.4 to 0.8 seconds) with a slight stagger between items.

## 11. Assets (pixel art, provided separately by the owner)

- Visual style: cute pixel art, consistent palette, single front-facing character.
- Required pieces:
  - Character base wearing pajamas.
  - A transparent face slot on the head (filled later by the user's photo).
  - One sprite per wardrobe item from Section 7, drawn on a shared canvas size with consistent anchor points so they layer correctly on the body. Tops align to the torso, bottoms and skirts to the legs, outerwear over the top, hats on the head, sunglasses on the eyes, scarf on the neck, shoes on the feet, umbrella in the hand.
  - Optional small closet-tile icon per item (the sprite scaled down is fine).
- Naming convention: set the sprite filename equal to the item id, for example `top_short_sleeve_tee.png`, `bottom_jeans.png`, `outer_light_cardigan.png`, so the website maps catalog to sprite directly.
- Critical for the asset creator: every clothing sprite must use the same character silhouette, the same canvas dimensions, and the same registration, or layering will not align on the character.

## 12. Acceptance criteria (v1)

- Entering location, date, time window, and occasion and pressing Start shows, within a few seconds: a dressed character, an item list, a weather summary, and a layering memo when relevant.
- Recommendations respect: feels-like across the window, the body-type offset, the occasion style rules, the rain / UV / cold accessory rules, and the removable-layer memo.
- Layout is usable on both phone and laptop (responsive per Section 9).
- The body-type setting persists across page reloads.
- The Open-Meteo attribution is visible.

## 13. Future / out of scope (note for later, do not build in v1)

- Face-photo personalization on the character.
- Saving or sharing looks, outfit history, multiple wardrobes.
- Manual item on/off toggles or override of the auto-dressed outfit.
- Multi-day view.
