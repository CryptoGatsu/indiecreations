// The cosmetics on sale. Prices are in USD; the $CREATIONS amount is worked out at checkout from the live price.
//
// To add one: append an entry, drop its art in /public/shop, push.
//   id           permanent and unique, [a-z0-9-]. The game looks cosmetics up by this id, and it is what gets recorded
//                against the buyer's Steam account - so never rename or reuse one.
//   game         which game it belongs to (the game asks for its own cosmetics by this name)
//   usd          price in US dollars
//   image        optional, e.g. '/shop/game-neon-trail.png' (square works best); a checker tile is shown without one
//   available    false = shown as "Coming soon" and cannot be bought
//
// Only list cosmetics the game can actually show: a purchase is a real payment.
// My Favorite Sheep: on sale in the browser game (/my-favorite-sheep), bought in-game with the player's wallet.
// The ids are permanent and match Cosmetics.cs in the game.
const MFS_ON_SALE = true;
const MFS = 'My Favorite Sheep';
// Don't Worry, You're Safe!: on sale in the browser game (/youre-safe), bought in its CREATIONS shop with the player's
// wallet. The ids are permanent: the game maps its SKU buddy.<item_id> to ys-<item-id> (underscores become hyphens).
// Simple weapons, food, toys and starter hazards cost in-game coins and are not listed here.
const YS_ON_SALE = true;
const YS = "Don't Worry, You're Safe!";

