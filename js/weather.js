/* Hazel's Wearcast — Open-Meteo client (PRD §4)
 * No API key, CORS-enabled, called directly from the browser.
 * Geocoding for location search; forecast for hourly conditions.
 */
(function () {
  'use strict';

  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const FORECAST = 'https://api.open-meteo.com/v1/forecast';
  const HOURLY = ['temperature_2m', 'apparent_temperature', 'precipitation_probability',
    'uv_index', 'wind_speed_10m', 'weather_code', 'relative_humidity_2m'];

  async function geocode(query) {
    const url = GEO + '?name=' + encodeURIComponent(query) + '&count=5&language=en&format=json';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Location search failed (' + res.status + ')');
    const data = await res.json();
    return (data.results || []).map(function (r) {
      const parts = [r.name, r.admin1, r.country].filter(Boolean);
      return {
        name: r.name,
        label: parts.join(', '),
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country,
        admin1: r.admin1,
        timezone: r.timezone,
      };
    });
  }

  // Reverse geocode-ish label for "use my location": Open-Meteo has no reverse
  // endpoint, so we just show the coordinates rounded.
  function coordLabel(lat, lon) {
    return lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°';
  }

  async function forecast(lat, lon, dateStr) {
    const url = FORECAST + '?latitude=' + lat + '&longitude=' + lon +
      '&timezone=auto&start_date=' + dateStr + '&end_date=' + dateStr +
      '&hourly=' + HOURLY.join(',');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather fetch failed (' + res.status + ')');
    return res.json();
  }

  function num(v) { return (v === null || v === undefined || isNaN(v)) ? null : Number(v); }

  /* Reduce the hourly forecast to the selected date + time window (PRD §8.1).
   * window = { startHour, endHour } inclusive of the boundary hours.
   * Returns null if no hours fall in range (e.g. data unavailable). */
  function summarizeWindow(fc, dateStr, win) {
    const h = fc.hourly;
    if (!h || !h.time) return null;
    const rows = [];
    for (let i = 0; i < h.time.length; i++) {
      const t = h.time[i];                 // "YYYY-MM-DDTHH:00"
      if (t.slice(0, 10) !== dateStr) continue;
      const hour = parseInt(t.slice(11, 13), 10);
      if (hour < win.startHour || hour > win.endHour) continue;
      rows.push({
        hour: hour,
        temp: num(h.temperature_2m[i]),
        feels: num(h.apparent_temperature[i]),
        precip: num(h.precipitation_probability ? h.precipitation_probability[i] : null),
        uv: num(h.uv_index ? h.uv_index[i] : null),
        wind: num(h.wind_speed_10m ? h.wind_speed_10m[i] : null),
        code: num(h.weather_code ? h.weather_code[i] : null),
        rh: num(h.relative_humidity_2m ? h.relative_humidity_2m[i] : null),  // [v2] §5.2
      });
    }
    if (!rows.length) return null;

    const feelsVals = rows.map(function (r) { return r.feels; }).filter(function (v) { return v !== null; });
    const tempVals = rows.map(function (r) { return r.temp; }).filter(function (v) { return v !== null; });
    const precipVals = rows.map(function (r) { return r.precip; }).filter(function (v) { return v !== null; });
    const uvVals = rows.map(function (r) { return r.uv; }).filter(function (v) { return v !== null; });
    const windVals = rows.map(function (r) { return r.wind; }).filter(function (v) { return v !== null; });
    const rhVals = rows.map(function (r) { return r.rh; }).filter(function (v) { return v !== null; });  // [v2]

    const feelsMin = feelsVals.length ? Math.min.apply(null, feelsVals) : null;
    const feelsMax = feelsVals.length ? Math.max.apply(null, feelsVals) : null;

    // Hour at which feels-like peaks (for the removable-layer memo, §8.5).
    let peakHour = rows[0].hour, peakFeels = -999;
    rows.forEach(function (r) { if (r.feels !== null && r.feels > peakFeels) { peakFeels = r.feels; peakHour = r.hour; } });

    const first = rows[0], last = rows[rows.length - 1];

    return {
      rows: rows,
      feelsMin: feelsMin,
      feelsMax: feelsMax,
      tempMin: tempVals.length ? Math.min.apply(null, tempVals) : null,
      tempMax: tempVals.length ? Math.max.apply(null, tempVals) : null,
      precipPeak: precipVals.length ? Math.max.apply(null, precipVals) : 0,
      uvPeak: uvVals.length ? Math.max.apply(null, uvVals) : 0,
      windPeak: windVals.length ? Math.max.apply(null, windVals) : 0,
      rhPeak: rhVals.length ? Math.max.apply(null, rhVals) : null,  // [v2] null → humid weight falls back to 0
      codes: rows.map(function (r) { return r.code; }).filter(function (v) { return v !== null; }),
      peakHour: peakHour,
      startFeels: first.feels,
      endFeels: last.feels,
      startHour: first.hour,
      endHour: last.hour,
    };
  }

  window.Weather = {
    geocode: geocode,
    forecast: forecast,
    summarizeWindow: summarizeWindow,
    coordLabel: coordLabel,
  };
})();
