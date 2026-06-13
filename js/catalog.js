/* Hazel's Wearcast — wardrobe catalog (PRD §7)
 * Fixed catalog: the user owns every item. Each item maps 1:1 to a sprite whose
 * filename equals its id (PRD §11 naming convention).
 *
 * Fields:
 *   id         sprite id == filename stem
 *   name       English display name
 *   category   top | bottom | skirt | dress | pajama | outerwear | footwear | headwear | accessory | gear
 *   layer      PRD §7 layer slot (base-top, bottom, skirt, dress, outerwear, footwear,
 *              headwear, accessory, weather-gear)
 *   group      closet panel section label (PRD §9)
 *   tempRange  [lo, hi] adjusted feels-like °C where the item is appropriate.
 *              Used by the engine to keep occasion substitutions weather-correct.
 *   seasonTags rough season hints (PRD model)
 */
(function () {
  'use strict';

  // Where the sprites live (folder names contain spaces -> encoded at use site).
  window.ASSET_BASE = 'Images in Closet/hazels_everskies_separated_assets_y2k/';
  window.CLOSET_DIR = 'Images in Closet/pixel_closet_versions/';
  // A few items use a sprite filename that differs from the item id. The hats ship as
  // "…_face_no_side_hair" versions (cap + face + bob, meant to layer on top of the head).
  const SPRITE_FILE = {
    hat_cap: 'hat_cap_face_no_side_hair',
    hat_bucket: 'hat_bucket_face_no_side_hair',
    hat_beanie: 'hat_beanie_face_no_side_hair',
  };
  window.spriteUrl = function (id) { return encodeURI(window.ASSET_BASE + (SPRITE_FILE[id] || id) + '.png'); };
  window.closetUrl = function (file) { return encodeURI(window.CLOSET_DIR + file); };

  /* [v2] Material option groups (LOGIC.md §5.3). Items with `fabricOptions`
   * are ANALYZABLE: the post-selection material layer (§5.4) may name a better
   * material for today (the identity `asIs` option is implicit). Items with a
   * fixed `material` participate in totals at base clo — no options, no line.
   * Footwear / headwear / accessories / gear are excluded from analysis. */
  const MAT_TEE    = ['linen', 'cottonLight', 'jerseyModal', 'polyWick'];   // tank, tees, light shirt, non-knit dresses
  const MAT_CASUAL = ['linen', 'cottonLight', 'polyWick'];                  // polo, shorts, chinos, slacks, non-fleece skirts
  const MAT_SWEAT  = ['cottonLight', 'polyFleece', 'polyWick'];             // sweatshirt, hoodie, joggers
  const MAT_KNIT   = ['merinoWool', 'acrylicKnit', 'cottonLight'];          // knits, turtleneck, knit dress, cardigans, blazer
  const MAT_WICK   = ['polyWick'];                                          // leggings

  const C = [
    // ---- Tops (base-top) -------------------------------------------------
    // [v2] clo per LOGIC.md §4.4; fabricOptions per §5.3.
    { id: 'top_tank',             name: 'Tank top',            category: 'top', layer: 'base-top', group: 'Tops', tempRange: [28, 99],  seasonTags: ['summer'], clo: 0.06, fabricOptions: MAT_TEE },
    { id: 'top_short_sleeve_tee', name: 'Short-sleeve tee',    category: 'top', layer: 'base-top', group: 'Tops', tempRange: [23, 35],  seasonTags: ['summer'], clo: 0.08, fabricOptions: MAT_TEE },
    { id: 'top_polo',             name: 'Polo shirt',          category: 'top', layer: 'base-top', group: 'Tops', tempRange: [21, 32],  seasonTags: ['summer','autumn'], clo: 0.12, fabricOptions: MAT_CASUAL },
    { id: 'top_light_shirt',      name: 'Light shirt / blouse',category: 'top', layer: 'base-top', group: 'Tops', tempRange: [18, 30],  seasonTags: ['transitional'], clo: 0.15, fabricOptions: MAT_TEE },
    { id: 'top_long_sleeve_tee',  name: 'Light long-sleeve',   category: 'top', layer: 'base-top', group: 'Tops', tempRange: [14, 24],  seasonTags: ['transitional'], clo: 0.20, fabricOptions: MAT_TEE },
    { id: 'top_sweatshirt',       name: 'Sweatshirt',          category: 'top', layer: 'base-top', group: 'Tops', tempRange: [9, 19],   seasonTags: ['transitional'], clo: 0.30, fabricOptions: MAT_SWEAT },
    { id: 'top_hoodie',           name: 'Hoodie',              category: 'top', layer: 'base-top', group: 'Tops', tempRange: [9, 18],   seasonTags: ['transitional'], clo: 0.34, fabricOptions: MAT_SWEAT },
    { id: 'top_light_knit',       name: 'Light knit',          category: 'top', layer: 'base-top', group: 'Tops', tempRange: [8, 17],   seasonTags: ['transitional','winter'], clo: 0.25, fabricOptions: MAT_KNIT },
    { id: 'top_heavy_knit',       name: 'Heavy knit / sweater',category: 'top', layer: 'base-top', group: 'Tops', tempRange: [-99, 9],  seasonTags: ['winter'], clo: 0.36, fabricOptions: MAT_KNIT },
    { id: 'top_turtleneck',       name: 'Turtleneck',          category: 'top', layer: 'base-top', group: 'Tops', tempRange: [-99, 9],  seasonTags: ['winter'], clo: 0.34, fabricOptions: MAT_KNIT },

    // ---- Bottoms ---------------------------------------------------------
    // [v2] tuckable on the two leggings (§3.9): they tuck INTO boots, so footwear
    // lifts above the bottoms layer when one is worn.
    { id: 'bottom_shorts',        name: 'Shorts',              category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [24, 99],  seasonTags: ['summer'], clo: 0.08, fabricOptions: MAT_CASUAL },
    { id: 'bottom_denim_shorts',  name: 'Denim shorts',        category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [24, 99],  seasonTags: ['summer'], clo: 0.08, material: 'denim' },
    { id: 'bottom_chinos',        name: 'Chinos',              category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [10, 28],  seasonTags: ['all'], clo: 0.15, fabricOptions: MAT_CASUAL },
    { id: 'bottom_slacks',        name: 'Slacks',              category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [8, 26],   seasonTags: ['all'], clo: 0.15, fabricOptions: MAT_CASUAL },
    { id: 'bottom_jeans',         name: 'Jeans',               category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [4, 26],   seasonTags: ['all'], clo: 0.20, material: 'denim' },
    { id: 'bottom_joggers',       name: 'Joggers',             category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [6, 24],   seasonTags: ['all','active'], clo: 0.28, fabricOptions: MAT_SWEAT },
    { id: 'bottom_short_leggings',name: 'Short leggings',      category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [18, 99],  seasonTags: ['spring','summer','active'], clo: 0.05, tuckable: true, fabricOptions: MAT_WICK },
    { id: 'bottom_long_leggings', name: 'Long leggings',       category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [2, 20],   seasonTags: ['transitional','winter','active'], clo: 0.10, tuckable: true, fabricOptions: MAT_WICK },
    { id: 'bottom_fleece_pants',  name: 'Fleece-lined pants',  category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [-99, 9],  seasonTags: ['winter'], clo: 0.30, material: 'polyFleece' },
    { id: 'bottom_fleece_jeans',  name: 'Fleece-lined jeans',  category: 'bottom', layer: 'bottom', group: 'Bottoms', tempRange: [-99, 9],  seasonTags: ['winter'], clo: 0.32, material: 'polyFleece' },

    // ---- Skirts ----------------------------------------------------------
    { id: 'skirt_mini',           name: 'Mini skirt',          category: 'skirt', layer: 'skirt', group: 'Skirts', tempRange: [23, 99],  seasonTags: ['summer'], clo: 0.10, fabricOptions: MAT_CASUAL },
    { id: 'skirt_midi',           name: 'Midi skirt',          category: 'skirt', layer: 'skirt', group: 'Skirts', tempRange: [12, 28],  seasonTags: ['transitional'], clo: 0.18, fabricOptions: MAT_CASUAL },
    { id: 'skirt_long',           name: 'Long skirt',          category: 'skirt', layer: 'skirt', group: 'Skirts', tempRange: [6, 99],   seasonTags: ['all'], clo: 0.22, fabricOptions: MAT_CASUAL },
    { id: 'skirt_fleece',         name: 'Fleece-lined skirt',  category: 'skirt', layer: 'skirt', group: 'Skirts', tempRange: [-99, 8],  seasonTags: ['winter'], clo: 0.28, material: 'polyFleece' },

    // ---- Dresses (full body, replace top+bottom) ------------------------
    { id: 'dress_sleeveless',     name: 'Sleeveless dress',    category: 'dress', layer: 'dress', group: 'Dresses', tempRange: [25, 99], seasonTags: ['summer'], clo: 0.20, fabricOptions: MAT_TEE },
    { id: 'dress_short_sleeve',   name: 'Short-sleeve dress',  category: 'dress', layer: 'dress', group: 'Dresses', tempRange: [22, 99], seasonTags: ['summer'], clo: 0.25, fabricOptions: MAT_TEE },
    { id: 'dress_knit',           name: 'Knit dress',          category: 'dress', layer: 'dress', group: 'Dresses', tempRange: [-99, 14],seasonTags: ['winter'], clo: 0.45, fabricOptions: MAT_KNIT },

    // ---- Sleepwear (own category) — only worn during sleeping hours (11 PM–5 AM),
    //      and when worn it's the ONLY thing on. Uses the dress_long_sleeve sprite. -----
    //      [v2] carries the §4.4 "Long-sleeve dress" clo (0.35) — thermally inert,
    //      since sleepwear is never scored by the weather engine.
    { id: 'dress_long_sleeve',    name: 'Sleeping pajamas',    category: 'pajama', layer: 'pajama', group: 'Sleepwear', tempRange: [-99, 99], seasonTags: ['sleep'], clo: 0.35 },

    // ---- Outerwear (light -> heavy) -------------------------------------
    { id: 'outer_light_cardigan', name: 'Light cardigan',      category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [18, 27], seasonTags: ['transitional'], clo: 0.20, fabricOptions: MAT_KNIT },
    { id: 'outer_heavy_cardigan', name: 'Heavy cardigan',      category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [8, 16],  seasonTags: ['winter'], clo: 0.31, fabricOptions: MAT_KNIT },
    { id: 'outer_windbreaker',    name: 'Windbreaker',         category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [10, 19], seasonTags: ['transitional'], clo: 0.25, material: 'nylonShell' },
    { id: 'outer_denim_jacket',   name: 'Denim jacket',        category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [12, 20], seasonTags: ['transitional'], clo: 0.30, material: 'denim' },
    { id: 'outer_blazer',         name: 'Blazer',              category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [12, 22], seasonTags: ['transitional'], clo: 0.36, fabricOptions: MAT_KNIT },
    { id: 'outer_leather_jacket', name: 'Leather jacket',      category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [8, 18],  seasonTags: ['transitional','winter'], clo: 0.35, material: 'leather' },
    { id: 'outer_trench_coat',    name: 'Trench coat',         category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [9, 17],  seasonTags: ['transitional'], clo: 0.42, material: 'gabardine' },  // canonical fabric — fixed (§5.3)
    { id: 'outer_coat',           name: 'Coat',                category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [2, 10],  seasonTags: ['winter'], clo: 0.55, material: 'wool' },             // canonical fabric — fixed (§5.3)
    { id: 'outer_fleece_jacket',  name: 'Fleece jacket',       category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [5, 13],  seasonTags: ['winter','active'], clo: 0.30, material: 'polyFleece' },
    { id: 'outer_light_puffer',   name: 'Light puffer',        category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [4, 12],  seasonTags: ['winter'], clo: 0.45, material: 'nylonShell' },
    { id: 'outer_short_puffer',   name: 'Short puffer',        category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [0, 9],   seasonTags: ['winter'], clo: 0.55, material: 'nylonShell' },
    { id: 'outer_long_puffer',    name: 'Long puffer',         category: 'outerwear', layer: 'outerwear', group: 'Outerwear', tempRange: [-99, 6], seasonTags: ['winter'], clo: 0.70, material: 'nylonShell' },

    // ---- Footwear --------------------------------------------------------
    // [v2] clo values are small on purpose: feet are a small share of body surface
    // and clo is a whole-body average (LOGIC.md §4.1).
    { id: 'shoe_sandals',         name: 'Sandals / slides',    category: 'footwear', layer: 'footwear', group: 'Footwear', tempRange: [24, 99], seasonTags: ['summer'], clo: 0.02 },
    { id: 'shoe_sneakers',        name: 'Sneakers',            category: 'footwear', layer: 'footwear', group: 'Footwear', tempRange: [4, 99],  seasonTags: ['all'], clo: 0.04 },
    { id: 'shoe_loafers',         name: 'Loafers / dress shoes',category:'footwear', layer: 'footwear', group: 'Footwear', tempRange: [6, 99],  seasonTags: ['smart'], clo: 0.03 },
    { id: 'shoe_boots',           name: 'Boots',               category: 'footwear', layer: 'footwear', group: 'Footwear', tempRange: [-99, 12],seasonTags: ['winter'], clo: 0.08 },
    { id: 'shoe_rain_boots',      name: 'Rain boots',          category: 'footwear', layer: 'footwear', group: 'Footwear', tempRange: [-99, 99],seasonTags: ['rain'], clo: 0.06, material: 'rubber' },

    // ---- Headwear --------------------------------------------------------
    { id: 'hat_cap',              name: 'Cap',                 category: 'headwear', layer: 'headwear', group: 'Headwear', tempRange: [-99, 99], seasonTags: ['sun'], clo: 0.01 },
    { id: 'hat_bucket',           name: 'Bucket hat',          category: 'headwear', layer: 'headwear', group: 'Headwear', tempRange: [-99, 99], seasonTags: ['sun'], clo: 0.01 },
    { id: 'hat_beanie',           name: 'Beanie',              category: 'headwear', layer: 'headwear', group: 'Headwear', tempRange: [-99, 8],  seasonTags: ['winter'], clo: 0.04 },

    // ---- Accessories -----------------------------------------------------
    { id: 'acc_scarf',            name: 'Scarf / muffler',     category: 'accessory', layer: 'accessory', group: 'Accessories', tempRange: [-99, 6], seasonTags: ['winter'], clo: 0.06 },
    { id: 'acc_gloves',           name: 'Gloves',              category: 'accessory', layer: 'accessory', group: 'Accessories', tempRange: [-99, 6], seasonTags: ['winter'], clo: 0.05 },
    { id: 'acc_tights',           name: 'Tights',              category: 'accessory', layer: 'accessory', group: 'Accessories', tempRange: [-99, 12],seasonTags: ['transitional','winter'], clo: 0.10 },
    { id: 'acc_socks',            name: 'Regular socks',       category: 'accessory', layer: 'accessory', group: 'Accessories', tempRange: [-99, 99],seasonTags: ['all'], clo: 0.02 },
    { id: 'acc_thick_socks',      name: 'Thick socks',         category: 'accessory', layer: 'accessory', group: 'Accessories', tempRange: [-99, 6], seasonTags: ['winter'], clo: 0.05 },

    // ---- Weather gear ----------------------------------------------------
    { id: 'gear_sunglasses',      name: 'Sunglasses',          category: 'gear', layer: 'weather-gear', group: 'Weather gear', tempRange: [-99, 99], seasonTags: ['sun'], clo: 0 },
    { id: 'gear_umbrella',        name: 'Umbrella',            category: 'gear', layer: 'weather-gear', group: 'Weather gear', tempRange: [-99, 99], seasonTags: ['rain'], clo: 0 },
    { id: 'gear_parasol',         name: 'Parasol',             category: 'gear', layer: 'weather-gear', group: 'Weather gear', tempRange: [26, 99],  seasonTags: ['sun'], clo: 0 },
    { id: 'gear_raincoat',        name: 'Raincoat',            category: 'gear', layer: 'weather-gear', group: 'Weather gear', tempRange: [-99, 99], seasonTags: ['rain'], clo: 0.20, material: 'nylonShell' },
  ];

  const byId = {};
  C.forEach(function (it) { byId[it.id] = it; });

  // Closet panel section order (PRD §9).
  window.CLOSET_GROUPS = ['Tops', 'Bottoms', 'Skirts', 'Dresses', 'Sleepwear', 'Outerwear', 'Footwear', 'Headwear', 'Accessories', 'Weather gear'];

  window.CATALOG = C;
  window.itemById = function (id) { return byId[id]; };
  window.itemName = function (id) { return byId[id] ? byId[id].name : id; };
})();
