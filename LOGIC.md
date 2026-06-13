# Hazel's Wearcast — How It Works

A plain-English (plus code-referenced) walkthrough of the whole logic — what is built today, and the v2 engineering layer to build next:

1. **How user inputs become an outfit** — the weather → recommendation pipeline *(shipped — Parts 1–2)*.
2. **How the z-index / layering works** — how the character is composited when she "wears" items *(shipped — Part 3, with two fixes specced in §3.8)*.
3. **Thermal engine v2** — clo-based insulation targeting and selection *(Part 4)* **[v2 — to build]**.
4. **Material layer** — material/clo optimization and the 100-point material score *(Part 5)* **[v2 — to build]**.
5. **UI integration contract + build order** — where v2 surfaces without touching the layout *(Parts 6–7)*.

Sections tagged **[v2 — to build]** are the spec for the next Claude Code session; untagged content documents current behavior and must not regress.

Everything runs **client-side in the browser** — there is no backend and no build step. It's a static page (`index.html` + `styles.css`) wired up by five vanilla-JS modules, each attaching a few functions to `window`:

| File | Role |
|------|------|
| `js/catalog.js` | The fixed wardrobe — every item, its category, sprite, and the temperature range it's appropriate for. |
| `js/weather.js` | Open-Meteo client — geocodes a location and fetches/summarizes the hourly forecast. |
| `js/engine.js` | The recommendation brain — turns weather + occasion + body type into a chosen outfit. |
| `js/character.js` | The paper-doll — stacking order (z-index), per-garment fit, and the dress-up animation. |
| `js/app.js` | UI wiring — collects inputs, runs the pipeline on **Start**, renders the result, handles the manual closet. |

---

## Part 1 — From user inputs to a dressed character

### 1.1 The inputs

The user provides five things (collected in `js/app.js`):

| Input | Widget | Notes |
|-------|--------|-------|
| **Location** | Search box / "use my location" | Geocoded to lat/lon via Open-Meteo. Remembered in `localStorage`. |
| **Date** | Date picker | Today → ~15 days ahead (forecast horizon). |
| **Time window** | Start + end time | Inclusive hours, e.g. 09:00–18:00. Reversed order is tolerated. |
| **Occasion** | Play / Active / School / Work chips | Picks the *style*. Remembered. |
| **Body type** | Settings modal: cold / normal / heat | Shifts how warm she dresses. Remembered. |

### 1.2 The pipeline (what happens on **Start**)

`onStart()` in `js/app.js:335` orchestrates this:

```
[inputs]
   │
   ├─ readWindow() ───────────────► is it 11 PM–5 AM?  ──yes──► SLEEP MODE (pajamas, no weather)
   │                                        │ no
   ├─ Weather.forecast(lat,lon,date) ──► raw hourly forecast (Open-Meteo)
   │
   ├─ Weather.summarizeWindow(fc,date,win) ──► one summary `w` for the chosen hours
   │        (feelsMin/Max, tempMin/Max, precipPeak, uvPeak, windPeak, codes, peakHour…)
   │
   ├─ recommend(w, occasion, bodyType) ──► a recommendation object
   │        (chosen item ids per slot, accessories, gear, memo, condition alerts)
   │
   ├─ renderResult(rec) ──► weather chips + item list + "take a layer off later" memo
   ├─ character.dress(rec.items) ──► garments fly from the closet onto the body
   └─ maybeWeatherPopup(rec) ──► a heads-up alert if conditions are notable
```

### 1.3 Weather summarization (`js/weather.js`)

`summarizeWindow()` filters the hourly forecast down to the selected date **and** the selected hour window, then reduces it to a single summary object. The key reductions:

- **`feelsMin` / `feelsMax`** — the min/max *apparent* ("feels-like") temperature across the window. These drive warmth.
- **`precipPeak`, `uvPeak`, `windPeak`** — the *worst* (max) value in the window, so protection is sized for the harshest moment.
- **`codes`** — every WMO weather code in the window (used to detect rain/snow/fog/clear).
- **`peakHour`, `startFeels`, `endFeels`** — used for the "you can take a layer off this afternoon" memo.

---

## Part 2 — The recommendation engine (`js/engine.js`)

The headline rule (top of the file):

> 1. **Temperature decides warmth & thickness.**
> 2. **Occasion picks the style** among temperature-appropriate items.
> 3. **Conditions add accessories** (rain / UV / cold / wind).
> **Temperature always wins on warmth.**

### 2.1 Body-type offset, and "dress for the coldest end"

```
BODY_OFFSET = { cold: -3, normal: 0, heat: +3 }
adjFeelsMin = feelsMin + offset
adjFeelsMax = feelsMax + offset
```

A **cold-sensitive** person gets a −3 °C offset, which makes everything register as colder → she dresses warmer. The **core outfit is chosen off `adjFeelsMin`** (the coldest the window gets) so she's never underdressed; `adjFeelsMax` is used only to decide whether an optional layer can be skipped and to write the "take it off later" memo.

### 2.2 Temperature bands (the warmth backbone)

`adjFeelsMin` selects one band. Each band carries candidate tops / bottoms / outers / dresses in priority order:

