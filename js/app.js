/* Hazel's Wearcast — UI wiring (PRD §5, §6, §9, §10) */
(function () {
  'use strict';

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  const LS = {
    bodyType: 'wearcast.bodyType',
    location: 'wearcast.location',
    occasion: 'wearcast.occasion',
    showClo: 'wearcast.showClo',        // [v2] Part 6 engineering-details toggle
  };

  const state = {
    location: null,      // {label, latitude, longitude}
    occasion: 'Play',
    bodyType: 'normal',
    showClo: true,       // [v2] show clo chips (fabric chips always show)
    geoList: [],
    coordinating: true,                 // manual dress-up is on until Start shows the weather pick
    manual: { slots: {}, acc: [] },     // hand-picked outfit: one id per category + accessory list
    variants: { sig: null, list: [], index: 0 },  // multiple looks for the same query; cycled by re-pressing Start
  };

  let character = null;

  // ---------------------------------------------------------------- init ----
  document.addEventListener('DOMContentLoaded', function () {
    loadSettings();
    buildCloset();
    initDate();
    initOccasion();
    initLocation();
    initSettingsModal();
    initPopup();
    character = new window.Character($('#stage'), $('#closet'));
    $('#startBtn').addEventListener('click', onStart);
    initCoordinate();
    // [v2] §4.6 invariants: run with ?dev in the URL (results in the console).
    if (/[?&]dev\b/.test(location.search) && window.runThermalInvariants) window.runThermalInvariants();
  });

  // ---------------------------------------------------------- settings ------
  function loadSettings() {
    state.bodyType = localStorage.getItem(LS.bodyType) || 'normal';
    state.occasion = localStorage.getItem(LS.occasion) || 'Play';
    state.showClo = localStorage.getItem(LS.showClo) !== '0';   // [v2] default ON
    applyCloVisibility();
    try {
      const loc = JSON.parse(localStorage.getItem(LS.location) || 'null');
      if (loc && loc.latitude != null) {
        state.location = loc;
        showChosenLocation(loc.label);
        $('#locationInput').value = loc.label;
      }
    } catch (e) {}
  }

  function initSettingsModal() {
    const modal = $('#settingsModal');
    $('#settingsBtn').addEventListener('click', function () {
      const r = $('input[name="bodyType"][value="' + state.bodyType + '"]');
      if (r) r.checked = true;
      const t = $('#showCloToggle');                          // [v2]
      if (t) t.checked = state.showClo;
      modal.hidden = false;
    });
    $('#closeSettings').addEventListener('click', function () { modal.hidden = true; });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
    $('#saveSettings').addEventListener('click', function () {
      const sel = $('input[name="bodyType"]:checked');
      state.bodyType = sel ? sel.value : 'normal';
      localStorage.setItem(LS.bodyType, state.bodyType);
      const t = $('#showCloToggle');                          // [v2]
      if (t) {
        state.showClo = t.checked;
        localStorage.setItem(LS.showClo, state.showClo ? '1' : '0');
        applyCloVisibility();
      }
      modal.hidden = true;
      toast('Settings saved 🩷');
    });
  }

  // [v2] Part 6: when the engineering toggle is off, a class on #result hides
  // every .chip-clo (per-item chips + the summary chip). Fabric chips remain.
  function applyCloVisibility() {
    const r = $('#result');
    if (r) r.classList.toggle('no-clo', !state.showClo);
  }

  // ------------------------------------------------------------ popup -------
  function initPopup() {
    const modal = $('#popupModal');
    const close = function () { modal.hidden = true; };
    $('#popupOk').addEventListener('click', close);
    $('#popupClose').addEventListener('click', close);          // ✕ button
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); }); // tap outside
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });
  }
  function showPopup(emoji, title, bodyHtml) {
    $('#popupEmoji').textContent = emoji;
    $('#popupTitle').textContent = title;
    $('#popupBody').innerHTML = bodyHtml;
    $('#popupModal').hidden = false;
  }

  // ------------------------------------------------------------- date -------
  function initDate() {
    const d = $('#dateInput');
    const today = new Date();
    const iso = toISODate(today);
    d.value = iso;
    d.min = iso;
    const max = new Date(today.getTime());
    max.setDate(max.getDate() + 15);     // ~14-16 days ahead (PRD §5)
    d.max = toISODate(max);
  }
  function toISODate(dt) {
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // --------------------------------------------------------- occasion -------
  function initOccasion() {
    $$('.occ').forEach(function (b) {
      b.addEventListener('click', function () {
        state.occasion = b.dataset.occ;
        localStorage.setItem(LS.occasion, state.occasion);
        syncOccasion();
      });
    });
    syncOccasion();
  }
  function syncOccasion() {
    $$('.occ').forEach(function (b) { b.classList.toggle('active', b.dataset.occ === state.occasion); });
  }

  // --------------------------------------------------------- location -------
  function initLocation() {
    const input = $('#locationInput');
    $('#searchBtn').addEventListener('click', doSearch);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    });
    input.addEventListener('input', function () {
      // typing invalidates the previously chosen lat/lon
      if (state.location && input.value.trim() !== state.location.label) {
        state.location = null; hideChosen();
      }
    });
    $('#geoBtn').addEventListener('click', useMyLocation);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.location-field')) $('#geoResults').hidden = true;
    });
  }

  async function doSearch() {
    const q = $('#locationInput').value.trim();
    if (!q) { toast('Type a city to search'); return; }
    const ul = $('#geoResults');
    ul.innerHTML = '<li>Searching…</li>'; ul.hidden = false;
    try {
      const results = await window.Weather.geocode(q);
      state.geoList = results;
      if (!results.length) { ul.innerHTML = '<li>No matches — try another spelling.</li>'; return; }
      ul.innerHTML = '';
      results.forEach(function (r, i) {
        const li = document.createElement('li');
        li.textContent = r.label;
        li.addEventListener('click', function () { chooseLocation(r); });
        ul.appendChild(li);
      });
    } catch (err) {
      ul.hidden = true; toast('Location search failed. Check your connection.');
    }
  }

  function chooseLocation(r) {
    state.location = { label: r.label, latitude: r.latitude, longitude: r.longitude };
    localStorage.setItem(LS.location, JSON.stringify(state.location));
    $('#locationInput').value = r.label;
    $('#geoResults').hidden = true;
    showChosenLocation(r.label);
  }

  function showChosenLocation(label) {
    const el = $('#locationChosen');
    el.textContent = '📍 ' + label;
    el.hidden = false;
  }
  function hideChosen() { $('#locationChosen').hidden = true; }

  function useMyLocation() {
    if (!navigator.geolocation) { toast('Geolocation not supported by this browser'); return; }
    toast('Locating you…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      const label = window.Weather.coordLabel(lat, lon);
      state.location = { label: 'My location (' + label + ')', latitude: lat, longitude: lon };
      localStorage.setItem(LS.location, JSON.stringify(state.location));
      $('#locationInput').value = state.location.label;
      showChosenLocation(state.location.label);
      toast('Got your location 📍');
    }, function (err) {
      toast('Could not get your location. Try searching by name. (Tip: run over http://localhost)');
    }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 });
  }

  // ----------------------------------------------------------- closet -------
  function buildCloset() {
    const wrap = $('#closet');
    window.CLOSET_GROUPS.forEach(function (group) {
      const items = window.CATALOG.filter(function (it) { return it.group === group; });
      if (!items.length) return;
      const section = document.createElement('div');
      section.className = 'closet-group';
      const h = document.createElement('h3'); h.textContent = group; section.appendChild(h);
      const tiles = document.createElement('div'); tiles.className = 'tiles';
      items.forEach(function (it) {
        const tile = document.createElement('div');
        tile.className = 'tile'; tile.dataset.id = it.id;
        const img = document.createElement('img');
        img.src = window.spriteUrl(it.id); img.alt = it.name; img.loading = 'lazy';
        // The sprites are full-canvas (garment positioned on a body), so crop each
        // tile to just the garment for a tidy closet thumbnail.
        cropToContent(img, window.spriteUrl(it.id));
        const cap = document.createElement('span'); cap.className = 'cap'; cap.textContent = it.name; cap.title = it.name;
        tile.appendChild(img); tile.appendChild(cap);
        tile.addEventListener('click', function () { onTileClick(it.id); });
        tiles.appendChild(tile);
      });
      section.appendChild(tiles);
      wrap.appendChild(section);
    });
  }

  // Build a square thumbnail cropped to a sprite's non-transparent content, so the
  // closet shows the garment itself rather than a tiny shape in an empty canvas.
  function cropToContent(imgEl, url) {
    const probe = new Image();
    probe.onload = function () {
      try {
        // Scan at reduced resolution for speed, then map the bbox back.
        const SW = 120, SH = Math.max(1, Math.round(SW * probe.naturalHeight / probe.naturalWidth));
        const sc = document.createElement('canvas'); sc.width = SW; sc.height = SH;
        const sx = sc.getContext('2d'); sx.drawImage(probe, 0, 0, SW, SH);
        const P = sx.getImageData(0, 0, SW, SH).data;
        let minx = SW, miny = SH, maxx = -1, maxy = -1;
        for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
          if (P[(y * SW + x) * 4 + 3] > 20) {
            if (x < minx) minx = x; if (x > maxx) maxx = x;
            if (y < miny) miny = y; if (y > maxy) maxy = y;
          }
        }
        if (maxx < 0) return;
        const fx = probe.naturalWidth / SW, fy = probe.naturalHeight / SH;
        let l = minx * fx, t = miny * fy, r = (maxx + 1) * fx, b = (maxy + 1) * fy;
        const padX = (r - l) * 0.10, padY = (b - t) * 0.10;
        l = Math.max(0, l - padX); t = Math.max(0, t - padY);
        r = Math.min(probe.naturalWidth, r + padX); b = Math.min(probe.naturalHeight, b + padY);
        const cw = r - l, ch = b - t;
        const T = 132;
        const tc = document.createElement('canvas'); tc.width = T; tc.height = T;
        const tx = tc.getContext('2d'); tx.imageSmoothingEnabled = false;
        const s = Math.min(T / cw, T / ch), dw = cw * s, dh = ch * s;
        tx.drawImage(probe, l, t, cw, ch, (T - dw) / 2, (T - dh) / 2, dw, dh);
        imgEl.src = tc.toDataURL();
      } catch (e) { /* tainted (file://) — keep the full sprite */ }
    };
    probe.src = url;
  }

  // ------------------------------------------------- manual coordination ----
  // Tap closet items to dress Hazel by hand (before pressing Start). One item per
  // category replaces the previous one; accessories stack; tapping a worn item removes it.
  function initCoordinate() {
    $('#coordBtn').addEventListener('click', function () {
      if (state.coordinating) clearManual();     // "Clear" — undress back to the base
      else enterCoordinate();                     // "Coordinate your own" — re-enter manual mode
    });
    updateMode();
    renderManual();                               // start empty (just the base)
  }

  function onTileClick(id) {
    if (!state.coordinating) { toast('Tap “✨ Coordinate your own” to dress Hazel by hand'); return; }
    const it = window.itemById(id);
    if (!it) return;
    if (it.category === 'accessory') {
      const acc = state.manual.acc;
      const i = acc.indexOf(id);
      if (i >= 0) { acc.splice(i, 1); }                               // toggle off
      else {
        if (id === 'acc_socks' || id === 'acc_thick_socks')          // only one pair of socks
          state.manual.acc = acc.filter(function (a) { return a !== 'acc_socks' && a !== 'acc_thick_socks'; });
        state.manual.acc.push(id);
      }
    } else {
      const s = state.manual.slots;
      if (s[it.category] === id) { delete s[it.category]; }           // toggle off
      else { s[it.category] = id; applyExclusivity(it.category); }    // one per category + body rules
    }
    renderManual();
  }

  // A dress/pajama replaces top + bottoms/skirts; bottom and skirt share the lower-body slot.
  function applyExclusivity(cat) {
    const s = state.manual.slots;
    if (cat === 'dress' || cat === 'pajama') {
      delete s.top; delete s.bottom; delete s.skirt;
      delete s[cat === 'dress' ? 'pajama' : 'dress'];
    } else if (cat === 'top') { delete s.dress; delete s.pajama; }
    else if (cat === 'bottom') { delete s.skirt; delete s.dress; delete s.pajama; }
    else if (cat === 'skirt') { delete s.bottom; delete s.dress; delete s.pajama; }
  }

  function renderManual() {
    const s = state.manual.slots;
    const items = [];
    ['footwear', 'bottom', 'skirt', 'dress', 'pajama', 'top', 'outerwear', 'gear', 'headwear'].forEach(function (cat) {
      if (s[cat]) items.push({ id: s[cat], slot: cat });
    });
    state.manual.acc.forEach(function (id) { items.push({ id: id, slot: 'accessory' }); });
    character.coordinate(items);
    markChosenTiles(items);
  }

  function clearManual() { state.manual = { slots: {}, acc: [] }; renderManual(); }

  function enterCoordinate() {
    state.coordinating = true;
    $('#result').hidden = true;
    $('#resultPlaceholder').hidden = false;
    $('.result-title').textContent = "Today's Outfit";
    clearManual();
    updateMode();
  }

  // Called once Start (or sleep mode) takes over — manual coordination stops here.
  function exitCoordinate() { state.coordinating = false; updateMode(); }

  function updateMode() {
    const on = state.coordinating;
    $('#coordHint').textContent = on
      ? '✨ Tap items to dress Hazel — one per category'
      : 'Showing the weather pick — coordinate again any time';
    $('#coordBtn').textContent = on ? '↺ Clear' : '✨ Coordinate your own';
    $('#closet').classList.toggle('coordinating', on);
  }

  // ------------------------------------------------------------ start -------
  async function onStart() {
    const win = readWindow();
    if (!win) { toast('Set a valid time window'); return; }

    // Sleeping hours (11 PM–5 AM): she stays in her pajamas — no going out, no weather.
    if (isSleepWindow(win.startRaw)) { enterSleepMode(); return; }

    if (!state.location) { toast('Pick a location first 🔍'); $('#locationInput').focus(); return; }
    const date = $('#dateInput').value;
    if (!date) { toast('Choose a date'); return; }

    const sig = variantSig(date, win);

    // Re-pressing Start with the SAME query cycles to the next look — no re-fetch,
    // no popups, just the next outfit in the list (all alternatives score ≥ 95).
    if (state.variants.sig === sig && state.variants.list.length) {
      const list = state.variants.list;
      if (list.length > 1) {
        state.variants.index = (state.variants.index + 1) % list.length;
        await showVariant(list[state.variants.index]);
        toast('✨ Look ' + (state.variants.index + 1) + ' of ' + list.length);
      } else {
        await showVariant(list[0]);
        toast("That's the only 95+ look for today ✨");
      }
      return;
    }

    const btn = $('#startBtn');
    btn.disabled = true; btn.textContent = 'Dressing…';
    $('#stage').classList.add('loading');

    try {
      const fc = await window.Weather.forecast(state.location.latitude, state.location.longitude, date);
      const w = window.Weather.summarizeWindow(fc, date, win);
      $('#stage').classList.remove('loading');
      if (!w) { toast('No hourly data for that window. Try a nearer date.'); return; }

      const list = window.recommendVariants(w, state.occasion, state.bodyType, { max: 5, minScore: 95 });
      state.variants = { sig: sig, list: list, index: 0 };
      const rec = list[0];

      await showVariant(rec);
      // The "go shopping" nag wins over the weather heads-up — it's the more
      // important message (the rendered outfit is only a best effort).
      if (rec.shopNeeded) showShopPopup();
      else maybeWeatherPopup(rec);     // surface any notable weather condition
      if (list.length > 1) toast('✨ ' + list.length + ' looks today — tap Start again for more');
    } catch (err) {
      $('#stage').classList.remove('loading');
      toast('Weather fetch failed. Check your connection and try again.');
      console.error(err);
    } finally {
      btn.disabled = false; btn.innerHTML = 'Start <span aria-hidden="true">→</span>';
    }
  }

  // Identity of a query — same location/date/time/occasion/body ⇒ same looks list.
  function variantSig(date, win) {
    const loc = state.location ? (state.location.latitude + ',' + state.location.longitude) : '';
    return [loc, date, $('#startTime').value, $('#endTime').value, state.occasion, state.bodyType].join('|');
  }

  // Render + dress one look, and reflect "Look N of M" in the hint line.
  async function showVariant(rec) {
    renderResult(rec);
    markChosenTiles(rec.items);
    exitCoordinate();                  // the weather pick takes over from manual coordination
    updateLookHint();
    await character.dress(rec.items);
  }

  function updateLookHint() {
    const v = state.variants;
    if (!state.coordinating && v.list.length > 1) {
      $('#coordHint').textContent = '✨ Look ' + (v.index + 1) + ' of ' + v.list.length + ' — tap Start for another';
    }
  }

  // "Anything after 11 PM to 5 AM" → her outing starts during sleeping hours.
  function isSleepWindow(startHour) { return startHour >= 23 || startHour < 5; }

  function enterSleepMode() {
    showPopup('😴', 'Sleeping time!', '<p class="sleepy">Don\'t think about going out :/</p>');
    renderSleep();
    exitCoordinate();
    markChosenTiles([{ id: 'dress_long_sleeve' }]);
    character.dress([
      { id: 'dress_long_sleeve', slot: 'pajama' },
    ]);
  }

  // Shown when even the best realistic materials can't get the outfit within range
  // (rec.shopNeeded — engine's optimized score < 90): the closet has no good match.
  function showShopPopup() {
    showPopup('😅', "It'll do… for now",
      "<p>Hazel's wearing the best match she's got, but the score came in under 90. A little shopping trip would really save the day! 🛍️</p>");
  }

  function maybeWeatherPopup(rec) {
    if (!rec.conditions || !rec.conditions.length) return;
    const s = rec.summary;
    let html = rec.conditions.map(function (c) {
      return '<div class="cond"><span aria-hidden="true">' + c.emoji + '</span><span>' + c.text + '</span></div>';
    }).join('');
    html += '<p class="cond-feels">Feels like <b>' + fmtRange(s.feelsMin, s.feelsMax) +
      '</b> (actual ' + fmtRange(s.tempMin, s.tempMax) + ').</p>';
    showPopup(rec.conditions[0].emoji, 'Weather heads-up', html);
  }

  function readWindow() {
    const s = $('#startTime').value, e = $('#endTime').value;
    if (!s || !e) return null;
    let sh = parseInt(s.slice(0, 2), 10);
    let eh = parseInt(e.slice(0, 2), 10);
    if (isNaN(sh) || isNaN(eh)) return null;
    const startRaw = sh;                               // before any reorder (for sleep check)
    if (eh < sh) { const t = sh; sh = eh; eh = t; }   // tolerate reversed
    return { startHour: sh, endHour: eh, startRaw: startRaw };
  }

  // ----------------------------------------------------------- render -------
  function renderResult(rec) {
    $('#resultPlaceholder').hidden = true;
    $('#result').hidden = false;
    $('.result-title').textContent = "Today's Outfit";

    // weather summary chips (PRD §8.6)
    const s = rec.summary;
    const ws = $('#weatherSummary');
    const feels = fmtRange(s.feelsMin, s.feelsMax);
    const actual = fmtRange(s.tempMin, s.tempMax);
    ws.innerHTML = '';
    ws.appendChild(chip('🌡️', 'Feels <b>' + feels + '</b>'));
    ws.appendChild(chip('🌤️', 'Actual ' + actual));
    ws.appendChild(chip('☔', 'Rain <b>' + s.precipPeak + '%</b>'));
    ws.appendChild(chip('🔆', 'UV <b>' + s.uvPeak + '</b>'));
    if (s.windPeak >= 20) ws.appendChild(chip('💨', 'Wind ' + s.windPeak + ' km/h'));
    // [v2] Part 6: outfit → optimized vs target insulation (hidden by the toggle).
    if (rec.clo && rec.clo.engine === 'v2') {
      const m = rec.material;
      const arrow = (m && Math.abs(m.optimizedClo - rec.clo.outfitClo) >= 0.005)
        ? ' → ' + m.optimizedClo.toFixed(2) : '';
      const cs = chip('🧶', 'outfit <b>' + rec.clo.outfitClo.toFixed(2) + '</b>' + arrow +
        ' / target ' + rec.clo.target.toFixed(2) + ' clo');
      cs.classList.add('chip-clo');
      ws.appendChild(cs);
    }

    // [v2] Part 6: the 100-point material score — always visible (one ruler:
    // distance from today's target interval; §5.5).
    const ms = $('#materialScore');
    if (rec.material) {
      ms.innerHTML = 'Material score <b>' + rec.material.scoreBase + ' / 100</b> · optimized ' +
        rec.material.scoreOptimized +
        ' <span class="worst">worst-case ' + rec.material.scoreWorst + '</span>';
      ms.hidden = false;
    } else {
      ms.hidden = true;
    }

    // index the per-item improvement notes (§5.6)
    const noteById = {};
    if (rec.material) rec.material.notes.forEach(function (n) { noteById[n.id] = n; });

    // item list grouped by slot order
    const list = $('#itemList'); list.innerHTML = '';
    rec.items.forEach(function (it) {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.className = 'thumb'; img.src = window.spriteUrl(it.id); img.alt = '';
      cropToContent(img, window.spriteUrl(it.id));
      const txt = document.createElement('div');
      txt.innerHTML = '<span class="slot">' + slotLabel(it.slot) + '</span><span class="nm">' + window.itemName(it.id) + '</span>';
      // [v2] Part 6: per-item clo chip (toggleable).
      const itemClo = (window.itemById(it.id) || {}).clo || 0;
      if (rec.clo && rec.clo.engine === 'v2' && itemClo > 0) {
        const cc = document.createElement('span');
        cc.className = 'chip chip-clo';
        cc.textContent = itemClo.toFixed(2) + ' clo';
        txt.appendChild(cc);
      }
      // [v2] §5.6 improvement sub-line — qualitative half always shows; the
      // numbers (.clo-num) follow the engineering toggle.
      const n = noteById[it.id];
      if (n) {
        const div = document.createElement('div');
        div.className = 'mat-note';
        const reasons = n.reasons.length ? ' — ' + n.reasons.join(', ') : '';
        const sign = n.delta > 0 ? '+' : '−';
        div.innerHTML = '↳ in ' + n.label + ', or a ' + n.label + '-dominant blend' +
          ' <span class="clo-num">≈ ' + n.effClo.toFixed(3).replace(/0$/, '') + ' clo</span>' +
          reasons +
          ' <span class="clo-num">(' + sign + Math.abs(n.delta).toFixed(3).replace(/0$/, '') + ')</span>';
        txt.appendChild(div);
      }
      li.appendChild(img); li.appendChild(txt);
      list.appendChild(li);
    });

    // layering memo (PRD §8.5)
    const memo = $('#memo');
    if (rec.memo) { memo.textContent = rec.memo; memo.hidden = false; }
    else { memo.hidden = true; }
  }

  // Sleep-mode panel (shown instead of an outfit when the window is night hours).
  function renderSleep() {
    $('#resultPlaceholder').hidden = true;
    $('#result').hidden = false;
    $('.result-title').textContent = 'Zzz…';
    $('#weatherSummary').innerHTML = '';
    $('#materialScore').hidden = true;   // [v2] no analysis for sleepwear
    $('#itemList').innerHTML = '<li class="sleepnote">😴 It\'s sleeping hours (11 PM–5 AM). Hazel\'s tucked into her sleeping pajamas — pick a daytime window to dress for going out.</li>';
    $('#memo').hidden = true;
  }

  function chip(icon, html) {
    const sp = document.createElement('span'); sp.className = 'wchip';
    sp.innerHTML = '<span aria-hidden="true">' + icon + '</span> <span>' + html + '</span>';
    return sp;
  }

  function fmtRange(a, b) {
    if (a == null || b == null) return '—';
    const lo = Math.round(a), hi = Math.round(b);
    return lo === hi ? (lo + '°C') : (lo + '–' + hi + '°C');
  }

  const SLOT_LABEL = {
    legwear: 'Legwear', socks: 'Socks', dress: 'Dress', skirt: 'Skirt', bottom: 'Bottom',
    top: 'Top', outerwear: 'Outerwear', scarf: 'Neck', footwear: 'Shoes',
    gloves: 'Hands', headwear: 'Head', sunglasses: 'Eyes', handheld: 'Gear', pajama: 'Sleepwear',
  };
  function slotLabel(s) { return SLOT_LABEL[s] || s; }

  function markChosenTiles(items) {
    $$('.tile').forEach(function (t) { t.classList.remove('chosen'); });
    items.forEach(function (it) {
      const t = $('.tile[data-id="' + it.id + '"]');
      if (t) t.classList.add('chosen');
    });
  }

  // ------------------------------------------------------------ toast -------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
})();
