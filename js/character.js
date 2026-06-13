/* Hazel's Wearcast — character compositing + dress-up animation (PRD §10)
 *
 * The garment sprites share the base character's registration: every PNG is drawn
 * on the same 437x1211 canvas with the item already positioned on the body
 * (PRD §11). So compositing is simple — a worn layer just fills the stage and lines
 * up with the base automatically. Only the stacking order matters, so that (e.g.)
 * outerwear sits over the top, a hat over the hair, sunglasses over the face.
 */
(function () {
  'use strict';

  // Stacking order (higher = front). Falls back by category, then a default.
  // Spec order, back→front:
  //   socks · tights · footwear · bottoms/skirts · dresses/pajama · tops ·
  //   outerwear · headwear · accessories (scarf/gloves) · weather gear
  //   (hand-helds + sunglasses, highest so they read on the hand/face).
  // Footwear sits *below* bottoms so hems drape over the shoe tops.
  // §3.9: tights are full-leg sprites (feet included) — they live with the socks
  // (12, under the shoes) so footwear covers the tights' feet. Tuckable bottoms
  // (leggings) lift footwear to 22 via the exception pass below.
  const Z = {
    acc_socks: 10, acc_thick_socks: 10,
    acc_tights: 12,
    footwear: 14,
    bottom: 20, skirt: 20,
    dress: 24, pajama: 24,
    top: 30,
    outerwear: 40, gear_raincoat: 42,
    headwear: 50,
    acc_scarf: 58, acc_gloves: 60,
    gear_umbrella: 72, gear_parasol: 72, gear_sunglasses: 78,
  };

  function zFor(id) {
    if (Z[id] != null) return Z[id];
    const it = window.itemById(id);
    return (it && Z[it.category] != null) ? Z[it.category] : 35;
  }

  /* Per-asset fit on top of the shared registration. The sprites already sit in the
   * right place, but a few read better slightly enlarged (so they sit "worn" and
   * cover the pajama base) or nudged (handhelds). Values:
   *   s   scale factor
   *   dx  horizontal nudge, % of stage width   (+ = right)
   *   dy  vertical nudge, % of stage height     (+ = down)
   *   ox,oy  transform-origin %, so a piece grows from the body point it hangs on
   * Defaults come from the category; per-id entries win. */
  const CAT_FIT = {
    top:       { s: 0.856, dy: 8.04, ox: 50, oy: 20 }, // all tops share the tank top's image size + location
    dress:     { s: 1.05, ox: 50, oy: 32 },
    pajama:    { sx: 1.05, sy: 1.16, ox: 50, oy: 18 }, // sleeping pajamas (dress_long_sleeve) — lengthened, anchored at the shoulders so the collar stays put while the pants reach down over the ankles
    skirt:     { sx: 0.91, sy: 0.80, dx: -0.5, dy: 9.4, ox: 50, oy: 50 }, // fallback; per-id entries below pin waist at 46% and hem at the right length
    bottom:    { sx: 1.06, sy: 1.48, dy: 20.7, ox: 50, oy: 50 }, // fallback full-pant fit; every bottom has a per-id entry below that lands its waistband on the waist line and its hem at the right length
    outerwear: { s: 1.77, ox: 50, oy: 20 },            // ALL outers share this one scale: they share the base's canvas registration, but the asset bodies are drawn ~1.77x smaller than the base, so a single scale maps every one onto the body (shoulders covered, sleeves reaching the wrists). Anchored at the shoulder (oy:20) so each grows DOWN; the sprites' own bbox sizes correctly keep a coat bulkier/longer than a cardigan.
    footwear:  { s: 0.40, dy: 0, ox: 50, oy: 100 },    // contain-fit (CSS) anchors the pair at the floor; scale to foot size, grow from the sole (oy:100)
    headwear:  { s: 1.0, dy: -9, ox: 50, oy: 50 },     // fallback; each hat has a personalized dy (ID_FIT) to land its eyes on the base eyes
    accessory: { s: 1.03, ox: 50, oy: 40 },
    gear:      { s: 1.0,  ox: 50, oy: 40 },
  };
  const ID_FIT = {
    // Every bottom sprite is drawn on the shared canvas with its waistband peaking
    // high in front (~33%), but the character actually WEARS bottoms lower — on the
    // true waist band the user marked at ~46% of the stage. So each entry drops the
    // waistband onto that 46% line and then sizes the legs:
    //   · pants/leggings are drawn SHORT, so they stretch DOWN to their anatomical hem
    //     (full pants -> ankle ~88%, leggings -> knee ~62%).
    //   · shorts are drawn at natural length, so they keep ~natural vertical scale
    //     (sy~0.95, no squish of the strawberry print) and the hem falls where it lands.
    // transform = translate(0,dy%) scale(sx,sy) about origin 50%,50%.
    // Recompute if a sprite's art changes: sy=(hem%-46)/(spriteBot%-spriteTop%),
    // dy=46 - sy*spriteTop% - 50*(1-sy).  (shorts: pick sy~0.95 instead.)
    bottom_jeans:         { sx: 1.16, sy: 1.483, dx: -0.5, dy: 19.8432, ox: 50, oy: 50 }, // -> ankle
    bottom_slacks:        { sx: 1.16, sy: 1.437, dx: -0.5, dy: 18.2016, ox: 50, oy: 50 }, // -> ankle
    bottom_chinos:        { sx: 1.16, sy: 1.449, dx: -0.5, dy: 18.384, ox: 50, oy: 50 }, // -> ankle
    bottom_fleece_jeans:  { sx: 1.16, sy: 1.353, dx: -0.5, dy: 17.7696, ox: 50, oy: 50 }, // -> ankle
    bottom_fleece_pants:  { sx: 1.16, sy: 1.364, dx: -0.5, dy: 18.048, ox: 50, oy: 50 }, // -> ankle
    bottom_joggers:       { sx: 1.16, sy: 1.491, dx: -0.5, dy: 19.9776, ox: 50, oy: 50 }, // -> ankle (cuffed)
    bottom_long_leggings: { sx: 1.16, sy: 1.929, dx: -0.5, dy: 26.5056, ox: 50, oy: 50 }, // drawn very short -> stretch to the ankle
    bottom_short_leggings:{ sx: 1.16, sy: 1.2852, dx: 0, dy: 14.84928, ox: 50, oy: 50 }, // waist pinned at 46%, stretched longer
    bottom_shorts:        { sx: 1.034, sy: 0.893, dy: 10.7328, ox: 50, oy: 50 }, // natural scale -> mid-thigh
    bottom_denim_shorts:  { sx: 0.91, sy: 0.950, dy: 11.81, ox: 50, oy: 50 }, // natural scale -> mid-thigh
    // Skirts: same waist anchor (46%) and width/offset as bottoms.
    // sy=(hem%-46)/(spriteBot%-spriteTop%), dy=46 - sy*spriteTop% - 50*(1-sy).
    skirt_mini:           { sx: 0.778, sy: 0.6465, dx: -0.5, dy:  6.54, ox: 50, oy: 50 }, // -> mid-thigh
    skirt_midi:           { sx: 0.778, sy: 0.656, dx: -6.5, dy:  6.81, ox: 50, oy: 50 }, // -> mid-calf
    skirt_long:           { sx: 0.91, sy: 0.804, dx: -6.5, dy:  9.37, ox: 50, oy: 50 }, // -> ankle
    skirt_fleece:         { sx: 0.731, sy: 0.6512, dx: -0.5, dy:  6.75, ox: 50, oy: 50 }, // -> between mini and midi
    top_short_sleeve_tee: { s: 0.871836 },
    top_polo:             { s: 0.959039, dy: 6.32735, dx: -0.5 },
    top_light_shirt:      { s: 0.9416, dy: 7.26546 },
    top_long_sleeve_tee:  { s: 1.0046, dy: 8.89573 },
    top_sweatshirt:       { s: 0.9947, dy: 8.19106, dx: -0.5 },
    top_hoodie:           { s: 0.9887, dy: 7.26751 },
    top_light_knit:       { s: 0.9887, dy: 8.71543 },
    top_heavy_knit:       { s: 0.9793, dx: -0.7, dy: 8.8933 },
    top_turtleneck:       { s: 0.9981, dy: 5.79398 },
    top_tank:             { s: 0.84744, dy: 7.6444, ox: 50, oy: 20 },  // neckline at upper chest, straps on shoulders
    dress_sleeveless:     { s: 0.78889, dy: 8.1606, ox: 50, oy: 20 },  // same position as tank top
    dress_short_sleeve:   { s: 0.78889, dy: 8.1606, ox: 50, oy: 20 },
    dress_long_sleeve:    { s: 0.856, dy: 8.04, ox: 50, oy: 20 },
    dress_knit:           { sx: 1.0046, sy: 0.90414, dy: 9.549 },
    dress_long_sleeve:    { sx: 0.85391, sy: 0.80695, dy: 9.151 },  // sleeping pajamas
    // Every footwear sprite was widened so its left/right pieces sit at the same
    // spread from centre as the sandals (each piece ~16.6% of body-width out, i.e.
    // under each foot). Per-shoe s = 0.40 * widenedWidth/nativeWidth keeps each shoe
    // the same on-foot SIZE while only the gap grows. Backups: *_orig_backup.png.
    shoe_sandals:         { s: 0.66464 },   // 240 -> 316; +10%
    shoe_sneakers:        { s: 0.77111, dy: 2 },   // 254 -> 336; +10%
    shoe_loafers:         { s: 0.76491, dx: -0.7, dy: 1 },   // 245 -> 313; +10%
    shoe_boots:           { s: 0.79124 },   // 267 -> 351; +10%
    shoe_rain_boots:      { s: 0.70860 },   // 267 -> 357; +10%
    // Hats: each "…_face_no_side_hair" sprite has its face drawn at a different height,
    // so each gets its own dy that lands ITS eyes exactly on the base character's eyes
    // (measured eye-centroid Y: base 15.8% · cap/beanie 25.0% · bucket 34.3%). dx stays 0
    // since the faces are drawn centred.
    hat_cap:              { dy: -9.2 },
    hat_beanie:           { dy: -9.2 },
    hat_bucket:           { dy: -18.5 },
    outer_light_cardigan: { s: 1.67090, dy: 8.0305 },
    outer_heavy_cardigan: { s: 1.67090, dx: -1, dy: 8.3714 },
    outer_windbreaker:    { s: 1.67090, dy: 7.22745 },
    outer_denim_jacket:   { s: 1.67090, dy: 7.22745 },
    outer_blazer:         { s: 1.67090, dy: 7.22745 },
    outer_leather_jacket: { s: 1.67090, dy: 7.22745 },
    outer_trench_coat:    { s: 1.67090, dy: 8.0305 },
    outer_coat:           { s: 1.67090, dy: 8.0305 },
    outer_fleece_jacket:  { s: 1.67090, dy: 6.19668 },
    outer_light_puffer:   { s: 1.67090, dy: 6.8661 },
    outer_short_puffer:   { s: 1.67090, dy: 5.59602 },
    outer_long_puffer:    { s: 1.67090, dy: 7.6290 },
    // (Other outerwear uses the single CAT_FIT.outerwear scale. Verified across the full
    //  size range: blazer, trench, coat, long puffer, windbreaker all sit correctly at 1.77.)
    // handhelds: scaled around the drawn grip (~52%,50% of the canvas) and shifted right
    // so the hand lands on her left hand; canopy rides up & out, clear of her face.
    gear_umbrella:    { s: 1.38, dx: 30, dy: 11, rot: 13, ox: 52, oy: 50 }, // bigger so the hand reads larger; fits the wider stage
    gear_parasol:     { s: 1.33, dx: 31, dy: 11, rot: 16, ox: 52, oy: 50 },
    gear_raincoat:    { s: 1.30441, dy: 9.60855, ox: 50, oy: 18 },   // sleepwear position info (oy/dy), with the raincoat's own body-covering scale
    gear_sunglasses:  { s: 1.28, dy: -1, ox: 50, oy: 18.5 }, // nudged up so they hide the whole eye
    acc_scarf:        { s: 1.04, dy: 8, ox: 50, oy: 24 },    // dropped onto the neck (was over the mouth)
    acc_gloves:       { s: 1.22, dy: 4, ox: 50, oy: 46 },    // bigger + lower so the mittens cover the hands
    acc_tights:       { s: 1.3569, dy: 16.68, ox: 50, oy: 50 }, // uniform scale (aspect-preserving): waist on the 46% line, hem at the very bottom (~99%)
    acc_socks:        { s: 1.51142, dy: 17.3, ox: 50, oy: 92 },   // +20% size total; lowered 20%
    acc_thick_socks:  { s: 1.37404, dy: 12, ox: 50, oy: 92 },   // +10% scale
  };

  function fitFor(id) {
    const it = window.itemById(id);
    const base = (it && CAT_FIT[it.category]) || { ox: 50, oy: 50 };
    const ov = ID_FIT[id] || {};
    function pick(k, d) { return ov[k] != null ? ov[k] : (base[k] != null ? base[k] : d); }
    const s = pick('s', 1);
    return {
      sx: pick('sx', s), sy: pick('sy', s),
      dx: pick('dx', 0), dy: pick('dy', 0),
      ox: pick('ox', 50), oy: pick('oy', 50),
      rot: pick('rot', 0),
    };
  }

  function applyFit(img, id) {
    const f = fitFor(id);
    img.style.transformOrigin = f.ox + '% ' + f.oy + '%';
    img.style.transform = 'translate(' + f.dx + '%, ' + f.dy + '%) rotate(' + f.rot + 'deg) scale(' + f.sx + ', ' + f.sy + ')';
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function Character(stageEl, closetEl) {
    this.stage = stageEl;       // .character-stage (position: relative)
    this.closet = closetEl;     // closet grid (flight sources)
    this.layerWrap = stageEl.querySelector('.layers');
    this.flightLayer = document.querySelector('.flight-layer');
    this.current = [];          // currently-worn layer <img> elements
  }

  /* §3.9 stacking exception: "leggings tuck INTO boots, jeans drape OVER them"
   * is a conditional pair a single global order can't express. When a worn
   * bottom is flagged `tuckable` (the leggings), footwear lifts to 22 — above
   * bottoms (20), below dresses (24). */
  function tuckActive(items) {
    return items.some(function (it) {
      const rec = window.itemById(it.id);
      return !!(rec && rec.category === 'bottom' && rec.tuckable);
    });
  }
  function zForWorn(id, tuck) {
    if (tuck) {
      const rec = window.itemById(id);
      if (rec && rec.category === 'footwear') return 22;
    }
    return zFor(id);
  }
  /* §3.9-3: paint (and fly-in) order is derived by sorting the worn items on
   * their RESOLVED z (stable on ties), so it can never disagree with stacking. */
  function sortByZ(items, tuck) {
    return items
      .map(function (it, i) { return { it: it, i: i, z: zForWorn(it.id, tuck) }; })
      .sort(function (a, b) { return (a.z - b.z) || (a.i - b.i); });
  }

  // Build (hidden) layer images for an outfit; returns array of {id, slot, img}.
  Character.prototype._buildLayers = function (items) {
    const self = this;
    const tuck = tuckActive(items);
    return sortByZ(items, tuck).map(function (e) {
      const it = e.it;
      const img = document.createElement('img');
      img.className = 'layer';          // CSS sizes it to fill the stage
      const cat = (window.itemById(it.id) || {}).category;
      if (cat === 'footwear') img.classList.add('footwear');  // aspect-preserving fit (CSS)
      img.alt = window.itemName(it.id);
      img.src = window.spriteUrl(it.id);
      img.style.opacity = '0';
      img.dataset.id = it.id;
      img.style.zIndex = String(e.z);   // resolved z (incl. the tuck exception)
      applyFit(img, it.id);             // per-asset scale/nudge for a natural fit
      self.layerWrap.appendChild(img);
      return { id: it.id, slot: it.slot, img: img };
    });
  };

  // Animate one garment flying from its closet tile to its worn position.
  Character.prototype._fly = function (layer) {
    const tile = this.closet.querySelector('[data-id="' + layer.id + '"] img') ||
                 this.closet.querySelector('[data-id="' + layer.id + '"]');
    const dest = layer.img.getBoundingClientRect();   // the full stage box
    if (dest.width === 0) { layer.img.style.opacity = '1'; return Promise.resolve(); }

    const clone = document.createElement('img');
    clone.src = layer.img.src;
    clone.className = 'flier';
    const from = tile ? tile.getBoundingClientRect()
      : { left: window.innerWidth / 2, top: -60, width: dest.width, height: dest.height };

    clone.style.left = dest.left + 'px';
    clone.style.top = dest.top + 'px';
    clone.style.width = dest.width + 'px';
    clone.style.height = dest.height + 'px';
    this.flightLayer.appendChild(clone);

    // Start the flier shrunk down onto the closet tile, then grow it into place so
    // the garment "flies" out of the closet and onto the body.
    const dx = (from.left + from.width / 2) - (dest.left + dest.width / 2);
    const dy = (from.top + from.height / 2) - (dest.top + dest.height / 2);
    const sx = Math.max(0.12, from.width / dest.width);

    const dur = 420 + Math.random() * 360; // 0.42–0.78s (PRD §10)
    const anim = clone.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ') rotate(-7deg)', opacity: 0.85 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: dur, easing: 'cubic-bezier(.34,1.4,.5,1)' });

    let done = false;
    const reveal = function () {
      if (done) return; done = true;
      layer.img.style.opacity = '1';          // reveal the worn garment
      if (clone.parentNode) clone.remove();
    };
    // Reveal when the flight lands; a wall-clock fallback guarantees the garment
    // still appears even if the animation's finished promise doesn't fire.
    const fallback = setTimeout(reveal, dur + 220);
    return anim.finished.catch(function () {}).then(function () { clearTimeout(fallback); reveal(); });
  };

  // Dress the character with an ordered item list. Returns a promise.
  Character.prototype.dress = function (items) {
    const self = this;
    // Clear the PREVIOUS outfit completely before flying in the new one (PRD §10
    // re-run = swap, not stack). We query the DOM for every worn layer (not just the
    // tracked refs) and remove each with a wall-clock fallback, so a flaky animation
    // promise can never leave an old garment layered behind. Any in-flight clones
    // from a rapid re-press are dropped too.
    Array.prototype.slice.call(this.layerWrap.querySelectorAll('.layer')).forEach(function (img) {
      const remove = function () { if (img.parentNode) img.remove(); };
      try { img.animate([{ opacity: Number(getComputedStyle(img).opacity) || 1 }, { opacity: 0 }],
        { duration: 160 }).finished.catch(function () {}).then(remove); } catch (e) { remove(); }
      setTimeout(remove, 240);
    });
    if (this.flightLayer) this.flightLayer.innerHTML = '';
    this.current = [];

    const layers = this._buildLayers(items);
    self.current = layers;
    self.stage.classList.add('dressed');

    // Fly the garments in layer order with a SLIGHT stagger (PRD §10): each starts
    // a beat after the previous one rather than waiting for it to land, so the whole
    // dress-up reads as a quick overlapping "whoosh", not a slow one-at-a-time queue.
    const STAGGER = 130;
    const promises = layers.map(function (layer, i) {
      return new Promise(function (resolve) {
        setTimeout(function () { self._fly(layer).then(resolve, resolve); }, i * STAGGER);
      });
    });
    return Promise.all(promises);
  };

  Character.prototype.reset = function () {
    this.current.forEach(function (l) { if (l.img) l.img.remove(); });
    this.current = [];
    this.stage.classList.remove('dressed');
  };

  // Manual coordination: incrementally bring the worn outfit to `items` — add the new
  // pieces, fade out the dropped ones, keep the rest. Snappy (no fly-in) so tapping
  // closet items feels instant. Shares the same z-order (zFor) and fit (applyFit).
  Character.prototype.coordinate = function (items) {
    const self = this;
    const want = {};
    items.forEach(function (it) { want[it.id] = it; });

    // Drop layers no longer wanted (quick fade; guarded against an immediate re-add).
    Array.prototype.slice.call(this.layerWrap.querySelectorAll('.layer')).forEach(function (img) {
      if (!want[img.dataset.id]) {
        img.dataset.removing = '1';
        img.style.transition = 'opacity .14s ease';
        img.style.opacity = '0';
        setTimeout(function () { if (img.dataset.removing === '1' && img.parentNode) img.remove(); }, 150);
      }
    });

    // Add or refresh the wanted layers (resolved z: §3.9 tuck exception included,
    // and applied to ALL kept layers so footwear z updates when leggings toggle).
    const tuck = tuckActive(items);
    const built = sortByZ(items, tuck).map(function (e) {
      const it = e.it;
      let img = self.layerWrap.querySelector('.layer[data-id="' + it.id + '"]');
      if (img) {                                   // already worn — keep, cancel any pending removal
        delete img.dataset.removing;
        img.style.opacity = '1';
      } else {
        img = document.createElement('img');
        img.className = 'layer';
        if ((window.itemById(it.id) || {}).category === 'footwear') img.classList.add('footwear');
        img.alt = window.itemName(it.id);
        img.src = window.spriteUrl(it.id);
        img.dataset.id = it.id;
        img.style.opacity = '1';
        self.layerWrap.appendChild(img);
      }
      img.style.zIndex = String(e.z);
      applyFit(img, it.id);
      return { id: it.id, slot: it.slot, img: img };
    });
    this.current = built;
    this.stage.classList.toggle('dressed', built.length > 0);
  };

  window.Character = Character;
})();