| Band (feels-like °C) | Tops | Bottoms | Outerwear | Dresses |
|---|---|---|---|---|
| **28+** | tank, short-sleeve | shorts, denim shorts, mini skirt | — | sleeveless, short-sleeve |
| **23–27** | short-sleeve, polo, light shirt | shorts, chinos, jeans, mini/midi skirt | light cardigan *(optional)* | short-sleeve, sleeveless |
| **20–22** | long-sleeve, light shirt | jeans, chinos, midi skirt | light cardigan | short-sleeve |
| **17–19** | long-sleeve, sweatshirt | jeans, chinos | light cardigan, denim jacket, blazer | — |
| **12–16** | long-sleeve, sweatshirt, hoodie, light knit | jeans, slacks | trench, denim/leather jacket, windbreaker | knit dress |
| **9–11** | sweatshirt, light knit | jeans, slacks | trench, leather/fleece jacket, light puffer | knit dress |
| **5–8** | heavy knit, turtleneck | jeans, fleece pants | coat, short puffer, fleece jacket | knit dress |
| **≤4** | heavy knit, turtleneck | fleece pants, fleece jeans | long puffer, coat | knit dress |

Each catalog item also has its own `tempRange`; the engine uses it (via `appropriate()`) so that when an *occasion preference* substitutes an item, it's still weather-correct.

### 2.3 Occasion narrows the choice

Within the band, the occasion reorders preferences:

- **Tops** — `TOP_PREF[occasion]` is a full priority list per occasion (e.g. Work prefers light shirt → polo → turtleneck; Active prefers short-sleeve → sweatshirt → hoodie). **Play** has no preference — it just takes the band's first top.
- **Lower body** (`pickLower`) — branches by occasion:
  - **Play** → may wear a **dress** (replaces top+bottom) if one fits the band; otherwise a skirt, else jeans/shorts.
  - **Active** → joggers / leggings / jeans; **never** skirts or dresses.
  - **School** → jeans / chinos / casual.
  - **Work** → **long trousers only** — slacks / chinos (fleece-lined pants when cold). Never skirts, shorts, jeans, or dresses, even in heat (office dress code); when nothing is temp-ideal it keeps the lightest long pant (linen-weight).
- **Outerwear** (`pickOuter`) — `OUTER_LEAN[occasion]` biases the pick (Work → blazer/trench; Active → windbreaker/fleece). The 23–27 band's cardigan is **optional** and dropped if `adjFeelsMin > 21` (it only stays for a cool evening).

**Work dress-code bans (`OCCASION_BAN`).** On top of the style ordering, Work is business-formal and never wears: **tank / sweatshirt / hoodie** (tops), **shorts / denim shorts / jeans / joggers / short leggings** (bottoms), **windbreaker** (outerwear), **sandals / rain boots** (footwear — closed leather only; regular boots stand in when wet), or **sunglasses**. The ban is applied in every selection path (`pickCoreV2`, the v1 `pickTop`/`pickLower`/`pickOuter`, `pickFootwear`, and the gear assembly).

### 2.4 Conditions → accessories & weather gear (§8.4)

All thresholds use the **body-adjusted** feels-like. Highlights:

- **Rain.** `heavyWet` = very wet (≥80% precip, or heavy rain + wind, or heavy snow). 
  - Rain boots when wet (and not freezing).
  - A **raincoat** (full shell, *replaces* the outerwear) only when it's both rainy and heavy-wet.
  - The hand holds **exactly one** thing, by priority: **umbrella** (rain, if no raincoat) → **parasol** (hot, sunny, Play/School).
- **Sun / UV.** `strongSun` = (UV ≥ 6 or clear sky) and not snowing → adds **sunglasses** (when not pouring; never for Work) and a **sun hat** (bucket for Play, cap otherwise; not for Work).
- **Cold / wind.** Very cold (`adjFeelsMin ≤ 4`), **or** *cold* wind (≥30 km/h **and** `adjFeelsMin ≤ 10`) → **beanie**, **scarf + gloves**. Wind alone is never enough: a beanie/scarf/gloves fight *cold* wind chill, and `apparent_temperature` already bakes in wind chill (§4.2), so a 30+ km/h breeze in mild or hot weather adds nothing warm — no beanie at 40 °C.
- **Socks.** Always exactly one pair — **thick** when `adjFeelsMin ≤ 4`, otherwise **regular**.
- **Tights.** Added under a skirt/dress when `adjFeelsMin < 12`.

`buildConditions()` turns notable weather into the emoji alert lines for the heads-up popup (heavy rain, snow, strong wind, high UV, hot, freezing, fog).

### 2.5 Footwear & headwear

`pickFootwear()` — **Work** is closed leather only (loafers, or boots when cold/wet — never rain boots or sandals); otherwise rain boots override when wet, then Active/School → sneakers, Play → sandals (hot) / boots (cold) / sneakers.
`headwear` — beanie when cold (or cold + windy), else a sun hat when bright; at most one.

### 2.5b "No matching outfit" gate (`rec.shopNeeded`)

