/* Hazel's Wearcast — recommendation engine (PRD §8)
 *
 * Order of operations (PRD §8 headline):
 *   1. Temperature decides warmth & thickness (band from adjusted feels-like).
 *   2. Occasion picks the style among temperature-appropriate items.
 *   3. Conditions add accessories (rain / UV / cold / wind).
 * Temperature always wins on warmth.
 */
(function () {
  'use strict';

  // §8.1 body-type offset applied to feels-like. Cold-sensitive subtracts (=> dresses warmer).
  const BODY_OFFSET = { cold: -3, normal: 0, heat: 3 };

  /* ================================================================== v2 ====
   * Thermal engine v2 (LOGIC.md Part 4): clo-based insulation targeting.
   * The v1 band table below is NOT deleted — it stays the candidate generator
   * (feasibility filter); clo becomes the ranking metric within it. Flip this
   * flag off to restore the v1 band-pick path exactly (also available per-call
   * via recommend(w, occ, body, { forceV1: true }) for A/B comparison). */
  const USE_THERMAL_V2 = true;

  /* §4.2 insulation target. Anchors are calibrated so the optimizer reproduces
   * the v1 band table at band midpoints — tunable data, not physics constants.
   *
   * Where the curve comes from (theory, for reference only): a steady-state
   * heat balance gives  targetClo ≈ (33 − T) / (0.155 · q) − Ia,  where
   * 33 °C ≈ mean skin temperature, q ≈ 0.7 × 58.2 × met W/m² is the dry heat
   * the body must shed (the ~30 % leaving via breath/sweat excluded), and
   * Ia ≈ 0.7 clo is the still-air boundary layer. Do NOT wind-correct Ia:
   * apparent_temperature already contains wind chill — correcting twice
   * double-counts wind. The raw formula over-estimates outdoor needs (people
   * accept brief cooling and keep moving), hence these calibrated anchors. */
  const CLO_ANCHORS = [
    [30, 0.15], [27, 0.22], [24, 0.32], [21, 0.50], [18, 0.68], [15, 0.85],
    [12, 1.00], [9, 1.20], [6, 1.40], [3, 1.60], [0, 1.80], [-5, 2.10], [-10, 2.40],
  ];
  function targetClo(T) {
    const A = CLO_ANCHORS;
    if (T >= A[0][0]) return clampClo(A[0][1]);
    if (T <= A[A.length - 1][0]) return clampClo(A[A.length - 1][1]);
    for (let i = 0; i < A.length - 1; i++) {
      const hi = A[i], lo = A[i + 1];
      if (T <= hi[0] && T >= lo[0]) {
        const f = (hi[0] - T) / (hi[0] - lo[0]);
        return clampClo(hi[1] + f * (lo[1] - hi[1]));
      }
    }
    return clampClo(A[A.length - 1][1]);
  }
  function clampClo(c) { return Math.min(2.6, Math.max(0.15, c)); }

  /* §4.3 occasion as metabolic rate. Low end of each activity's real met range
   * (dress for the pauses, not the sprint); Active hard-capped at 2.0. The
   * discount is floored at one temperature band: targetMove ≥ targetClo(T+4). */
  const MET = {
    Work:   { met: 1.2, discount: 0 },
    School: { met: 1.3, discount: 0 },
    Play:   { met: 1.6, discount: 0.10 },
    Active: { met: 2.0, discount: 0.30 },
  };
  function targetMoveFor(T, occasion) {
    const d = (MET[occasion] || MET.Work).discount;
    return Math.max(targetClo(T) - d, targetClo(T + 4));
  }

  function cloOf(id) {
    const it = id && window.itemById(id);
    return (it && it.clo) || 0;
  }

  /* v2 candidate pools — kept in sync with pickLower()'s inline lists (v1).
   * The pools mirror exactly what v1 could reach (band lists ∪ occasion
   * preference lists), gated by per-item tempRange, so v2 can never pick
   * something v1 would have considered weather-inappropriate. */
  const BOTTOM_PREF_V2 = {
    Active: ['bottom_joggers', 'bottom_long_leggings', 'bottom_short_leggings', 'bottom_jeans', 'bottom_fleece_pants'],
    School: ['bottom_jeans', 'bottom_chinos', 'bottom_joggers', 'bottom_fleece_jeans', 'bottom_denim_shorts', 'bottom_shorts'],
    Work:   ['bottom_slacks', 'skirt_midi', 'bottom_jeans', 'bottom_chinos', 'skirt_long', 'bottom_fleece_pants'],
    Play:   ['bottom_jeans', 'bottom_denim_shorts', 'bottom_shorts', 'bottom_chinos', 'bottom_fleece_jeans'],
  };

  /* §4.5 FILTER → ENUMERATE → SCORE → RANK. Brute force over complete cores
   * (≤ a few hundred combos). Fully deterministic: err → removable-outer
   * tie-break → occasion preference rank → stable id key. */
  function pickCoreV2(band, occasion, T) {
    const targetRest = targetClo(T);
    const targetMove = targetMoveFor(T, occasion);

    // -- FILTER ------------------------------------------------------------
    let tops = band.tops.filter(function (id) { return appropriate(id, T); });
    if (!tops.length) tops = band.tops.slice();

    let bottoms;
    if (occasion === 'Play') {
      bottoms = band.bottoms.slice();
    } else {
      const prefs = (BOTTOM_PREF_V2[occasion] || []).filter(function (id) { return appropriate(id, T); });
      const bandPool = (occasion === 'Work') ? band.bottoms : band.bottoms.filter(notSkirt);
      bottoms = dedupe(prefs.concat(bandPool));
    }
    if (!bottoms.length) bottoms = band.bottoms.length ? [band.bottoms[0]] : [];

    // Dresses enter the pool for Play only (mirrors v1 behavior).
    let dresses = [];
    if (occasion === 'Play' && band.dresses && band.dresses.length) {
      dresses = band.dresses.filter(function (id) { return appropriate(id, T); });
      if (!dresses.length) dresses = band.dresses.slice();
    }

    // §4.6-4 guard: a puffer is never a candidate above 10 °C.
    let outerPool = (band.outers || []).filter(function (id) { return !(T > 10 && id.indexOf('puffer') !== -1); });
    const allowNone = !band.outers || !band.outers.length || !!band.outersOptional;
    const outers = allowNone ? [null].concat(outerPool) : (outerPool.length ? outerPool : [null]);

    // -- ENUMERATE + SCORE ---------------------------------------------------
    const cores = [];
    tops.forEach(function (t) {
      bottoms.forEach(function (b) {
        outers.forEach(function (o) {
          cores.push({ top: t, bottom: b, dress: null, outer: o, clo: cloOf(t) + cloOf(b) + cloOf(o) });
        });
      });
    });
    dresses.forEach(function (d) {
      outers.forEach(function (o) {
        cores.push({ top: null, bottom: null, dress: d, outer: o, clo: cloOf(d) + cloOf(o) });
      });
    });

    // -- RANK ----------------------------------------------------------------
    const topPref = TOP_PREF[occasion];
    const lean = OUTER_LEAN[occasion];
    function rankParts(c) {
      const err = c.clo < targetMove ? (targetMove - c.clo)
                : (c.clo > targetRest ? c.clo - targetRest : 0);
      // Prefer the gap carried by a removable outer: wearing it reaches the
      // rest target, shedding it lands at/below the moving target (§4.3-3).
      const carries = (c.outer && c.clo >= targetMove - 1e-9 &&
                       (c.clo - cloOf(c.outer)) <= targetMove + 1e-9) ? 0 : 1;
      let pref = 0;
      if (c.dress) {
        pref += idx(band.dresses, c.dress, 9);
      } else {
        pref += idx(topPref || band.tops, c.top, 99);
        const bp = BOTTOM_PREF_V2[occasion];
        let br = bp ? bp.indexOf(c.bottom) : -1;
        if (br === -1) br = 50 + idx(band.bottoms, c.bottom, 49);
        pref += br;
      }
      if (c.outer === null) pref += (band.outersOptional && T > 21) ? -1 : 25;
      else if (lean) pref += idx(lean, c.outer, 30 + idx(band.outers, c.outer, 9));
      else pref += idx(band.outers, c.outer, 30);
      const key = [c.top, c.dress, c.bottom, c.outer].join('|');
      return { err: err, carries: carries, pref: pref, key: key };
    }
    function idx(arr, v, miss) { const i = arr ? arr.indexOf(v) : -1; return i === -1 ? miss : i; }

    let best = null, bestR = null, maxCore = 0;
    cores.forEach(function (c) {
      if (c.clo > maxCore) maxCore = c.clo;
      const r = rankParts(c);
      if (!best || r.err < bestR.err - 1e-9 ||
          (Math.abs(r.err - bestR.err) < 1e-9 && (r.carries < bestR.carries ||
            (r.carries === bestR.carries && (r.pref < bestR.pref ||
              (r.pref === bestR.pref && r.key < bestR.key)))))) {
        best = c; bestR = r;
      }
    });

    // §4.2 saturation: the whole closet tops out near maxCore + ~0.28 clo of
    // accessories (boots/thick socks/scarf/gloves/beanie). Below that, pick the
    // warmest feasible outfit and say so in the memo.
    const saturated = targetRest > maxCore + 0.28;

    return {
      top: best.dress ? null : best.top,
      lower: best.dress ? { dress: best.dress } : { bottom: best.bottom },
      outer: best.outer,
      coreClo: best.clo,
      targetRest: targetRest,
      targetMove: targetMove,
      saturated: saturated,
    };
  }

  /* Part 5 — material layer: clo optimization & the 100-point material score.
   * Design intent (§5): the Part 4 selector is UNTOUCHED and uses base clo
   * only. This runs after an outfit is chosen, purely as analysis — "with the
   * best realistic material for each garment, how close could this outfit get
   * to today's perfect clo?" Facts only; never presented as shopping advice.
   *
   * §5.1 grounding: dry insulation is dominated by thickness/construction
   * (trapped still air), fiber composition is second-order (~±35-40 % across
   * totally different fibers at fixed construction) — hence modest multipliers
   * at the material-category level, never per blend ratio. Composition turns
   * first-order only when WET (hydrophilic fibers collapse), hence the
   * wet-sensitive flags + the §5.4 wet-day rule. */
  const MATERIAL_MULT = {           // §5.2  effectiveClo = baseClo × mult
    linen: 0.85, nylonShell: 0.85,
    jerseyModal: 0.90, polyWick: 0.90,
    cottonLight: 1.00,
    acrylicKnit: 1.05, merinoWool: 1.10,
    denim: 1.15, polyFleece: 1.20,
    asIs: 1.00,                     // identity — implicit in EVERY option set
  };
  const WET_SENSITIVE = { linen: true, jerseyModal: true, cottonLight: true, denim: true };

  /* §5.6 property table — no longer used for selection, only for tie-breaks
   * and reason text. */
  const PROPS = {
    linen:       { airPerm: 5, wick: 3, dry: 4, wetInsul: 1, wind: 1 },
    cottonLight: { airPerm: 4, wick: 2, dry: 2, wetInsul: 1, wind: 2 },
    jerseyModal: { airPerm: 4, wick: 3, dry: 3, wetInsul: 1, wind: 1 },
    denim:       { airPerm: 2, wick: 1, dry: 1, wetInsul: 1, wind: 3 },
    merinoWool:  { airPerm: 3, wick: 4, dry: 3, wetInsul: 5, wind: 2 },
    acrylicKnit: { airPerm: 3, wick: 2, dry: 4, wetInsul: 3, wind: 2 },
    polyWick:    { airPerm: 3, wick: 5, dry: 5, wetInsul: 3, wind: 3 },
    polyFleece:  { airPerm: 2, wick: 3, dry: 5, wetInsul: 4, wind: 2 },
    nylonShell:  { airPerm: 1, wick: 1, dry: 5, wetInsul: 3, wind: 5 },
  };
  const MATERIAL_LABEL = {
    linen: 'linen', cottonLight: 'light cotton', denim: 'denim',
    jerseyModal: 'modal jersey', merinoWool: 'merino wool', acrylicKnit: 'acrylic knit',
    polyWick: 'wicking poly', polyFleece: 'fleece', nylonShell: 'nylon shell',
    leather: 'leather', rubber: 'rubber', wool: 'wool', gabardine: 'gabardine',
  };
  const REASON_TEXT = {
    airPerm: 'breathes', wick: 'wicks sweat', dry: 'dries fast',
    wetInsul: 'keeps warmth when damp', wind: 'blocks wind',
  };
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  /* §5.6 weather → weights (reason text + tie-breaks only). Heat-driven weights
   * use the WARM end of the window (adjFeelsMax); the wet-cold gate uses the
   * COLD end (adjFeelsMin) — worst case for each. humid falls back to 0 when
   * the API gave no humidity. */
  function materialWeights(w, occasion, adjFeelsMin, adjFeelsMax, snowy) {
    const met = (MET[occasion] || MET.Work).met;
    const humid = clamp01(((w.rhPeak == null ? 0 : w.rhPeak) - 60) / 30);
    return {
      airPerm:  clamp01((adjFeelsMax - 20) / 10) * (1 + 0.5 * humid),
      wick:     clamp01(met - 1.2) + 0.5 * clamp01((adjFeelsMax - 24) / 6),
      dry:      (w.precipPeak || 0) / 100,
      wetInsul: (((w.precipPeak || 0) >= 50 && adjFeelsMin <= 15) || snowy) ? 1 : 0,
      wind:     clamp01((w.windPeak || 0) / 30),
    };
  }

  /* §5.4–5.5 joint optimization + the 100-point score.
   *  - Analyzable items: top/bottom/skirt/dress/outerwear WITH fabricOptions.
   *    Fixed-material + excluded items contribute base clo only (fixedClo).
   *  - Joint, not per-item greedy: brute force over all material assignments
   *    (≤ 5 items × ≤ 5 options — a few thousand combos at most).
   *  - asIs is in every option set, so optimizedClo can never score worse than
   *    base (§4.6-8).
   *  - Wet-day rule: precipPeak ≥ 50 % → a wet-sensitive material can never be
   *    NAMED BEST for outerwear (asIs always remains available).
   *  - Saturation guard (scoring only): the target interval is clamped to
   *    [0.15, maxAchievable], so in brutal cold the best buildable outfit
   *    scores 100 and the score measures MATERIAL HEADROOM, not the weather. */
  function materialAnalysis(items, w, occasion, adjFeelsMin, adjFeelsMax, snowy, targetMove, targetRest) {
    const ANALYZABLE = { top: 1, bottom: 1, skirt: 1, dress: 1, outerwear: 1 };
    const worn = [];
    items.forEach(function (it) { const r = window.itemById(it.id); if (r) worn.push(r); });
    function isAnalyzable(r) { return !!(ANALYZABLE[r.category] && r.fabricOptions && r.fabricOptions.length); }
    const analyzable = worn.filter(isAnalyzable);
    const fixedClo = worn.reduce(function (s, r) { return s + (isAnalyzable(r) ? 0 : (r.clo || 0)); }, 0);
    const baseClo = fixedClo + analyzable.reduce(function (s, r) { return s + (r.clo || 0); }, 0);

    const wet = (w.precipPeak || 0) >= 50;
    const optionSets = analyzable.map(function (r) {
      let o = r.fabricOptions.slice();
      if (wet && r.category === 'outerwear') o = o.filter(function (m) { return !WET_SENSITIVE[m]; });
      return ['asIs'].concat(o);
    });

    // Enumerate every assignment (deterministic order).
    const combos = [];
    (function walk(i, picks, total) {
      if (i === analyzable.length) { combos.push({ picks: picks.slice(), total: total }); return; }
      const base = analyzable[i].clo || 0;
      optionSets[i].forEach(function (m) {
        picks.push(m);
        walk(i + 1, picks, total + base * MATERIAL_MULT[m]);
        picks.pop();
      });
    })(0, [], fixedClo);

    // §5.5 clamped scoring interval.
    let maxAch = 0;
    combos.forEach(function (c) { if (c.total > maxAch) maxAch = c.total; });
    const lo = Math.min(Math.max(0.15, targetMove), maxAch);
    const hi = Math.min(Math.max(0.15, targetRest), maxAch);
    function errOf(t) { return t < lo ? lo - t : (t > hi ? t - hi : 0); }
    function score(t) { return Math.max(0, Math.round(100 - 100 * errOf(t))); }

    // Rank: min err → higher property fit for today (§5.6 weights) → fewer
    // changes from asIs → stable id order. Worst = max err (first-encountered
    // on ties — enumeration order is deterministic).
    const wts = materialWeights(w, occasion, adjFeelsMin, adjFeelsMax, snowy);
    function fitOf(picks) {
      let f = 0;
      picks.forEach(function (m) {
        if (m === 'asIs' || !PROPS[m]) return;
        for (const k in wts) f += wts[k] * PROPS[m][k];
      });
      return f;
    }
    function changesOf(picks) {
      let n = 0;
      picks.forEach(function (m) { if (m !== 'asIs') n++; });
      return n;
    }
    let best = null, worst = null;
    combos.forEach(function (c) {
      c.err = errOf(c.total);
      if (!worst || c.err > worst.err + 1e-9) worst = c;
      if (!best) { best = c; return; }
      if (c.err < best.err - 1e-9) { best = c; return; }
      if (Math.abs(c.err - best.err) < 1e-9) {
        const cf = fitOf(c.picks), bf = fitOf(best.picks);
        if (cf > bf + 1e-9) { best = c; return; }
        if (Math.abs(cf - bf) < 1e-9) {
          const cc = changesOf(c.picks), bc = changesOf(best.picks);
          if (cc < bc || (cc === bc && c.picks.join('|') < best.picks.join('|'))) best = c;
        }
      }
    });

    // §5.6 per-item improvement lines: only where the joint optimum picked a
    // non-asIs material with |Δclo| ≥ 0.005. Reasons = today's top weighted
    // properties that the chosen material is actually good at (PROPS ≥ 3).
    const notes = [];
    best.picks.forEach(function (m, i) {
      if (m === 'asIs') return;
      const r = analyzable[i];
      const base = r.clo || 0;
      const eff = base * MATERIAL_MULT[m];
      if (Math.abs(eff - base) < 0.005) return;
      const reasons = Object.keys(wts)
        .sort(function (a, b) { return wts[b] - wts[a]; })
        .filter(function (k) { return wts[k] > 0.1 && PROPS[m] && PROPS[m][k] >= 3; })
        .slice(0, 2)
        .map(function (k) { return REASON_TEXT[k]; });
      notes.push({
        id: r.id,
        material: m,
        label: MATERIAL_LABEL[m] || m,
        effClo: r3(eff),
        delta: r3(eff - base),
        reasons: reasons,
      });
    });

    return {
      baseClo: r2(baseClo),
      optimizedClo: r2(best.total),
      worstClo: r2(worst.total),
      scoreBase: score(baseClo),
      scoreOptimized: score(best.total),
      scoreWorst: score(worst.total),
      ceiling: r2(maxAch),
      notes: notes,
    };
  }
  /* ================================================================ end v2 == */

  /* §8.2 Temperature -> base outfit bands (keyed off adjusted feels-like).
   * Candidate lists are in PRD priority order; occasion narrows them in §8.3. */
  const BANDS = [
    { key: '28+',   min: 28,  max: 999,
      tops: ['top_tank', 'top_short_sleeve_tee'],
      bottoms: ['bottom_shorts', 'bottom_denim_shorts', 'skirt_mini'],
      outers: [],
      dresses: ['dress_sleeveless', 'dress_short_sleeve'] },
    { key: '23-27', min: 23,  max: 27.999,
      tops: ['top_short_sleeve_tee', 'top_polo', 'top_light_shirt'],
      bottoms: ['bottom_shorts', 'bottom_chinos', 'bottom_jeans', 'skirt_mini', 'skirt_midi'],
      outers: ['outer_light_cardigan'], outersOptional: true,
      dresses: ['dress_short_sleeve', 'dress_sleeveless'] },
    { key: '20-22', min: 20,  max: 22.999,
      tops: ['top_long_sleeve_tee', 'top_light_shirt'],
      bottoms: ['bottom_jeans', 'bottom_chinos', 'skirt_midi'],
      outers: ['outer_light_cardigan'],
      dresses: ['dress_short_sleeve'] },
    { key: '17-19', min: 17,  max: 19.999,
      tops: ['top_long_sleeve_tee', 'top_sweatshirt'],
      bottoms: ['bottom_jeans', 'bottom_chinos'],
      outers: ['outer_light_cardigan', 'outer_denim_jacket', 'outer_blazer'],
      dresses: [] },
    { key: '12-16', min: 12,  max: 16.999,
      tops: ['top_long_sleeve_tee', 'top_sweatshirt', 'top_hoodie', 'top_light_knit'],
      bottoms: ['bottom_jeans', 'bottom_slacks'],
      outers: ['outer_trench_coat', 'outer_denim_jacket', 'outer_leather_jacket', 'outer_windbreaker'],
      dresses: ['dress_knit'] },
    { key: '9-11',  min: 9,   max: 11.999,
      tops: ['top_sweatshirt', 'top_light_knit'],
      bottoms: ['bottom_jeans', 'bottom_slacks'],
      outers: ['outer_trench_coat', 'outer_leather_jacket', 'outer_fleece_jacket', 'outer_light_puffer'],
      dresses: ['dress_knit'] },
    { key: '5-8',   min: 5,   max: 8.999,
      tops: ['top_heavy_knit', 'top_turtleneck'],
      bottoms: ['bottom_jeans', 'bottom_fleece_pants'],
      outers: ['outer_coat', 'outer_short_puffer', 'outer_fleece_jacket'],
      dresses: ['dress_knit'] },
    { key: '4-',    min: -999, max: 4.999,
      tops: ['top_heavy_knit', 'top_turtleneck'],
      bottoms: ['bottom_fleece_pants', 'bottom_fleece_jeans'],
      outers: ['outer_long_puffer', 'outer_coat'],
      dresses: ['dress_knit'] },
  ];

  function bandFor(t) {
    for (let i = 0; i < BANDS.length; i++) if (t >= BANDS[i].min && t <= BANDS[i].max) return BANDS[i];
    return BANDS[BANDS.length - 1];
  }

  function appropriate(id, temp) {
    const it = window.itemById(id);
    return it && temp >= it.tempRange[0] && temp <= it.tempRange[1];
  }

  // Pick the first id from prefs that is in `pool`; optionally also require warmth fit.
  function firstIn(prefs, pool) {
    for (let i = 0; i < prefs.length; i++) if (pool.indexOf(prefs[i]) !== -1) return prefs[i];
    return null;
  }
  function firstAppropriate(prefs, temp) {
    for (let i = 0; i < prefs.length; i++) if (appropriate(prefs[i], temp)) return prefs[i];
    return null;
  }

  // §8.3 occasion-specific preference orderings.
  const TOP_PREF = {
    Work:   ['top_light_shirt', 'top_polo', 'top_turtleneck', 'top_light_knit', 'top_long_sleeve_tee', 'top_heavy_knit', 'top_sweatshirt', 'top_hoodie', 'top_short_sleeve_tee', 'top_tank'],
    Active: ['top_short_sleeve_tee', 'top_sweatshirt', 'top_hoodie', 'top_long_sleeve_tee', 'top_light_knit', 'top_tank', 'top_heavy_knit', 'top_turtleneck', 'top_polo', 'top_light_shirt'],
    School: ['top_long_sleeve_tee', 'top_sweatshirt', 'top_light_shirt', 'top_hoodie', 'top_short_sleeve_tee', 'top_light_knit', 'top_polo', 'top_heavy_knit', 'top_turtleneck', 'top_tank'],
    Play:   null, // band order (free)
  };

  function pickTop(band, occasion) {
    const pref = TOP_PREF[occasion];
    if (pref) { const t = firstIn(pref, band.tops); if (t) return t; }
    return band.tops[0];
  }

  /* §8.2 + §8.3 bottom-or-dress selection.
   * Returns { dress } OR { bottom } (one of skirt/bottom id). */
  function pickLower(band, occasion, temp) {
    // A dress may replace top+bottom for Play and Work (§8.2). Use it as the
    // stylish default for Play when one fits the band; Work stays tidy (trousers/midi).
    if (occasion === 'Play' && band.dresses && band.dresses.length) {
      const d = firstAppropriate(band.dresses, temp) || band.dresses[0];
      if (d) return { dress: d };
    }

    if (occasion === 'Active') {
      // Jeans, joggers, or leggings; avoid skirts & dresses.
      const prefs = ['bottom_joggers', 'bottom_long_leggings', 'bottom_short_leggings', 'bottom_jeans', 'bottom_fleece_pants'];
      const b = firstAppropriate(prefs, temp) || firstIn(band.bottoms.filter(notSkirt), band.bottoms) || band.bottoms.filter(notSkirt)[0] || band.bottoms[0];
      return { bottom: b };
    }
    if (occasion === 'School') {
      // Jeans, comfortable casual.
      const prefs = ['bottom_jeans', 'bottom_chinos', 'bottom_joggers', 'bottom_fleece_jeans', 'bottom_denim_shorts', 'bottom_shorts'];
      const b = firstAppropriate(prefs, temp) || band.bottoms.filter(notSkirt)[0] || band.bottoms[0];
      return { bottom: b };
    }
    if (occasion === 'Work') {
      // Slacks, or tidy jeans / midi skirt.
      const prefs = ['bottom_slacks', 'skirt_midi', 'bottom_jeans', 'bottom_chinos', 'skirt_long', 'bottom_fleece_pants'];
      const b = firstAppropriate(prefs, temp) || firstIn(prefs, band.bottoms) || band.bottoms[0];
      return { bottom: b };
    }
    // Play (no dress chosen): skirt OK; jeans fine.
    const skirt = firstIn(['skirt_mini', 'skirt_midi', 'skirt_long', 'skirt_fleece'], band.bottoms);
    if (skirt) return { bottom: skirt };
    const prefs = ['bottom_jeans', 'bottom_denim_shorts', 'bottom_shorts', 'bottom_chinos', 'bottom_fleece_jeans'];
    const b = firstIn(prefs, band.bottoms) || band.bottoms[0];
    return { bottom: b };
  }
  function notSkirt(id) { return id.indexOf('skirt') !== 0; }

  // §8.3 outerwear lean by occasion.
  const OUTER_LEAN = {
    Play:   null, // any
    Active: ['outer_windbreaker', 'outer_fleece_jacket', 'outer_light_cardigan', 'outer_light_puffer'],
    School: ['outer_light_cardigan', 'outer_heavy_cardigan', 'outer_denim_jacket'],
    Work:   ['outer_blazer', 'outer_trench_coat', 'outer_light_cardigan', 'outer_heavy_cardigan', 'outer_coat'],
  };

  function pickOuter(band, occasion, adjFeelsMin) {
    if (!band.outers || !band.outers.length) return null;
    // Optional outer (e.g. 23-27 "light cardigan, evening"): only if it cools off.
    if (band.outersOptional && adjFeelsMin > 21) return null;

    const lean = OUTER_LEAN[occasion];
    if (lean) { const o = firstIn(lean, band.outers); if (o) return o; }
    return band.outers[0];
  }

  function isSunnyCode(codes) {
    // Open-Meteo WMO codes: 0 clear, 1 mainly clear, 2 partly cloudy.
    return codes.some(function (c) { return c === 0 || c === 1; });
  }
  function isHeavyRainCode(codes) {
    // 65 heavy rain, 67 heavy freezing rain, 82 violent showers, 95/96/99 thunderstorm.
    return codes.some(function (c) { return c === 65 || c === 67 || c === 82 || c === 95 || c === 96 || c === 99; });
  }
  function isSnowCode(codes) {
    // 71/73/75 snow fall, 77 snow grains, 85/86 snow showers.
    return codes.some(function (c) { return c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86; });
  }
  function isFogCode(codes) { return codes.some(function (c) { return c === 45 || c === 48; }); }
  function r1(n) { return Math.round(n * 10) / 10; }

  // Notable conditions -> short alert lines for the pop-up. Hot/cold thresholds use the
  // body-adjusted feels-like (what it feels like to *her*); the numbers show raw feels-like.
  function buildConditions(o) {
    const c = [];
    if (o.heavyRain) c.push({ emoji: '⛈️', text: 'Heavy rain or storms (' + Math.round(o.precip) + '% chance) — best stay covered.' });
    else if (o.precip >= 50) c.push({ emoji: '🌧️', text: 'Rain likely (' + Math.round(o.precip) + '% chance) — take rain protection.' });
    if (o.snowy) c.push({ emoji: '❄️', text: 'Snow about — bundle up and tread carefully.' });
    if (o.wind >= 30) c.push({ emoji: '💨', text: 'Strong wind (' + Math.round(o.wind) + ' km/h) — hold onto your hat!' });
    if (o.uv >= 8) c.push({ emoji: '🔆', text: 'Very high UV (' + r1(o.uv) + ') — sunglasses, hat & shade.' });
    else if (o.uv >= 6) c.push({ emoji: '☀️', text: 'High UV (' + r1(o.uv) + ') — wear sunglasses.' });
    if (o.adjFeelsMax >= 30) c.push({ emoji: '🥵', text: 'Hot out — feels up to ' + Math.round(o.feelsMax) + '°C. Keep cool & hydrated.' });
    if (o.adjFeelsMin <= 0) c.push({ emoji: '🥶', text: 'Freezing — feels as low as ' + Math.round(o.feelsMin) + '°C. Layer up!' });
    if (o.foggy) c.push({ emoji: '🌫️', text: 'Foggy — low visibility, take care.' });
    return c;
  }

  function pickFootwear(occasion, adjFeelsMin, rainBoots) {
    if (rainBoots) return 'shoe_rain_boots';
    const cold = adjFeelsMin <= 8;
    const veryCold = adjFeelsMin <= 4;
    if (occasion === 'Work') return veryCold ? 'shoe_boots' : 'shoe_loafers';
    if (occasion === 'Active') return 'shoe_sneakers';
    if (occasion === 'School') return cold ? 'shoe_sneakers' : 'shoe_sneakers';
    // Play: by temperature.
    if (adjFeelsMin >= 24) return 'shoe_sandals';
    if (cold) return 'shoe_boots';
    return 'shoe_sneakers';
  }

  /* Main entry. `w` is the summarized window (Weather.summarizeWindow).
   * opts.forceV1 (optional) bypasses the v2 thermal selector for A/B checks. */
  function recommend(w, occasion, bodyType, opts) {
    const offset = BODY_OFFSET[bodyType] != null ? BODY_OFFSET[bodyType] : 0;
    const adjFeelsMin = w.feelsMin + offset;
    const adjFeelsMax = w.feelsMax + offset;

    // §8.1: choose the core outfit on the colder end so the user is never underdressed.
    const band = bandFor(adjFeelsMin);
    const warmBand = bandFor(adjFeelsMax);

    // [v2] clo-targeted selection (Part 4) — v1 band-pick kept as fallback.
    const useV2 = USE_THERMAL_V2 && !(opts && opts.forceV1);
    let top, lower, outer, v2 = null;
    if (useV2) {
      v2 = pickCoreV2(band, occasion, adjFeelsMin);
      top = v2.top;
      lower = v2.lower;
      outer = v2.outer;
    } else {
      top = pickTop(band, occasion);
      lower = pickLower(band, occasion, adjFeelsMin);
      outer = pickOuter(band, occasion, adjFeelsMin);
    }

    // ---- §8.4 conditions -> accessories & weather gear ---------------------
    // Everything keys off the body-adjusted feels-like (what it feels like to *her*);
    // the raw temperature is shown for reference. Feels-like always wins on warmth.
    const precip = w.precipPeak || 0;
    const uv = w.uvPeak || 0;
    const wind = w.windPeak || 0;
    const sunny = isSunnyCode(w.codes);
    const heavyRain = isHeavyRainCode(w.codes);
    const snowy = isSnowCode(w.codes);
    const foggy = isFogCode(w.codes);
    const veryCold = adjFeelsMin <= 4;
    const freezing = adjFeelsMin <= 0;
    const strongSun = (uv >= 6 || sunny) && !snowy;

    const accessories = [];   // worn accessories (acc_*) — the ONLY multi-item section
    const gear = [];          // weather gear (gear_*)

    // Rain → a rain shell when it's really wet, otherwise an umbrella.
    const heavyWet = precip >= 80 || (heavyRain && wind >= 25) || (snowy && precip >= 70);
    const rainBoots = heavyWet || (precip >= 70 && !freezing);
    let raincoat = false;
    if (precip >= 50 && heavyWet) raincoat = true;   // full shell replaces the outer

    // The hand holds exactly ONE thing. Priority: umbrella (rain) > parasol
    // (hot & sunny). A raincoat already keeps rain off → no umbrella.
    let handheld = null;
    if (!raincoat && precip >= 50) handheld = 'gear_umbrella';
    else if (adjFeelsMax >= 28 && uv >= 6 && (occasion === 'Play' || occasion === 'School')) handheld = 'gear_parasol';

    // Footwear (needs the rainBoots decision).
    const footwear = pickFootwear(occasion, adjFeelsMin, rainBoots);

    // Headwear (exactly one): warm beanie when cold/windy; else a sun hat when bright.
    let headwear = null;
    if (veryCold || wind >= 30) headwear = 'hat_beanie';
    else if (strongSun && adjFeelsMin >= 14 && occasion !== 'Work') headwear = (occasion === 'Play') ? 'hat_bucket' : 'hat_cap';

    // Cold accessories.
    if (veryCold || wind >= 30) accessories.push('acc_scarf', 'acc_gloves');

    // Tights under a skirt/dress when chilly.
    const wearingSkirtOrDress = !!lower.dress || (lower.bottom && window.itemById(lower.bottom).category === 'skirt');
    if (wearingSkirtOrDress && adjFeelsMin < 12) accessories.push('acc_tights');

    // Socks: thick when very cold, otherwise regular (exactly one pair).
    accessories.push(adjFeelsMin <= 4 ? 'acc_thick_socks' : 'acc_socks');

    // Weather gear assembly. Sunglasses (face) are independent of the hand-held item.
    if (strongSun && !heavyWet && precip < 50) gear.push('gear_sunglasses');
    if (raincoat) gear.push('gear_raincoat');
    if (handheld) gear.push(handheld);

    // Notable conditions for the pop-up alert.
    const conditions = buildConditions({
      precip: precip, heavyRain: heavyRain, snowy: snowy, foggy: foggy, wind: wind, uv: uv,
      adjFeelsMin: adjFeelsMin, adjFeelsMax: adjFeelsMax, feelsMin: w.feelsMin, feelsMax: w.feelsMax,
    });

    // ---- §8.5 memo: computed after item assembly below ([v2] needs outfitClo) ----

    // ---- assemble ordered item list (z / animation order handled in character) ---
    const slots = {
      top: lower.dress ? null : top,
      bottom: (lower.bottom && window.itemById(lower.bottom).category === 'bottom') ? lower.bottom : null,
      skirt: (lower.bottom && window.itemById(lower.bottom).category === 'skirt') ? lower.bottom : null,
      dress: lower.dress || null,
      outerwear: raincoat ? null : outer,   // raincoat substitutes as the outer shell
      footwear: footwear,
      headwear: headwear,
    };

    // Hard rule: a dress replaces top + bottoms/skirts entirely — with a dress, only
    // outerwear / footwear / headwear / accessories / gear are allowed.
    if (slots.dress) { slots.top = null; slots.bottom = null; slots.skirt = null; }

    // De-dup gear (e.g. don't keep umbrella if raincoat) & accessories.
    const gearSet = dedupe(gear);
    const accSet = dedupe(accessories);

    const items = buildItemList(slots, accSet, gearSet);

    // ---- [v2] clo accounting: outfit total + targets (Part 4) --------------
    const outfitClo = items.reduce(function (s, it) { return s + cloOf(it.id); }, 0);
    const targetRest = v2 ? v2.targetRest : targetClo(adjFeelsMin);
    const targetMove = v2 ? v2.targetMove : targetMoveFor(adjFeelsMin, occasion);

    // ---- §8.5 time-window / removable-layer memo ---------------------------
    let memo = '';
    const swing = (w.feelsMax - w.feelsMin);
    const crossesBand = band.key !== warmBand.key;
    const outerName = outer ? window.itemName(outer).toLowerCase() : (raincoat ? 'raincoat' : null);
    const outerId = outer || (raincoat ? 'gear_raincoat' : null);
    if (useV2 && outerId && (outfitClo - targetClo(adjFeelsMax)) >= 0.2) {
      // [v2] §4.5 quantitative version: name the layer and its clo value.
      memo = 'It warms to about ' + Math.round(w.feelsMax) + '°C around ' + fmtHour(w.peakHour) +
        ' — the ' + outerName + ' (~' + (Math.round(cloOf(outerId) * 10) / 10) + ' clo) can come off.';
    } else if ((swing >= 5 || crossesBand) && outerName) {
      memo = 'It warms to about ' + Math.round(w.feelsMax) + '°C around ' + fmtHour(w.peakHour) +
        ', so you can take off your ' + outerName + ' later.';
    } else if (swing >= 5 || crossesBand) {
      memo = 'It warms to about ' + Math.round(w.feelsMax) + '°C around ' + fmtHour(w.peakHour) +
        ', so you can lighten up in the afternoon.';
    }
    // Colder by the end of the window (e.g. an evening return).
    if (w.endFeels !== null && w.startFeels !== null && (w.endFeels <= w.startFeels - 3) && outerName) {
      const tail = 'It cools to about ' + Math.round(w.endFeels) + '°C by ' + fmtHour(w.endHour) +
        ', so keep your ' + outerName + ' on for the trip home.';
      memo = memo ? (memo + ' ' + tail) : tail;
    }
    // [v2] §4.2 saturation: target above what the closet can reach — be honest.
    if (useV2 && v2 && v2.saturated) {
      const sat = 'Seriously cold — Hazel\'s dressed as warm as her closet allows; keep moving and warm up indoors when you can.';
      memo = memo ? (sat + ' ' + memo) : sat;
    }

    // ---- [v2] Part 5: material layer — pure post-selection ANALYSIS. It
    // never changes which items were chosen above (§5 design intent).
    let material = null;
    if (useV2) {
      material = materialAnalysis(items, w, occasion, adjFeelsMin, adjFeelsMax, snowy, targetMove, targetRest);
    }

    return {
      band: band.key,
      adjFeelsMin: adjFeelsMin,
      adjFeelsMax: adjFeelsMax,
      bodyOffset: offset,
      slots: slots,
      accessories: accSet,
      gear: gearSet,
      items: items,
      clo: {
        engine: useV2 ? 'v2' : 'v1',
        target: Math.round(targetRest * 100) / 100,
        targetMove: Math.round(targetMove * 100) / 100,
        coreClo: v2 ? Math.round(v2.coreClo * 100) / 100 : null,
        outfitClo: Math.round(outfitClo * 100) / 100,
        saturated: !!(v2 && v2.saturated),
      },
      material: material,
      memo: memo,
      conditions: conditions,
      summary: {
        feelsMin: w.feelsMin, feelsMax: w.feelsMax,
        tempMin: w.tempMin, tempMax: w.tempMax,
        precipPeak: Math.round(precip), uvPeak: Math.round(uv * 10) / 10,
        windPeak: Math.round(wind), sunny: sunny, peakHour: w.peakHour,
      },
    };
  }

  function dedupe(arr) { const s = []; arr.forEach(function (x) { if (s.indexOf(x) === -1) s.push(x); }); return s; }

  // Flat ordered list of chosen item ids with their slot label, built back→front to
  // match the layer/z order (socks · footwear · tights · bottoms/skirts · dress · top ·
  // outerwear · headwear · accessories · weather gear) so they also fly on in that order.
  function buildItemList(slots, acc, gear) {
    const list = [];
    function add(id, slot) { if (id) list.push({ id: id, slot: slot }); }
    function has(a, id) { return a.indexOf(id) !== -1; }

    add(has(acc, 'acc_thick_socks') ? 'acc_thick_socks' : (has(acc, 'acc_socks') ? 'acc_socks' : null), 'socks');
    add(slots.footwear, 'footwear');
    if (has(acc, 'acc_tights')) add('acc_tights', 'legwear');
    add(slots.bottom, 'bottom');
    add(slots.skirt, 'skirt');
    add(slots.dress, 'dress');
    add(slots.top, 'top');
    add(slots.outerwear, 'outerwear');
    if (has(gear, 'gear_raincoat')) add('gear_raincoat', 'outerwear');
    // Redraw the face on top of the coat collar when an outer shell is worn — but NOT
    // if a hat is also worn, since the hat sprite already carries its own face.
    if ((slots.outerwear || has(gear, 'gear_raincoat')) && !slots.headwear) add('head_face_for_outerwear', 'faceoverlay');
    add(slots.headwear, 'headwear');
    if (has(acc, 'acc_scarf')) add('acc_scarf', 'scarf');
    if (has(acc, 'acc_gloves')) add('acc_gloves', 'gloves');
    if (has(gear, 'gear_umbrella')) add('gear_umbrella', 'handheld');
    if (has(gear, 'gear_parasol')) add('gear_parasol', 'handheld');
    if (has(gear, 'gear_sunglasses')) add('gear_sunglasses', 'sunglasses');
    return list;
  }

  function fmtHour(h) {
    const ampm = h < 12 ? 'am' : 'pm';
    let hh = h % 12; if (hh === 0) hh = 12;
    return hh + ' ' + ampm;
  }

  window.recommend = recommend;
  // [v2] exposed for the §4.6 invariants (?dev) and A/B comparison. Read-only use.
  window.ThermalV2 = {
    enabled: USE_THERMAL_V2,
    targetClo: targetClo,
    targetMove: targetMoveFor,
    MET: MET,
    BANDS: BANDS,
    bandFor: bandFor,
    appropriate: appropriate,
    BOTTOM_PREF_V2: BOTTOM_PREF_V2,
  };
})();