const ITEMS = [
  // ---- hats
  { id: 'mfs-hat-cowboy', game: MFS, name: 'Cowboy hat', description: 'Worn leather, curled brim. Somebody has to keep order out here.', usd: 5, image: '/shop/mfs-hat-cowboy.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-beanie', game: MFS, name: 'Wool beanie', description: 'Knitted from the flock itself. Cosy on night watch.', usd: 5, image: '/shop/mfs-hat-beanie.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-tophat', game: MFS, name: 'Top hat', description: 'For the farmer who takes the investigation very seriously.', usd: 5, image: '/shop/mfs-hat-tophat.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-bucket', game: MFS, name: 'Bucket hat', description: 'Keeps the rain off. Mostly.', usd: 5, image: '/shop/mfs-hat-bucket.png', available: MFS_ON_SALE },
  { id: 'mfs-hat-cap', game: MFS, name: 'Red cap', description: 'A little too bright for sneaking up on anything.', usd: 5, image: '/shop/mfs-hat-cap.png', available: MFS_ON_SALE },

  // ---- outfits
  { id: 'mfs-outfit-vest', game: MFS, name: 'Leather vest', description: 'Brass buttons, deep pockets, no nonsense.', usd: 3, image: '/shop/mfs-outfit-vest.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-apron', game: MFS, name: "Butcher's apron", description: 'Sends a message to the flock.', usd: 3, image: '/shop/mfs-outfit-apron.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-bandana', game: MFS, name: 'Red bandana', description: 'Knotted at the neck, ready for dust.', usd: 3, image: '/shop/mfs-outfit-bandana.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-raincoat', game: MFS, name: 'Yellow raincoat', description: 'Bright as a warning. The wolf sees you coming, and so do your friends.', usd: 3, image: '/shop/mfs-outfit-raincoat.png', available: MFS_ON_SALE },

  // ---- T-shirts (outfits: a fitted tee with a chest print; the sleeves take the tee's colour)
  { id: 'mfs-outfit-tee-sheep', game: MFS, name: 'Sheep tee', description: 'Soft cream cotton with a woolly face on the front.', usd: 3, image: '/shop/mfs-outfit-tee-sheep.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-tee-wolf', game: MFS, name: 'Howl tee', description: 'Charcoal, with a wolf howling at a golden moon. Bold, given the circumstances.', usd: 3, image: '/shop/mfs-outfit-tee-wolf.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-tee-farmfresh', game: MFS, name: 'Farm Fresh tee', description: "Sage green with the farm's own stamp on the chest.", usd: 3, image: '/shop/mfs-outfit-tee-farmfresh.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-tee-lamb', game: MFS, name: 'I Love Lambs tee', description: 'Pink, proud and completely sincere.', usd: 3, image: '/shop/mfs-outfit-tee-lamb.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-tee-sunset', game: MFS, name: 'Sunset tee', description: 'Navy, with the sun going down behind the windmill.', usd: 3, image: '/shop/mfs-outfit-tee-sunset.png', available: MFS_ON_SALE },
  { id: 'mfs-outfit-tee-hoodlock', game: MFS, name: 'Hoodlock tee', description: 'Black with the green Hoodlock mark - the farmers who keep the tokens locked.', usd: 3, image: '/shop/mfs-outfit-tee-hoodlock.png', available: MFS_ON_SALE },

  // ---- tool skins (stick, pitchfork and axe all change together)
  { id: 'mfs-skin-gilded', game: MFS, name: 'Gilded tools', description: 'Walnut handles and gold-plated heads. Ridiculous on a farm.', usd: 2, image: '/shop/mfs-skin-gilded.png', available: MFS_ON_SALE },
  { id: 'mfs-skin-blackiron', game: MFS, name: 'Black iron tools', description: 'Charcoal and blackened iron, for a farmer who means it.', usd: 2, image: '/shop/mfs-skin-blackiron.png', available: MFS_ON_SALE },
  { id: 'mfs-skin-candycane', game: MFS, name: 'Candy cane tools', description: 'Peppermint red and white. Wolves hate it.', usd: 2, image: '/shop/mfs-skin-candycane.png', available: MFS_ON_SALE },
  { id: 'mfs-skin-frostbite', game: MFS, name: 'Frostbite tools', description: 'Pale ash and a blade that glows cold in the dark.', usd: 2, image: '/shop/mfs-skin-frostbite.png', available: MFS_ON_SALE },

  // ---- titles (shown after the player's name to everyone in the game)
  { id: 'mfs-title-shepherd', game: MFS, name: 'Title: Shepherd', description: 'Shown after your name to everyone in the game.', usd: 1, image: '/shop/mfs-title-shepherd.png', available: MFS_ON_SALE },
  { id: 'mfs-title-wolfsbane', game: MFS, name: 'Title: Wolfsbane', description: 'Shown after your name to everyone in the game.', usd: 1.5, image: '/shop/mfs-title-wolfsbane.png', available: MFS_ON_SALE },
  { id: 'mfs-title-sheriff', game: MFS, name: 'Title: Sheriff of the Pasture', description: 'Shown after your name to everyone in the game.', usd: 1.5, image: '/shop/mfs-title-sheriff.png', available: MFS_ON_SALE },
  { id: 'mfs-title-lambchop', game: MFS, name: 'Title: Lamb Chop', description: 'Shown after your name to everyone in the game.', usd: 1, image: '/shop/mfs-title-lambchop.png', available: MFS_ON_SALE },
  { id: 'mfs-title-nightwatch', game: MFS, name: 'Title: Night Watch', description: 'Shown after your name to everyone in the game.', usd: 1, image: '/shop/mfs-title-nightwatch.png', available: MFS_ON_SALE },
  { id: 'mfs-title-counter', game: MFS, name: 'Title: Counts Sheep to Sleep', description: 'Shown after your name to everyone in the game.', usd: 1, image: '/shop/mfs-title-counter.png', available: MFS_ON_SALE },

  // ---- emotes (each adds a slice to the in-game emote wheel)
  { id: 'mfs-emote-wave', game: MFS, name: 'Emote: Wave', description: 'A big friendly wave.', usd: 5, image: '/shop/mfs-emote-wave.png', available: MFS_ON_SALE },
  { id: 'mfs-emote-jig', game: MFS, name: 'Emote: Jig', description: 'A little victory dance.', usd: 5, image: '/shop/mfs-emote-jig.png', available: MFS_ON_SALE },
  { id: 'mfs-emote-facepalm', game: MFS, name: 'Emote: Facepalm', description: 'For when the notebook says it was obvious.', usd: 5, image: '/shop/mfs-emote-facepalm.png', available: MFS_ON_SALE },
  { id: 'mfs-emote-bow', game: MFS, name: 'Emote: Bow', description: 'Take a bow.', usd: 5, image: '/shop/mfs-emote-bow.png', available: MFS_ON_SALE },

  // ---- auras (a gentle particle effect around your farmer that everyone else sees)
  { id: 'mfs-aura-fireflies', game: MFS, name: 'Aura: Fireflies', description: 'A few warm fireflies drift around you, day and night.', usd: 4, image: '/shop/mfs-aura-fireflies.png', available: MFS_ON_SALE },
  { id: 'mfs-aura-sparkle', game: MFS, name: 'Aura: Golden glint', description: 'Little gold sparkles rise off your shoulders.', usd: 4, image: '/shop/mfs-aura-sparkle.png', available: MFS_ON_SALE },
  { id: 'mfs-aura-raincloud', game: MFS, name: 'Aura: Personal rain cloud', description: 'A small grey cloud follows you about and drizzles on your hat.', usd: 5, image: '/shop/mfs-aura-raincloud.png', available: MFS_ON_SALE },
  { id: 'mfs-aura-hearts', game: MFS, name: 'Aura: Sweetheart', description: 'Tiny hearts float up now and then. The sheep approve.', usd: 4, image: '/shop/mfs-aura-hearts.png', available: MFS_ON_SALE },
  { id: 'mfs-aura-leaves', game: MFS, name: 'Aura: Autumn swirl', description: 'A handful of autumn leaves circles your boots.', usd: 4, image: '/shop/mfs-aura-leaves.png', available: MFS_ON_SALE },
  { id: 'mfs-aura-frost', game: MFS, name: 'Aura: Frostbitten', description: 'Snowflakes drift about you and a cold mist curls at your feet.', usd: 4, image: '/shop/mfs-aura-frost.png', available: MFS_ON_SALE },
  // ---- Don't Worry, You're Safe! (weapons, guns, explosives, heavy ordnance, traps, rooms, disasters, services)
  { id: 'ys-katana', game: YS, name: 'Katana', description: 'Clean cuts. In Mature mode, very clean.', usd: 1.49, image: '/shop/ys-katana.png', available: YS_ON_SALE },
  { id: 'ys-machete', game: YS, name: 'Machete', description: 'For clearing jungles. And buddies.', usd: 0.99, image: '/shop/ys-machete.png', available: YS_ON_SALE },
  { id: 'ys-axe', game: YS, name: 'Battle Axe', description: 'Heavy, slow, final.', usd: 1.49, image: '/shop/ys-axe.png', available: YS_ON_SALE },
  { id: 'ys-sledge', game: YS, name: 'Sledgehammer', description: 'Demolition, but personal.', usd: 0.99, image: '/shop/ys-sledge.png', available: YS_ON_SALE },
  { id: 'ys-crowbar', game: YS, name: 'Crowbar', description: 'Opens crates. Closes arguments.', usd: 0.99, image: '/shop/ys-crowbar.png', available: YS_ON_SALE },
  { id: 'ys-chainsaw', game: YS, name: 'Chainsaw', description: 'Hold to rev. Hold to regret.', usd: 2.49, image: '/shop/ys-chainsaw.png', available: YS_ON_SALE },
  { id: 'ys-pistol', game: YS, name: 'Pistol', description: 'Laser sight included.', usd: 1.99, image: '/shop/ys-pistol.png', available: YS_ON_SALE },
  { id: 'ys-revolver', game: YS, name: 'Revolver', description: 'Six shots. Big feelings.', usd: 1.99, image: '/shop/ys-revolver.png', available: YS_ON_SALE },
  { id: 'ys-shotgun', game: YS, name: 'Shotgun', description: 'Spread, huge knockback.', usd: 2.49, image: '/shop/ys-shotgun.png', available: YS_ON_SALE },
  { id: 'ys-smg', game: YS, name: 'SMG', description: 'Hold to spray.', usd: 2.49, image: '/shop/ys-smg.png', available: YS_ON_SALE },
  { id: 'ys-minigun', game: YS, name: 'Minigun', description: 'Spin-up. Sustained stream. Capped at 20 hits/s.', usd: 2.99, image: '/shop/ys-minigun.png', available: YS_ON_SALE },
  { id: 'ys-sniper', game: YS, name: 'Sniper Rifle', description: 'One massive hit. Slow-mo included.', usd: 2.99, image: '/shop/ys-sniper.png', available: YS_ON_SALE },
  { id: 'ys-nailgun', game: YS, name: 'Nail Gun', description: 'Pins limbs to walls.', usd: 1.49, image: '/shop/ys-nailgun.png', available: YS_ON_SALE },
  { id: 'ys-flamethrower', game: YS, name: 'Flamethrower', description: 'Hold for a stream of fire. Sets things burning.', usd: 2.99, image: '/shop/ys-flamethrower.png', available: YS_ON_SALE },
  { id: 'ys-freezeray', game: YS, name: 'Freeze Ray', description: 'Ice block, then an angry wriggle.', usd: 2.49, image: '/shop/ys-freezeray.png', available: YS_ON_SALE },
  { id: 'ys-lasercannon', game: YS, name: 'Laser Cannon', description: 'A very serious beam.', usd: 2.99, image: '/shop/ys-lasercannon.png', available: YS_ON_SALE },
  { id: 'ys-tesla', game: YS, name: 'Tesla Gun', description: 'Arcs chain through metal props. Wet buddies conduct better.', usd: 2.99, image: '/shop/ys-tesla.png', available: YS_ON_SALE },
  { id: 'ys-grenade', game: YS, name: 'Grenade', description: 'Pull pin. Throw. Apologize.', usd: 1.49, image: '/shop/ys-grenade.png', available: YS_ON_SALE },
  { id: 'ys-stickybomb', game: YS, name: 'Sticky Bomb', description: 'Sticks to whatever it touches first. Hopefully the buddy.', usd: 1.49, image: '/shop/ys-stickybomb.png', available: YS_ON_SALE },
  { id: 'ys-clusterbomb', game: YS, name: 'Cluster Bomb', description: 'Pops into six bomblets.', usd: 1.99, image: '/shop/ys-clusterbomb.png', available: YS_ON_SALE },
  { id: 'ys-dynamite', game: YS, name: 'Dynamite', description: 'Long fuse. Big boom. Cartoon physics.', usd: 1.49, image: '/shop/ys-dynamite.png', available: YS_ON_SALE },
  { id: 'ys-c4', game: YS, name: 'Remote C4', description: 'Place it. Click again to detonate. Beeps ominously.', usd: 1.99, image: '/shop/ys-c4.png', available: YS_ON_SALE },
  { id: 'ys-mustard', game: YS, name: 'Mustard Gas Grenade', description: 'A yellow cloud that makes everything cough.', usd: 1.99, image: '/shop/ys-mustard.png', available: YS_ON_SALE },
  { id: 'ys-biojar', game: YS, name: 'Plague Jar', description: 'Shatters into glowing goo and fumes. Sticky. Green. Wrong.', usd: 1.99, image: '/shop/ys-biojar.png', available: YS_ON_SALE },
  { id: 'ys-molotov', game: YS, name: 'Molotov', description: 'Shatters into a carpet of fire.', usd: 1.49, image: '/shop/ys-molotov.png', available: YS_ON_SALE },
  { id: 'ys-flashbang', game: YS, name: 'Flashbang', description: 'Blinds and deafens. It can\'t see you coming for a while.', usd: 0.99, image: '/shop/ys-flashbang.png', available: YS_ON_SALE },
  { id: 'ys-blackhole', game: YS, name: 'Black Hole Grenade', description: 'Sucks in everything, then spits it out.', usd: 2.99, image: '/shop/ys-blackhole.png', available: YS_ON_SALE },
  { id: 'ys-launcher', game: YS, name: 'Rocket Launcher', description: 'Point away from face.', usd: 2.49, image: '/shop/ys-launcher.png', available: YS_ON_SALE },
  { id: 'ys-grenadelauncher', game: YS, name: 'Grenade Launcher', description: 'Lobbed, bouncy, rude.', usd: 2.49, image: '/shop/ys-grenadelauncher.png', available: YS_ON_SALE },
  { id: 'ys-homing', game: YS, name: 'Homing Missile', description: 'Lock-on beeping. The buddy runs.', usd: 2.99, image: '/shop/ys-homing.png', available: YS_ON_SALE },
  { id: 'ys-airstrike', game: YS, name: 'Airstrike', description: 'A carpet of bombs. Flare, then two seconds.', usd: 2.99, image: '/shop/ys-airstrike.png', available: YS_ON_SALE },
  { id: 'ys-orbital', game: YS, name: 'Orbital Laser', description: 'A sweeping beam from space.', usd: 4.99, image: '/shop/ys-orbital.png', available: YS_ON_SALE },
  { id: 'ys-nuke', game: YS, name: 'Nuke', description: 'Siren. Flash. Mushroom cloud.', usd: 4.99, image: '/shop/ys-nuke.png', available: YS_ON_SALE },
  { id: 'ys-sawblade', game: YS, name: 'Buzz Saw', description: 'Spins up with a whine, then travels its rail.', usd: 1.49, image: '/shop/ys-sawblade.png', available: YS_ON_SALE },
  { id: 'ys-crusher', game: YS, name: 'Crusher Piston', description: 'Hisses, then slams.', usd: 1.49, image: '/shop/ys-crusher.png', available: YS_ON_SALE },
  { id: 'ys-pendulum', game: YS, name: 'Swinging Hammer', description: 'Tick. Tock. Bonk.', usd: 1.49, image: '/shop/ys-pendulum.png', available: YS_ON_SALE },
  { id: 'ys-boxglove', game: YS, name: 'Boxing Glove Wall', description: 'Punches whatever walks past.', usd: 0.99, image: '/shop/ys-boxglove.png', available: YS_ON_SALE },
  { id: 'ys-cannon', game: YS, name: 'Cannon', description: 'Fires cannonballs on a timer.', usd: 1.49, image: '/shop/ys-cannon.png', available: YS_ON_SALE },
  { id: 'ys-flameturret', game: YS, name: 'Flamethrower Turret', description: 'Sweeps a cone of fire.', usd: 1.99, image: '/shop/ys-flameturret.png', available: YS_ON_SALE },
  { id: 'ys-autoturret', game: YS, name: 'Auto-Turret', description: 'Tracks the buddy. Red eye means it sees it.', usd: 1.99, image: '/shop/ys-autoturret.png', available: YS_ON_SALE },
  { id: 'ys-laseremitter', game: YS, name: 'Laser Grid', description: 'Hums. Blinks on and off. Burns.', usd: 1.49, image: '/shop/ys-laseremitter.png', available: YS_ON_SALE },
  { id: 'ys-missilepod', game: YS, name: 'Missile Pod', description: 'Fires homing missiles on a timer.', usd: 1.99, image: '/shop/ys-missilepod.png', available: YS_ON_SALE },
  { id: 'ys-toxicpool', game: YS, name: 'Toxic Pool', description: 'The buddy turns green and wades out as fast as it can.', usd: 1.49, image: '/shop/ys-toxicpool.png', available: YS_ON_SALE },
  { id: 'ys-lavapit', game: YS, name: 'Lava Pit', description: 'It hops out holding its feet.', usd: 1.49, image: '/shop/ys-lavapit.png', available: YS_ON_SALE },
  { id: 'ys-tarpit', game: YS, name: 'Tar Pit', description: 'Sticky. So very slow.', usd: 0.99, image: '/shop/ys-tarpit.png', available: YS_ON_SALE },
  { id: 'ys-electricfloor', game: YS, name: 'Electric Floor', description: 'Toggles on and off. Zzzt.', usd: 1.49, image: '/shop/ys-electricfloor.png', available: YS_ON_SALE },
  { id: 'ys-landmine', game: YS, name: 'Landmine', description: 'Hidden once placed. The buddy learns where they are.', usd: 1.49, image: '/shop/ys-landmine.png', available: YS_ON_SALE },
  { id: 'ys-wreckingball', game: YS, name: 'Wrecking Ball', description: 'Big swing energy.', usd: 1.99, image: '/shop/ys-wreckingball.png', available: YS_ON_SALE },
  { id: 'ys-spikeceiling', game: YS, name: 'Spike Ceiling', description: 'Drops when the buddy walks under it.', usd: 1.49, image: '/shop/ys-spikeceiling.png', available: YS_ON_SALE },
  { id: 'ys-cage', game: YS, name: 'Falling Cage', description: 'Gotcha.', usd: 0.99, image: '/shop/ys-cage.png', available: YS_ON_SALE },
  { id: 'ys-acidcloud', game: YS, name: 'Acid Rain Cloud', description: 'A little cloud of personal misery.', usd: 1.99, image: '/shop/ys-acidcloud.png', available: YS_ON_SALE },
  { id: 'ys-env-kitchen', game: YS, name: 'Kitchen', description: 'Tiles, snacks, and a lot of places to hide.', usd: 2.99, image: '/shop/ys-env-kitchen.png', available: YS_ON_SALE },
  { id: 'ys-env-lab', game: YS, name: 'Laboratory', description: 'For science. Mostly the bad kind.', usd: 2.99, image: '/shop/ys-env-lab.png', available: YS_ON_SALE },
  { id: 'ys-env-moon', game: YS, name: 'Moon Base', description: 'Low gravity. Very long throws.', usd: 3.49, image: '/shop/ys-env-moon.png', available: YS_ON_SALE },
  { id: 'ys-env-volcano', game: YS, name: 'Volcano', description: 'Warm. Too warm. Embers everywhere.', usd: 3.99, image: '/shop/ys-env-volcano.png', available: YS_ON_SALE },
  { id: 'ys-earthquake', game: YS, name: 'Earthquake', description: 'The ground shakes. The buddy grabs on.', usd: 2.99, image: '/shop/ys-earthquake.png', available: YS_ON_SALE },
  { id: 'ys-meteor', game: YS, name: 'Meteor Shower', description: 'Streaks, then craters.', usd: 3.49, image: '/shop/ys-meteor.png', available: YS_ON_SALE },
  { id: 'ys-tornado', game: YS, name: 'Tornado', description: 'Approaching vortex. Grip or fly.', usd: 3.49, image: '/shop/ys-tornado.png', available: YS_ON_SALE },
  { id: 'ys-lightning', game: YS, name: 'Lightning Storm', description: 'Pre-flash, then zap.', usd: 2.99, image: '/shop/ys-lightning.png', available: YS_ON_SALE },
  { id: 'ys-flood', game: YS, name: 'Flood', description: 'Rising water. The buddy climbs to high ground.', usd: 3.99, image: '/shop/ys-flood.png', available: YS_ON_SALE },
  // skins (the free and coin skins are in-game only)
  { id: 'ys-skin-power-surge', game: YS, name: 'Skin: Power Surge', description: 'Spiky gold hair, a white gi and a lot of fighting spirit.', usd: 2.99, image: '/shop/ys-skin-power-surge.png', available: YS_ON_SALE },
  { id: 'ys-skin-marshmallow-puff', game: YS, name: 'Skin: Marshmallow Puff', description: 'Plush, pastel and impossibly soft.', usd: 1.99, image: '/shop/ys-skin-marshmallow-puff.png', available: YS_ON_SALE },
  { id: 'ys-skin-shadow-ninja', game: YS, name: 'Skin: Shadow Ninja', description: 'Silent. Swift. Still scared of the hammer.', usd: 2.49, image: '/shop/ys-skin-shadow-ninja.png', available: YS_ON_SALE },
  { id: 'ys-skin-iron-knight', game: YS, name: 'Skin: Iron Knight', description: "Full plate armor. Doesn't help as much as you'd think.", usd: 2.99, image: '/shop/ys-skin-iron-knight.png', available: YS_ON_SALE },
  { id: 'ys-skin-cosmonaut', game: YS, name: 'Skin: Cosmonaut', description: 'Suited up for the moon base.', usd: 2.99, image: '/shop/ys-skin-cosmonaut.png', available: YS_ON_SALE },
  { id: 'ys-skin-chrome-bot', game: YS, name: 'Skin: Chrome Bot', description: 'Polished chrome with glowing seams.', usd: 2.99, image: '/shop/ys-skin-chrome-bot.png', available: YS_ON_SALE },
  { id: 'ys-skin-undead', game: YS, name: 'Skin: Undead', description: 'Stitched back together. Again.', usd: 1.99, image: '/shop/ys-skin-undead.png', available: YS_ON_SALE },
  { id: 'ys-skin-cyber-neon', game: YS, name: 'Skin: Cyber Neon', description: 'Matte black with neon circuits.', usd: 2.49, image: '/shop/ys-skin-cyber-neon.png', available: YS_ON_SALE },
  { id: 'ys-skin-captain', game: YS, name: 'Skin: Captain', description: "A pirate captain's coat, bandana and boots.", usd: 2.49, image: '/shop/ys-skin-captain.png', available: YS_ON_SALE },
  { id: 'ys-skin-molten-core', game: YS, name: 'Skin: Molten Core', description: 'Cracked rock with lava running through it.', usd: 3.49, image: '/shop/ys-skin-molten-core.png', available: YS_ON_SALE },
  { id: 'ys-rename', game: YS, name: 'Name Tag', description: 'Rename your buddy as often as you like.', usd: 0.99, image: '/shop/ys-rename.png', available: YS_ON_SALE },
  { id: 'ys-builder', game: YS, name: 'Map Builder', description: 'Build rooms, platforms, ladders and traps. Your buddy learns every layout.', usd: 4.99, image: '/shop/ys-builder.png', available: YS_ON_SALE },
  { id: 'ys-inner-voice', game: YS, name: 'Inner Voice', description: 'Your buddy keeps a journal and remembers out loud.', usd: 4.99, image: '/shop/ys-inner-voice.png', available: YS_ON_SALE },

  // {
  //   id: 'game-neon-trail',
  //   game: 'Some Game',
  //   name: 'Neon Trail',
  //   description: 'A glowing trail that follows your character.',
  //   usd: 2.5,
  //   image: '/shop/game-neon-trail.png',
  //   available: true,
  // },
];

