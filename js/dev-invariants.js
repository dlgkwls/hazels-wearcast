/* Hazel's Wearcast — [v2] §4.6 invariants (LOGIC.md Part 4/7).
 * Runs only with ?dev in the URL (hooked from app.js). Results go to the
 * console: each invariant console.asserts, and a v1-vs-v2 comparison table is
 * printed for the Part 7 acceptance eyeball ("differ only in selection within
 * bands — never in feasibility").
 */
(function () {
  'use strict';

  // Synthetic summarizeWindow() output: a flat one-temperature window, calm,
  // dry, partly cloudy (code 2 -> not "sunny", so no sun gear muddies asserts).
  function W(T, opts) {
    return Object.assign({
      rows: [],
      feelsMin: T, feelsMax: T,
      tempMin: T, tempMax: T,
      precipPeak: 0, uvPeak: 0, windPeak: 0,
      codes: [2],
      peakHour: 13,
      startFeels: T, endFeels: T,
      startHour: 9, endHour: 18,
      rhPeak: 50,
    }, opts || {});
  }

  const OCCASIONS = ['Play', 'Active', 'School', 'Work'];

  window.runThermalInvariants = function () {
    const TV = window.ThermalV2;
    const rec = function (T, occ, opts) { return window.recommend(W(T), occ, 'normal', opts); };
    let failures = 0;
    function check(cond, label) {
      console.assert(cond, '[invariant] FAIL: ' + label);
      if (!cond) failures++;
    }

    console.log('%c[invariants] thermal v2 — engine enabled: ' + TV.enabled,
      'font-weight:bold');

    // 1. T = 30, every occasion: no outerwear, no boots, no puffer, no beanie,
    //    outfitClo <= 0.45.
    OCCASIONS.forEach(function (occ) {
      const r = rec(30, occ);
      check(!r.slots.outerwear, '1: no outerwear at 30°C (' + occ + ')');
      check(r.gear.indexOf('gear_raincoat') === -1, '1: no rain shell at 30°C (' + occ + ')');
      check(r.slots.footwear !== 'shoe_boots', '1: no boots at 30°C (' + occ + ')');
      check(JSON.stringify(r.items).indexOf('puffer') === -1, '1: no puffer at 30°C (' + occ + ')');
      check(r.slots.headwear !== 'hat_beanie', '1: no beanie at 30°C (' + occ + ')');
      check(r.clo.outfitClo <= 0.45, '1: outfitClo ' + r.clo.outfitClo + ' <= 0.45 (' + occ + ')');
    });

    // 2. T = -5, Active: outerwear present, gloves + scarf + beanie present,
    //    outfitClo >= 1.4.
    (function () {
      const r = rec(-5, 'Active');
      check(!!r.slots.outerwear || r.gear.indexOf('gear_raincoat') !== -1, '2: outer present at -5°C Active');
      check(r.accessories.indexOf('acc_scarf') !== -1, '2: scarf at -5°C Active');
      check(r.accessories.indexOf('acc_gloves') !== -1, '2: gloves at -5°C Active');
      check(r.slots.headwear === 'hat_beanie', '2: beanie at -5°C Active');
      check(r.clo.outfitClo >= 1.4, '2: outfitClo ' + r.clo.outfitClo + ' >= 1.4 at -5°C Active');
    })();

    // 3. Monotonicity: T sweeping 30 -> -10 (occasion fixed), outfitClo never
    //    DECREASES by more than 0.05 as it gets colder.
    OCCASIONS.forEach(function (occ) {
      let prev = null;
      for (let T = 30; T >= -10; T--) {
        const c = rec(T, occ).clo.outfitClo;
        if (prev !== null) check(c >= prev - 0.05,
          '3: monotonicity ' + occ + ' at ' + T + '°C (' + c + ' vs ' + prev + ')');
        prev = c;
      }
    });

    // 4. A puffer is never chosen when T > 10.
    OCCASIONS.forEach(function (occ) {
      for (let T = 10.5; T <= 30; T += 0.5) {
        const r = rec(T, occ);
        check(String(r.slots.outerwear || '').indexOf('puffer') === -1,
          '4: no puffer at ' + T + '°C (' + occ + ')');
      }
    });

    // 5./6. Structural rules still hold across the sweep:
    //   dress chosen => top/bottom/skirt all null; Active never skirt/dress.
    OCCASIONS.forEach(function (occ) {
      for (let T = 30; T >= -10; T -= 2) {
        const r = rec(T, occ);
        if (r.slots.dress) {
          check(!r.slots.top && !r.slots.bottom && !r.slots.skirt,
            '5: dress nulls top/bottom/skirt at ' + T + '°C (' + occ + ')');
        }
        if (occ === 'Active') {
          check(!r.slots.skirt && !r.slots.dress, '6: Active never skirt/dress at ' + T + '°C');
        }
      }
    });

    // 6b. Work is long-trousers only — never a skirt or dress at any temperature
    //     (incl. heat), and the bottom is always one of the Work long-pants prefs.
    (function () {
      const WORK_PANTS = TV.BOTTOM_PREF_V2.Work;
      for (let T = 42; T >= -10; T -= 1) {
        const r = rec(T, 'Work');
        check(!r.slots.skirt, '6b: Work never skirt at ' + T + '°C');
        check(!r.slots.dress, '6b: Work never dress at ' + T + '°C');
        check(!!r.slots.bottom && WORK_PANTS.indexOf(r.slots.bottom) !== -1,
          '6b: Work bottom "' + r.slots.bottom + '" is a long pant at ' + T + '°C');
      }
    })();

    // 6c. Work dress-code bans — none of these items ever appear in a Work outfit,
    //     across temperatures AND sunny/wet conditions that would otherwise add
    //     sunglasses / rain boots / sandals / a windbreaker.
    (function () {
      const BANNED = ['top_tank', 'top_sweatshirt', 'top_hoodie', 'bottom_shorts',
        'bottom_denim_shorts', 'bottom_jeans', 'bottom_joggers', 'bottom_short_leggings',
        'outer_windbreaker', 'shoe_sandals', 'shoe_rain_boots', 'gear_sunglasses'];
      const SCENARIOS = [
        function (T) { return W(T); },                                    // calm/dry
        function (T) { return W(T, { uvPeak: 9, codes: [0] }); },         // bright sun
        function (T) { return W(T, { precipPeak: 90, codes: [65] }); },   // heavy rain
      ];
      for (let T = 42; T >= -10; T -= 1) {
        SCENARIOS.forEach(function (mk, si) {
          const r = window.recommend(mk(T), 'Work', 'normal');
          const ids = r.items.map(function (it) { return it.id; });
          BANNED.forEach(function (b) {
            check(ids.indexOf(b) === -1,
              '6c: Work wears banned "' + b + '" at ' + T + '°C (scenario ' + si + ')');
          });
        });
      }
    })();

    // 6d. shopNeeded is exactly (optimized material score < 90), and is set for at
    //     least one real input (else the gate is dead). Sweep all occasions.
    (function () {
      let everTrue = false;
      OCCASIONS.forEach(function (occ) {
        for (let T = 45; T >= -12; T -= 1) {
          const r = rec(T, occ);
          const expect = !!(r.material && r.material.scoreOptimized < 90);
          check(r.shopNeeded === expect,
            '6d: shopNeeded ' + r.shopNeeded + ' != (opt ' + (r.material && r.material.scoreOptimized) +
            ' < 90) at ' + T + '°C (' + occ + ')');
          if (r.shopNeeded) everTrue = true;
        }
      });
      check(everTrue, '6d: shopNeeded never triggers across the full sweep (dead gate?)');
    })();

    // 6e. recommendVariants: ≥1 look; [0] equals the plain recommend() pick; every
    //     core is DISTINCT; every ALTERNATIVE (index ≥ 1) scores base ≥ 95; and the
    //     feature actually yields >1 look somewhere (else it's dead).
    (function () {
      let everMultiple = false;
      OCCASIONS.forEach(function (occ) {
        [28, 24, 20, 16, 12, 6, 0].forEach(function (T) {
          const list = window.recommendVariants(W(T), occ, 'normal', { max: 5, minScore: 95 });
          check(list.length >= 1, '6e: empty variants at ' + T + '°C (' + occ + ')');
          if (!list.length) return;
          check(list[0].coreSig === rec(T, occ).coreSig,
            '6e: variants[0] != primary at ' + T + '°C (' + occ + ')');
          const sigs = {};
          list.forEach(function (v, i) {
            check(!sigs[v.coreSig], '6e: duplicate core "' + v.coreSig + '" at ' + T + '°C (' + occ + ')');
            sigs[v.coreSig] = 1;
            if (i >= 1) check(v.material && v.material.scoreBase >= 95,
              '6e: alternative #' + i + ' scores ' + (v.material && v.material.scoreBase) +
              ' < 95 at ' + T + '°C (' + occ + ')');
          });
          if (list.length > 1) everMultiple = true;
        });
      });
      check(everMultiple, '6e: recommendVariants never returns >1 look (dead feature?)');
    })();

    // 7. Floor respected: targetMove(T, Active) >= targetClo(T + 4).
    for (let T = 30; T >= -10; T--) {
      check(TV.targetMove(T, 'Active') >= TV.targetClo(T + 4) - 1e-9,
        '7: targetMove floor at ' + T + '°C');
    }

    // 8. scoreOptimized >= scoreBase for every input (the asIs option
    //    guarantees it — §5.2, §5.5).
    OCCASIONS.forEach(function (occ) {
      for (let T = 30; T >= -10; T -= 2) {
        const m = rec(T, occ).material;
        check(m && m.scoreOptimized >= m.scoreBase,
          '8: scoreOptimized ' + (m && m.scoreOptimized) + ' >= scoreBase ' + (m && m.scoreBase) +
          ' at ' + T + '°C (' + occ + ')');
      }
    });

    // 9. Footwear/headwear/accessories/gear never receive a material line, and
    //    their clo never changes (§5.3) — notes only ever name analyzable
    //    categories, and the analysis' base total equals the reported outfitClo.
    const ANALYZABLE = { top: 1, bottom: 1, skirt: 1, dress: 1, outerwear: 1 };
    OCCASIONS.forEach(function (occ) {
      [30, 22, 13, 4, -5].forEach(function (T) {
        const r = rec(T, occ);
        (r.material ? r.material.notes : []).forEach(function (n) {
          const cat = (window.itemById(n.id) || {}).category;
          check(!!ANALYZABLE[cat], '9: material line on excluded item ' + n.id + ' (' + cat + ')');
        });
        check(r.material && Math.abs(r.material.baseClo - r.clo.outfitClo) < 0.005,
          '9: analysis base ' + (r.material && r.material.baseClo) + ' == outfitClo ' +
          r.clo.outfitClo + ' at ' + T + '°C (' + occ + ')');
      });
    });

    // 10. When precipPeak >= 50 %, the material named best for outerwear is
    //     never wet-sensitive (§5.4).
    const WET_SENSITIVE = { linen: 1, jerseyModal: 1, cottonLight: 1, denim: 1 };
    OCCASIONS.forEach(function (occ) {
      [22, 18, 13, 8, 2].forEach(function (T) {
        const r = window.recommend(W(T, { precipPeak: 60, codes: [61] }), occ, 'normal');
        (r.material ? r.material.notes : []).forEach(function (n) {
          const cat = (window.itemById(n.id) || {}).category;
          if (cat === 'outerwear') {
            check(!WET_SENSITIVE[n.material],
              '10: wet-sensitive "' + n.material + '" named best for outerwear at ' + T + '°C (' + occ + ')');
          }
        });
      });
    });

    // 11. Wind is a COLD signal only. Strong wind (≥30 km/h) must NOT add a
    //     beanie/scarf/gloves in mild or hot weather — only when it's also cold
    //     (adjFeelsMin ≤ 10). Guards the "beanie in 40 °C" regression.
    const WARM_ACC = ['hat_beanie', 'acc_scarf', 'acc_gloves'];
    OCCASIONS.forEach(function (occ) {
      [40, 30, 24, 18, 13].forEach(function (T) {       // all warmer than 10 °C
        const r = window.recommend(W(T, { windPeak: 45 }), occ, 'normal');
        const worn = [r.slots.headwear].concat(r.accessories);
        WARM_ACC.forEach(function (id) {
          check(worn.indexOf(id) === -1,
            '11: no ' + id + ' in ' + T + '°C wind 45 km/h (' + occ + ')');
        });
      });
      // ...but a cold windy day still bundles up the extremities.
      (function () {
        const r = window.recommend(W(6, { windPeak: 45 }), occ, 'normal');
        check(r.slots.headwear === 'hat_beanie', '11: beanie at 6°C windy (' + occ + ')');
        check(r.accessories.indexOf('acc_scarf') !== -1, '11: scarf at 6°C windy (' + occ + ')');
        check(r.accessories.indexOf('acc_gloves') !== -1, '11: gloves at 6°C windy (' + occ + ')');
      })();
    });

    // Acceptance (Part 7): v2 core picks stay inside v1's feasibility —
    //    every core item is in the band's lists, or reachable via the occasion
    //    preference lists AND temperature-appropriate.
    OCCASIONS.forEach(function (occ) {
      for (let T = 30; T >= -10; T -= 1) {
        const r = rec(T, occ);
        const band = TV.bandFor(T);
        const bandUnion = [].concat(band.tops, band.bottoms, band.outers || [], band.dresses || []);
        const prefUnion = TV.BOTTOM_PREF_V2[occ] || [];
        [r.slots.top, r.slots.bottom, r.slots.skirt, r.slots.dress, r.slots.outerwear]
          .filter(Boolean)
          .forEach(function (id) {
            // Work keeps long pants even in heat (policy), so a Work bottom from the
            // pref list is feasible regardless of tempRange; others must be appropriate.
            const ok = bandUnion.indexOf(id) !== -1 ||
                       (prefUnion.indexOf(id) !== -1 && (occ === 'Work' || TV.appropriate(id, T)));
            check(ok, 'acceptance: v2 pick "' + id + '" inside v1 feasibility at ' + T + '°C (' + occ + ')');
          });
      }
    });

    // A/B comparison table (eyeball aid): v1 vs v2 picks at band midpoints.
    const rows = [];
    [30, 25, 21, 18, 14, 10, 6.5, 2].forEach(function (T) {
      OCCASIONS.forEach(function (occ) {
        const a = rec(T, occ, { forceV1: true });
        const b = rec(T, occ);
        function core(r) {
          return [r.slots.dress || [r.slots.top, r.slots.bottom || r.slots.skirt].filter(Boolean).join('+'),
                  r.slots.outerwear || '—'].join(' / ');
        }
        rows.push({
          T: T, occ: occ,
          v1: core(a),
          v2: core(b),
          v2clo: b.clo.outfitClo + ' (target ' + b.clo.target + ')',
          same: core(a) === core(b) ? '=' : 'Δ',
        });
      });
    });
    console.table(rows);

    if (failures === 0) console.log('%c[invariants] ALL PASS ✓', 'color:green;font-weight:bold');
    else console.warn('[invariants] ' + failures + ' FAILURE(S) — see asserts above');
    return failures === 0;
  };
})();
