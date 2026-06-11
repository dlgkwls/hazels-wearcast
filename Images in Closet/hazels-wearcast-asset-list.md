# Hazel's Wearcast: Image Asset List

Hand this list to the image generator (GPT). Attach it next to the PRD when giving both to Claude Code. Total: 60 images (1 character base + 59 clothing/accessory sprites).

## Instructions for the image creator (read first)

- Style: cute pixel art, consistent palette, single front-facing character.
- Critical for layering: every sprite MUST share the same canvas size and the same anchor/registration as the base character, so pieces stack correctly when worn. Pick one canvas size (for example 256x384 or 512x768) and use it for every file, with the character centered and the feet on a fixed baseline.
- Background: transparent PNG (alpha) for every file except the base.
- Position each garment exactly where it sits on the body: tops on the torso, bottoms and skirts on the legs, outerwear over the top, hats on the head, sunglasses on the eyes, scarf on the neck, shoes on the feet, umbrella in the hand.
- Outerwear that is normally open (cardigans, jackets) should be drawn open so an inner top can show through.
- Dresses are full-body and replace top plus bottom.
- Filenames must match exactly: lowercase, underscores, `.png`. The website maps each wardrobe item to its filename.

## 0. Character base (1)

- `character_base_pajamas.png`: the character in pajamas with a simple cute default face. This is the starting state; all clothes layer on top. Keep the face simple and centered so a photo can overlay the head region in a later version.

## 1. Tops (10)

- `top_tank.png`: tank top, sleeveless
- `top_short_sleeve_tee.png`: short-sleeve t-shirt
- `top_polo.png`: collared polo shirt
- `top_light_shirt.png`: light button shirt / blouse
- `top_long_sleeve_tee.png`: thin long-sleeve tee
- `top_sweatshirt.png`: crewneck sweatshirt
- `top_hoodie.png`: hoodie with hood
- `top_light_knit.png`: thin knit sweater
- `top_heavy_knit.png`: thick chunky knit sweater
- `top_turtleneck.png`: turtleneck top

## 2. Bottoms (10)

- `bottom_shorts.png`: casual shorts
- `bottom_denim_shorts.png`: denim shorts
- `bottom_chinos.png`: chino / cotton pants
- `bottom_slacks.png`: dress slacks
- `bottom_jeans.png`: blue jeans
- `bottom_joggers.png`: jogger / track pants
- `bottom_short_leggings.png`: cropped short leggings
- `bottom_long_leggings.png`: full-length leggings
- `bottom_fleece_pants.png`: fleece-lined pants (non-denim)
- `bottom_fleece_jeans.png`: fleece-lined jeans

## 3. Skirts (4)

- `skirt_mini.png`: mini skirt
- `skirt_midi.png`: knee-length midi skirt
- `skirt_long.png`: long / maxi skirt
- `skirt_fleece.png`: fleece-lined winter skirt

## 4. Dresses (4, full-body)

- `dress_sleeveless.png`: sleeveless dress
- `dress_short_sleeve.png`: short-sleeve dress
- `dress_long_sleeve.png`: long-sleeve dress
- `dress_knit.png`: knit (winter) dress

## 5. Outerwear (12, draw open where applicable)

- `outer_light_cardigan.png`: thin open cardigan
- `outer_heavy_cardigan.png`: thick knit cardigan
- `outer_windbreaker.png`: light windbreaker jacket
- `outer_denim_jacket.png`: denim jacket
- `outer_blazer.png`: smart blazer
- `outer_leather_jacket.png`: leather jacket
- `outer_trench_coat.png`: trench coat
- `outer_coat.png`: wool winter coat
- `outer_fleece_jacket.png`: fleece jacket
- `outer_light_puffer.png`: light / packable puffer
- `outer_short_puffer.png`: short puffer jacket
- `outer_long_puffer.png`: long puffer coat

## 6. Footwear (5, on feet)

- `shoe_sandals.png`: sandals / slides
- `shoe_sneakers.png`: sneakers
- `shoe_loafers.png`: loafers / dress shoes
- `shoe_boots.png`: boots
- `shoe_rain_boots.png`: rain boots

## 7. Headwear (3, on head)

- `hat_cap.png`: baseball cap
- `hat_bucket.png`: bucket hat
- `hat_beanie.png`: knit beanie

## 8. Accessories (6)

- `acc_scarf.png`: scarf / muffler around the neck
- `acc_gloves.png`: gloves on the hands
- `acc_tights.png`: tights / stockings on the legs (worn with skirts or dresses)
- `acc_socks.png`: regular socks (small, may be barely visible; still provide)
- `acc_thick_socks.png`: thick socks (small)
- `acc_jewelry.png`: simple necklace or bracelet accent

## 9. Weather gear (5)

- `gear_sunglasses.png`: sunglasses on the eyes
- `gear_umbrella.png`: umbrella held in the hand
- `gear_parasol.png`: parasol / sun umbrella held in the hand
- `gear_raincoat.png`: raincoat (full outer layer)
- `gear_hand_warmer.png`: small hand warmer held in the hand (small, optional)

---

### Count by group
Base 1, Tops 10, Bottoms 10, Skirts 4, Dresses 4, Outerwear 12, Footwear 5, Headwear 3, Accessories 6, Weather gear 5. Total 60.