// Sample items for working on the shop locally. Never shown in production.
const DEMO_ITEMS = [
  { id: 'demo-checker-cape', game: 'Demo Game', name: 'Checker Cape', description: 'Sample item for local development.', usd: 2.5, available: true },
  { id: 'demo-ink-trail', game: 'Demo Game', name: 'Ink Trail', description: 'Sample item for local development.', usd: 1, available: true },
  { id: 'demo-paper-crown', game: 'Demo Game', name: 'Paper Crown', description: 'Sample item for local development.', usd: 5, available: false },
];

const demo = process.env.NODE_ENV !== 'production' && process.env.SHOP_DEMO === '1';

export const CATALOG = (demo ? [...ITEMS, ...DEMO_ITEMS] : ITEMS).filter(
  (item) => /^[a-z0-9-]{1,64}$/.test(item.id) && Number.isFinite(item.usd) && item.usd > 0
);

export const findItem = (id) => CATALOG.find((item) => item.id === id) || null;

// What kind of cosmetic an item is, for grouping in the shop: read from its permanent id (<game>-<kind>-<name>).
// In shop order; anything unrecognised lands in 'other'.
export const ITEM_TYPES = [
  ['hat', 'Hats'],
  ['outfit', 'Outfits'],
  ['tee', 'T-shirts'],
  ['skin', 'Tool skins'],
  ['title', 'Titles'],
  ['emote', 'Emotes'],
  ['aura', 'Auras'],
  ['other', 'More'],
];
export function typeOf(item) {
  const parts = String(item.id).split('-');
  const kind = parts[1] === 'outfit' && parts[2] === 'tee' ? 'tee' : parts[1];
  return ITEM_TYPES.some(([k]) => k === kind) ? kind : 'other';
}