After the outfit is chosen and the §5 material layer scores it, if even the **best realistic materials** can't bring it within today's target interval — `material.scoreOptimized < 90` — the engine sets `rec.shopNeeded`. The UI then renders the best-effort outfit but raises a popup — *"It'll do… for now — Hazel's wearing the best match she's got, but the score came in under 90. A little shopping trip would really save the day!"* (`showShopPopup`, `js/app.js`). This nag takes priority over the weather heads-up. It applies to **every occasion**, so a heavily-constrained closet (e.g. Work in extreme heat, where long sleeves + trousers can't get light enough) honestly admits it has no good match. Brutal cold does **not** trigger it: the §5.5 saturation clamp scores the warmest buildable outfit 100.

### 2.5c Multiple looks (re-press Start)

Pressing **Start** again with the **same** location + date + time + occasion + body type cycles to a different outfit instead of repeating the first. `recommendVariants()` (`js/engine.js`) builds the list once: index `[0]` is the normal primary pick (best thermal match, any score), and `[1..]` are **distinct alternative cores** whose **base** material score is **≥ 95**. It's produced by re-running `recommend()` while excluding each core already taken (`opts.excludeCores`), so the engine walks its ranked cores top-down and keeps the good ones; accessories/gear are weather-driven and identical across looks, so the variety lives in the top/bottom/dress/outer.

The UI (`onStart`, `js/app.js`) keys the list by a query **signature** (`variantSig`): a matching signature with a stored list just advances the index (no re-fetch, no popups, a *"Look N of M"* toast + hint line); any input change recomputes from a fresh forecast. Weather/shop popups fire only on the first build. If only the primary exists (no ≥95 alternatives — common for the heavily-restricted Work occasion in awkward weather), re-pressing simply re-shows it.

### 2.6 The dress rule (a hard constraint)

A **dress or pajama replaces top + bottom + skirt entirely**. After slot assembly, if a dress is chosen the engine nulls out `top`, `bottom`, `skirt` (`js/engine.js:298`). Only outerwear / footwear / headwear / accessories / gear may accompany a dress. The manual closet enforces the same exclusivity (`applyExclusivity()` in `js/app.js:287`).

### 2.7 Sleeping hours

If the window **starts** between 11 PM and 5 AM (`isSleepWindow`), the app short-circuits *before any weather call*: it shows a "Sleeping time!" popup and dresses her in **pajamas only** (`dress_long_sleeve`). No outfit, no forecast.

### 2.8 The removable-layer memo (§8.5)

If the window swings ≥5 °C or crosses a band, the memo says *"It warms to ~X°C around <hour>, so you can take off your <outer> later."* If it gets colder by the end of the window, it appends *"…keep your <outer> on for the trip home."*

---

## Part 3 — The z-index & layering system (compositing)

This is the paper-doll machinery in `js/character.js` (+ a little CSS).

### 3.1 The core idea: stacked full-canvas PNGs

Every garment sprite is drawn on the **same 437 × 1211 canvas as the base character**, with the garment already positioned on the body, on a transparent background. So compositing is trivial: each worn item is an `<img class="layer">` that **fills the stage** and lines up with the base automatically. **Only the stacking order matters** — so a coat sits over the top, a hat over the hair, sunglasses over the face.

The stage holds two things, both occupying the same centre region of the stage (`styles.css`):

```
.character-stage
 ├─ <img class="base">         z-index: 1   ← the base character (now the new art)
 └─ <div class="layers">       z-index: 2   ← every worn garment <img> goes in here
```

Each `.layer` is `position:absolute; inset:0; width/height:100%` — it fills `.layers`. Footwear is the exception: those sprites are tightly cropped (not full-canvas), so they get `object-fit:contain; object-position:center bottom` to sit at the floor (`.layer.footwear`).

### 3.2 The stacking map (`Z`)

Each item's `z-index` is set from this table (`js/character.js:18`). Higher = closer to the viewer:

| z | Layer | Items |
|---|-------|-------|
| 1 | (base) | the character body — CSS, not in `Z` |
| 10 | socks | `acc_socks`, `acc_thick_socks` |
| 14 | footwear | all `shoe_*` |
| ~~18~~ → **12** | tights | `acc_tights` *(fix — see §3.8)* |
| 20 | bottoms / skirts | `bottom_*`, `skirt_*` |
| 24 | dresses / pajama | `dress_*`, `pajama` |
| 30 | tops | `top_*` |
| 40 | outerwear | `outer_*` |
| 42 | rain shell | `gear_raincoat` |
| 50 | headwear | `hat_*` |
| 58 | scarf | `acc_scarf` |
| 60 | gloves | `acc_gloves` |
| 72 | umbrella / parasol | `gear_umbrella`, `gear_parasol` |
| 78 | sunglasses | `gear_sunglasses` |
| *35* | *fallback* | anything uncategorized |

Two deliberate orderings worth noting:
- **Footwear (14) sits *below* bottoms (20)** so trouser/skirt hems drape over the shoe tops. *(Tights moving to 12 — under the shoes, like socks — and the leggings tuck rule are specced in §3.8.)*
- **Hand-helds and sunglasses are highest (70–78)** so they read on top of the hand and face.

### 3.3 Resolving an item's z (`zFor`)

```
zFor(id):
  1. exact id in Z?            → use it      (e.g. gear_raincoat: 42)
  2. else item's category in Z? → use that   (e.g. any top → 30)
  3. else                       → 35 (default)
```
(`js/character.js:32`.) So most items resolve by **category**; only the handful with their own entry (raincoat, each gear piece) override that.

### 3.4 Back-to-front build order

`buildItemList()` (`js/engine.js:331`) emits the chosen ids as a flat list in **back-to-front order** — the same order as the z-index. That order does double duty: it's the paint order *and* the order garments **fly in** during the animation, so the dress-up reads naturally (socks first, sunglasses last).

### 3.5 Per-garment fit (`fitFor` / `applyFit`)

Even though sprites share the base registration, a few read better slightly scaled or nudged. `applyFit()` puts a CSS transform on each layer:

```
transform: translate(dx%, dy%) rotate(rot deg) scale(sx, sy)
transform-origin: ox% oy%
```

The values come from `fitFor(id)` (`js/character.js:149`), which merges three sources with `pick()` (per-item wins):

```
defaults  ←  CAT_FIT[category]  ←  ID_FIT[id]
```

- **`CAT_FIT`** — category-wide baseline (e.g. all tops share the tank top's size/anchor).
- **`ID_FIT`** — per-item overrides (this is what we've been tuning all session — waist on the 46% line, the shoulder anchor `oy`, gap nudges, etc.).
- A bare **`s`** sets both `sx` and `sy` (uniform/aspect-preserving); separate `sx`/`sy` distort.

This is the layer that all the "shift the tank top up 1%", "reduce the polo 3%", "waist at 46%" tweaks live in — pure CSS transforms on top of the shared canvas, **never** edits to the sprite's body position. (The PNG itself is only edited for left/right *gap* changes, where a transform can't help.)

### 3.6 The dress-up animation

`dress()` (`js/character.js:241`) swaps the whole outfit:
1. Fade out & remove **every** previous `.layer` (with a wall-clock fallback so a flaky animation can't leave a ghost garment behind).
2. Build the new hidden layers (`_buildLayers`) — each gets its z-index and fit applied up front.
3. **Fly each garment in** from its closet tile (`_fly`): a clone starts shrunk onto the tile and grows into place with a springy easing, ~0.42–0.78 s, **staggered 130 ms** so the pieces overlap into one quick "whoosh." When a flight lands, the real worn layer is revealed.

### 3.7 Manual "coordinate your own" mode

Before pressing Start, tapping closet tiles dresses her by hand (`coordinate()`, `js/character.js:282`) — same `zFor` and `applyFit`, but **snappy** (no fly-in): it diffs against what's already worn, fades out dropped pieces, keeps the rest, adds new ones. One item per category (accessories stack; only one sock pair). Pressing **Start** hands control to the weather pick (`exitCoordinate`).

### 3.8 Stacking fixes & tuck rules **[v2 — to build]**

Two corrections to the `Z` map, plus a rule a single global order cannot express:

1. **Tights move below footwear: `18 → 12`.** Tights are full-leg sprites (feet included), so at z 18 their feet paint *over* the shoes. They belong with the socks: socks 10 < **tights 12** < footwear 14 < bottoms 20. Shoes now cover the tights' feet, and hems still drape over the shoe tops.
2. **Tuckable bottoms.** "Leggings tuck *into* boots, jeans drape *over* them" is a conditional pair, not a fixed order. Add a data flag and one exception pass:

```js
// catalog.js — add to the two legging records
tuckable: true

// character.js — run after zFor(), before building the layer elements
function applyStackingExceptions(layers, worn) {
  const bottom = worn.bottom && byId(worn.bottom);
  if (bottom && bottom.tuckable) setZ(layers, 'footwear', 22); // above bottoms (20), below dresses (24)
}
```

3. **Paint order = sorted z.** `buildItemList()` currently emits a fixed back-to-front list. Once exceptions exist, derive the order by **sorting the worn items on their resolved z**, so the paint order and the fly-in order can never disagree with the stacking.

Everything else in `Z` stays as-is (scarf above the coat reads as "worn outside"; raincoat never co-occurs with outerwear, so 42 vs 40 never conflicts).

---

## Part 4 — Thermal engine v2: clo-based selection **[v2 — to build]**

This upgrades §2.2's band lookup into "insulation target + optimization," using the standard unit of clothing insulation. **The v1 band table is not deleted — it becomes the candidate generator (the feasibility filter), and clo becomes the ranking metric within it.**

### 4.1 What a clo is, and why summing it works

The clo is the unit of clothing thermal insulation: **1 clo = 0.155 m²·K/W**, calibrated so that ~1.0 clo (a business suit) keeps a seated person comfortable at ~21 °C, and ~0.5 clo (light summer clothes) at ~24–25 °C. Per **ISO 9920**, an ensemble's insulation is approximately the **sum of its garments' clo values** — *valid for normally distributed ensembles*, i.e. real outfits that cover torso + legs + feet, not arbitrary piles of items. That assumption is exactly why the optimizer only ever scores **complete, slot-valid, temperature-eligible** outfits.

Three structural guards (a.k.a. "what stops a long puffer + boots in July"):

| Guard | Mechanism | Effect |
|---|---|---|
| Target tracks the weather | `targetClo(T)` — §4.2 | summer target ≈ 0.15–0.3 clo; a 1.0 target only occurs around ~11–12 °C |
| Real garment values | §4.4 (anchored to ASHRAE 55 / ISO 9920 tables) | boots are **0.08 clo**, not 0.5 — feet are a small share of body surface, and clo is a whole-body average |
| Filter → then rank | band lists (§2.2) + per-item `tempRange` + slot completeness | the long puffer (`tempRange` ≈ ≤ 9 °C) never *enters* the pool at 25 °C; "puffer + boots, no top" is not a complete outfit, so it is never scored |

### 4.2 The insulation target

Working temperature `T = adjFeelsMin` (body offset already applied, §2.1). Piecewise-linear interpolation through these anchors, clamped to **[0.15, 2.6]**:

| T (°C) | 30+ | 27 | 24 | 21 | 18 | 15 | 12 | 9 | 6 | 3 | 0 | −5 | −10 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| target (clo) | 0.15 | 0.22 | 0.32 | 0.50 | 0.68 | 0.85 | 1.00 | 1.20 | 1.40 | 1.60 | 1.80 | 2.10 | 2.40 |

These anchors are **calibrated so the optimizer reproduces the v1 band table at band midpoints** — v2 starts life as a refinement of v1, not a regression. Treat the anchors as tunable data.

**Saturation rule.** Everything in the closet worn at once tops out around **~1.6 clo** (turtleneck 0.34 + fleece jeans 0.32 + long puffer 0.70 + boots 0.08 + thick socks 0.05 + scarf/gloves/beanie ≈ 0.15). Below roughly 0 °C the target exceeds that — which is physically honest (steady-state comfort at −10 °C standing still genuinely wants ski gear). When `target > max achievable`, pick the warmest feasible outfit, force the §2.4 cold accessories, and say so in the memo ("dress as warm as the closet allows, keep moving").

> **Where the curve comes from (theory — keep as a code comment, not code).** A steady-state heat balance gives `targetClo ≈ (33 − T) / (0.155 · q) − Ia`, where 33 °C ≈ mean skin temperature, `q ≈ 0.7 × 58.2 × met` W/m² is the dry heat the body must shed (the ~30 % leaving via breath/sweat excluded), and `Ia ≈ 0.7` clo is the still-air boundary layer. **Do not wind-correct `Ia`:** `apparent_temperature` already contains wind chill, and correcting twice double-counts wind. The raw formula over-estimates outdoor needs (people accept brief cooling and keep moving), which is why the *operational* numbers are the calibrated anchors above.

### 4.3 Met: occasion as metabolic rate (without insane outputs)

A moving body produces more heat, so it needs less insulation — that's the physics behind dressing lighter for Active. The danger: at sport-level met (4–6) the formula honestly says "t-shirt at −5 °C," which is true *mid-run* and insane as a recommendation (bus stop, breaks, cooldown). Guard rails:

| Occasion | met (clamped) | clo discount |
|---|---|---|
| Work | 1.2 | 0 |
| School | 1.3 | 0 |
| Play | 1.6 | −0.10 |
| Active | **2.0 (hard cap)** | −0.30 |

1. **Use the low end** of each activity's real met range — dress for the pauses, not the sprint.
2. **Discount with a floor:** `targetMove = max(targetClo(T) − discount, targetClo(T + 4))`. Activity may lighten the outfit by at most ~one temperature band.
3. **Dual target (how ISO 11079 / IREQ handles variable activity):** also keep `targetRest = targetClo(T)`. Prefer outfits whose core lands **inside `[targetMove, targetRest]` with the gap carried by a removable outer layer**; the memo then reads "you'll warm up once you're moving — shed the windbreaker."
4. **Accessory rules ignore met.** Scarf / gloves / beanie / tights / socks (§2.4) keep keying off raw adjusted temperature (and *cold* wind). Exercise heats the core; fingers and ears still freeze (vasoconstriction) when it's cold. Active at −5 °C still gets gloves. Wind only counts toward warm accessories when it's also cold (`adjFeelsMin ≤ 10`) — a hot breeze chills nothing.

### 4.4 Garment insulation table (add `clo:` to every record in `js/catalog.js`)

> Initial estimates anchored to the ASHRAE 55 / ISO 9920 garment tables; the *ordering* matters more than the second decimal — treat as tunable data. **Match rows by item name** (the authoritative ids live in `js/catalog.js`).

| Category | Item | clo | | Category | Item | clo |
|---|---|---|---|---|---|---|
| Top | Tank top | 0.06 | | Outerwear | Light cardigan | 0.20 |
| Top | Short-sleeve tee | 0.08 | | Outerwear | Heavy / knit cardigan | 0.31 |
| Top | Polo shirt | 0.12 | | Outerwear | Windbreaker | 0.25 |
| Top | Light shirt / blouse | 0.15 | | Outerwear | Denim jacket | 0.30 |
| Top | Light long-sleeve tee | 0.20 | | Outerwear | Blazer | 0.36 |
| Top | Sweatshirt | 0.30 | | Outerwear | Leather jacket | 0.35 |
| Top | Hoodie | 0.34 | | Outerwear | Trench coat | 0.42 |
| Top | Light knit | 0.25 | | Outerwear | Coat | 0.55 |
| Top | Heavy knit / sweater | 0.36 | | Outerwear | Fleece jacket | 0.30 |
| Top | Turtleneck | 0.34 | | Outerwear | Light puffer | 0.45 |
| Bottom | Shorts | 0.08 | | Outerwear | Short puffer | 0.55 |
| Bottom | Denim shorts | 0.08 | | Outerwear | Long puffer | 0.70 |
| Bottom | Chinos | 0.15 | | Footwear | Sandals / slides | 0.02 |
| Bottom | Slacks | 0.15 | | Footwear | Sneakers | 0.04 |
| Bottom | Jeans | 0.20 | | Footwear | Loafers / dress shoes | 0.03 |
| Bottom | Joggers | 0.28 | | Footwear | Boots | 0.08 |
| Bottom | Short leggings | 0.05 | | Footwear | Rain boots | 0.06 |
| Bottom | Long leggings | 0.10 | | Headwear | Cap | 0.01 |
| Bottom | Fleece-lined pants | 0.30 | | Headwear | Bucket hat | 0.01 |
| Bottom | Fleece-lined jeans | 0.32 | | Headwear | Beanie | 0.04 |
| Skirt | Mini skirt | 0.10 | | Accessory | Scarf / muffler | 0.06 |
| Skirt | Midi skirt | 0.18 | | Accessory | Gloves | 0.05 |
| Skirt | Long skirt | 0.22 | | Accessory | Tights | 0.10 |
| Skirt | Fleece-lined skirt | 0.28 | | Accessory | Regular socks | 0.02 |
| Dress | Sleeveless dress | 0.20 | | Accessory | Thick socks | 0.05 |
| Dress | Short-sleeve dress | 0.25 | | Accessory | Jewelry | 0 |
| Dress | Long-sleeve dress | 0.35 | | Gear | Raincoat | 0.20 |
| Dress | Knit dress | 0.45 | | Gear | Sunglasses / Umbrella / Parasol | 0 |

### 4.5 Selection algorithm

```
1. FILTER     candidates per slot = band lists (§2.2) ∩ appropriate(tempRange) ∩ occasion rules (§2.3)
              outerwear candidates include None where the band marks the outer optional
2. ENUMERATE  complete cores: top × lower × outer  (plus dress × outer where the occasion allows a dress)
              ≤ a few hundred combos — brute force, no heuristics needed
3. SCORE      coreClo = Σ clo of the core
              err = distance from the interval [targetMove, targetRest]   (0 if inside it)
4. RANK       min err → tie-breaks: prefer the gap carried by a removable outer →
              occasion preference order (§2.3) → stable id order (fully deterministic)
5. ACCESSORIZE per §2.4 (unchanged), then report outfitClo = coreClo + footwear + socks + accessories
```

Worked example — School, T = 12 °C → targetRest = targetMove = 1.00:
light knit 0.25 + jeans 0.20 + trench 0.42 = **0.87 core** → + sneakers 0.04 + socks 0.02 = **0.93 outfit** (err 0.07) beats hoodie 0.34 + jeans 0.20 + windbreaker 0.25 = 0.79 (err 0.21). The §2.8 memo becomes quantitative: at `adjFeelsMax`, if `outfitClo − targetClo(adjFeelsMax) ≥ 0.2`, name the layer and its value — *"It warms to 18 °C around 2 pm — the trench (~0.4 clo) can come off."*

**Selection uses base clo values only.** The material layer (Part 5) runs *after* this step as pure analysis — it never changes which items are chosen.

### 4.6 Invariants (ship as a `console.assert` dev block or a tiny `tests.html`)

These are the "no insane decisions" guarantees. Run them on synthetic weather objects:

1. `T = 30`, every occasion → no outerwear, no boots, no puffer, no beanie, `outfitClo ≤ 0.45`.
2. `T = −5`, **Active** → outerwear present, gloves + scarf + beanie present, `outfitClo ≥ 1.4`.
3. Monotonicity: sweeping `T` from 30 down to −10 (occasion fixed), `outfitClo` never *decreases* by more than 0.05.
4. A puffer is never chosen when `T > 10`.
5. Dress chosen ⇒ `top`, `bottom`, `skirt` are all null (existing §2.6 rule still holds in v2).
6. Active never yields a skirt or dress (existing rule still holds).
7. Floor respected: `targetMove(T, Active) ≥ targetClo(T + 4)` for all `T`.
8. `scoreOptimized ≥ scoreBase` for every input (the `asIs` option guarantees it — §5.2, §5.5).
9. Footwear, headwear, accessories, and gear never receive a material line, and their clo never changes (§5.3).
10. When `precipPeak ≥ 50 %`, the material named best for outerwear is never wet-sensitive (§5.4).

---

## Part 5 — Material layer: clo optimization & the material score **[v2 — to build]**

Design intent (settled): **the selection engine (Part 4) is untouched and keeps using base clo values.** The material layer runs *after* an outfit is chosen, purely as analysis. It answers: *"with the best realistic material (or blend) for each garment, how close could this outfit get to today's perfect clo?"* That knowledge is naturally useful for future purchases, but it is **never presented as a shopping feature** — facts only, no "buy this."

### 5.1 Research grounding: why multipliers, and why they are modest

The §4.4 clo values are ASHRAE *category* averages — a "short-sleeve tee" is one number regardless of fabric. Measured fabric data (ISO 11092 sweating-guarded-hotplate studies) show that for **dry** fabric, thermal resistance is dominated by thickness and knit/weave structure (the trapped still air), with fiber composition a second-order effect: at fixed construction, the largest spread observed across completely different fibers is ~35–40 %, and blend *ratio* (60/40 vs 65/35 cotton-poly) barely registers. Composition becomes first-order only when fabric gets **wet** — hydrophilic fibers (cotton, viscose, linen) lose their insulation. Therefore:

- Material effects are **modest multipliers on base clo (0.85–1.20)** — they encode typical construction-per-material as much as fiber chemistry, which is what makes them honest.
- Multipliers apply at the **material-category level only**, never per blend ratio.
- Blends appear as **guidance text** ("linen, or a linen-dominant blend"), never as separate clo values.

### 5.2 Material multiplier table (`effectiveClo = baseClo × mult`)

| material | mult | wet-sensitive | character |
|---|---|---|---|
| linen | 0.85 | yes | open weave, maximum airflow |
| nylonShell | 0.85 | no | thin tight weave (wind-blocking is a separate property) |
| jerseyModal | 0.90 | yes | thin, cool drape |
| polyWick | 0.90 | no | engineered thin, fast-dry |
| cottonLight | 1.00 | yes | the ASHRAE baseline |
| acrylicKnit | 1.05 | no | wool-like bulk |
| merinoWool | 1.10 | no — insulates damp | dense knit + fiber loft |
| denim | 1.15 | yes | dense cotton twill |
| polyFleece | 1.20 | no | napped pile traps extra air |

Plus the identity option **`asIs` (mult 1.00)** — "keep whatever this garment currently is." It is implicitly present in **every** option set, which guarantees the optimized result can never score worse than the base outfit.

### 5.3 Which items participate

- **Analyzable** (get material analysis + improvement lines): `top`, `bottom`, `skirt`, `dress`, `outerwear`.
- **Excluded** — base clo fixed, no material line, but still counted in the outfit total: `footwear`, `headwear`, `accessory`, `gear`.
- **Fixed-material items** (the material *is* the garment; their §4.4 base value already assumes it): jeans, denim shorts, denim jacket (denim) · leather jacket · windbreaker, all puffers, raincoat (nylonShell) · fleece jacket and every fleece-lined item (polyFleece) · coat, trench (their canonical fabrics). They participate in totals at base clo, with no options and no line.
- **Option sets for choosable items** (`asIs` added implicitly to all):

| Items | options |
|---|---|
| tank, tees, light shirt/blouse, non-knit dresses | linen, cottonLight, jerseyModal, polyWick |
| polo, shorts, chinos, slacks, non-fleece skirts | linen, cottonLight, polyWick |
| sweatshirt, hoodie, joggers | cottonLight, polyFleece, polyWick |
| light/heavy knit, turtleneck, knit dress | merinoWool, acrylicKnit, cottonLight |
| cardigans, blazer | merinoWool, acrylicKnit, cottonLight |
| leggings | polyWick |

### 5.4 Joint optimization (not per-item greedy)

Optimizing each item independently can overshoot: three items each "improving" by −0.05 may swing the total straight past the target. So the search is joint:

```
fixedClo = Σ clo of excluded + fixed-material worn items
choose a material m_i for every analyzable worn item to MINIMIZE
    err( fixedClo + Σ baseClo_i × mult(m_i) )     // err = §4.5 interval distance
brute force: ≤ 5 analyzable items × ≤ 5 options ≈ a few thousand combos — trivial

optimizedClo = the minimizing total      worstClo = the same search, maximizing err
```

Tie-breaks when several assignments reach the same err: higher property fit for today's weather (§5.6 weights) → fewer changes from `asIs` → stable id order (deterministic).

**Wet-day rule** (the one place composition is first-order): when `precipPeak ≥ 50 %`, a wet-sensitive material can never be *named best* for outerwear — it may only remain `asIs`.

### 5.5 The 100-point material score

One ruler for everything: distance from the §4.3 target interval — the exact same `err` the selector already computes. 1 point per 0.01 clo of deviation:

```
score(clo)     = max(0, round(100 − 100 × err(clo)))
scoreBase      = score(outfitClo)       // what she's wearing, base materials
scoreOptimized = score(optimizedClo)    // best realistic materials — always ≥ scoreBase (asIs guarantee)
scoreWorst     = score(worstClo)        // anti-optimal bound, displayed small
```

Worked example — target 1.00, base outfit 0.93 → **93**; joint optimum lands at 0.97 → **97**; worst-case materials 0.84 → **84**. The headline reads "Material score 93 / 100 · optimized 97."

**Saturation guard (scoring only).** In deep cold the raw target can exceed anything the closet can build (§4.2). For scoring, clamp the target interval to `[0.15, maxOptimizedAchievable]`, so the best buildable outfit scores 100 and the score measures *material headroom* rather than the brutality of the weather. The §4.2 saturation memo still tells the truth about the cold. (Bonus: in winter the optimizer reaches for fleece/wool multipliers, so the score genuinely showcases "warmer materials close the gap.")

### 5.6 Reasons, blends, and display copy

The fabric property table survives — no longer for selection, only for **tie-breaks and reason text**:

| material | airPerm | wick | dry | wetInsul | wind |
|---|---|---|---|---|---|
| linen | 5 | 3 | 4 | 1 | 1 |
| cottonLight | 4 | 2 | 2 | 1 | 2 |
| jerseyModal | 4 | 3 | 3 | 1 | 1 |
| denim | 2 | 1 | 1 | 1 | 3 |
| merinoWool | 3 | 4 | 3 | 5 | 2 |
| acrylicKnit | 3 | 2 | 4 | 3 | 2 |
| polyWick | 3 | 5 | 5 | 3 | 3 |
| polyFleece | 2 | 3 | 5 | 4 | 2 |
| nylonShell | 1 | 1 | 5 | 3 | 5 |

```js
const w = {
  airPerm:  clamp01((T - 20) / 10) * (1 + 0.5 * humid),
  wick:     clamp01(met - 1.2) + 0.5 * clamp01((T - 24) / 6),
  dry:      precipPeak / 100,
  wetInsul: ((precipPeak >= 50 && T <= 15) || snowy) ? 1 : 0,
  wind:     clamp01(windPeak / 30),
};
reasonFit(f) = Σ w[k] * PROPS[f][k];   // tie-break score; top 1–2 weighted properties → reason text
```

`humid`: add `relative_humidity_2m` to the hourly request in `js/weather.js` (one extra query param, no UI change); `humid = clamp01((rhPeak − 60) / 30)`, fall back to 0 if absent.

**Per-item improvement line** — only for analyzable items where the joint optimum picked a non-`asIs` material with `|Δclo| ≥ 0.005`, and **no per-item scores** (the 100-point scale belongs to the outfit total only):

```
Short-sleeve tee   0.08 clo
  ↳ in linen ≈ 0.068 clo — a touch cooler for today's heat (−0.012)
```

Reason text = the top one or two weighted properties (*breathes · dries fast · keeps warmth when damp · blocks wind*). Blend guidance is appended at the material-category level only: *"linen, or a linen-dominant blend, works."* Tone is informational; the word "buy" never appears.

---

## Part 6 — UI integration contract (zero layout change) **[v2 — to build]**

The v2 features are **text annotations on elements that already exist**. Hard rules for the build:

**Do not touch:** the `.main` two-column grid, the panel markup, `.character-stage` / `.layers`, the closet grid, the dress-up animation — and **no new sprites**. The thermal/material engine only changes *which existing items are chosen* and *what text renders*.

| Where (already in `index.html`) | Change |
|---|---|
| `#itemList` rows | clo chip per item: `<li>Short-sleeve tee <span class="chip chip-clo">0.08 clo</span></li>`. Analyzable items (§5.3) whose joint optimum picked a non-`asIs` material get **one sub-line**: `<div class="mat-note">↳ in linen ≈ <span class="clo-num">0.068 clo</span> — breathes, dries fast (−0.012)</div>` |
| `#result` | one new line block `#materialScore` above the item list, *inside* the existing result container: **`Material score 93 / 100 · optimized 97`** with a small muted `worst-case 84`. No layout change |
| `#weatherSummary` | one extra chip with the raw numbers: `🧶 outfit 0.93 → 0.97 / target 1.00 clo` |
| `#memo` | text only — now quantitative (§4.5) |
| `.site-footer` | one small muted line under the attribution: *"clo = the unit of clothing warmth — 1 clo ≈ a suit that keeps you comfortable seated at 21 °C. Lower is cooler, higher is warmer."* |
| Settings modal | one new block under Body type: ☑ **"Show engineering details (clo numbers)"**, persisted in `localStorage` alongside the body type; when off, hide `.chip-clo`, `.clo-num`, and the `#weatherSummary` clo chip. The 100-point score, the qualitative half of the material notes, and the footer explainer always show |

---

## Part 7 — Build order for the Claude Code session

1. **`js/catalog.js`** — add `clo:` (table §4.4), `tuckable: true` on the two leggings, `material:` / `fabricOptions:` (§5.3). Match by *name*; ids stay untouched.
2. **`js/engine.js`** — add `targetClo()`, the met table, and the filter → enumerate → rank selector behind `const USE_THERMAL_V2 = true;`. **Keep the v1 band-pick path callable** as fallback and for A/B comparison. Then add `materialAnalysis()` (§5.4–5.6), which runs *after* selection and returns `{ optimizedClo, worstClo, scoreBase, scoreOptimized, scoreWorst, perItemNotes }`.
3. **`js/character.js`** — §3.8: tights z fix, the tuckable exception pass, sort-by-resolved-z list order.
4. **`js/weather.js`** — request `relative_humidity_2m` (optional refinement, §5.6).
5. **`js/app.js` / `index.html` / `styles.css`** — Part 6 annotations: the `#materialScore` block, per-item `mat-note` sub-lines, the footer clo explainer, the summary chip, and the settings toggle.
6. **Invariants** — §4.6 behind a `?dev` query flag or a `tests.html`.
7. **Acceptance:** all §4.6 invariants (1–10) pass, and v1 vs v2 differ only in *selection within bands* — never in feasibility (nothing v2 picks is something v1 would have considered weather-inappropriate). The material layer changes annotations and scores only — never the chosen items.

---

## Appendix — the catalog model (`js/catalog.js`)

Every item is one record; the sprite filename equals the `id`:

```js
{ id, name, category, layer, group, tempRange: [lo, hi], seasonTags,
  clo,                    // [v2] §4.4 — garment insulation
  tuckable,               // [v2] §3.8 — leggings only
  material | fabricOptions } // [v2] §5.3 — fixed material, or choosable fabrics
```

- **`category`** drives both z-index (via `Z`) and fit (via `CAT_FIT`): `top · bottom · skirt · dress · pajama · outerwear · footwear · headwear · accessory · gear`.
- **`tempRange`** is the adjusted-feels-like window where the item is appropriate — the engine's safety check when an occasion preference substitutes an item.
- **`group`** is just the closet section label; `CLOSET_GROUPS` sets their order.
- A few hats map to a different sprite file (`SPRITE_FILE`) because they ship as "cap + face + bob" versions meant to layer over the head.
