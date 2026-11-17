# Moonpetal 🌙

*A cozy bedtime merge-garden. Wind down, merge moonlight, plant it, and let the night creatures find you.*

Moonpetal is a mobile-first PWA built for one-handed play before sleep. Sessions are engaging but end gracefully after ~15 minutes: the garden dims, a lullaby fades in, and the screen says goodnight — then your half-grown plants bloom overnight, waiting for the next launch.

No backend. No accounts. No ads. No purchases. No guilt. All progress lives in `localStorage` on your device, and the whole game works offline after the first load.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 23 unit tests (merge logic, save/load, reward scheduler)
npm run build    # production build to dist/
```

Deployed copy: **https://ahmed-m-elgammal.github.io/games/** (after enabling Pages, see below).

---

## The loop

1. **Board** (7×9) — tap the *Moonwell* to spawn Seeds/Dust (costs energy, refills generously: +1/10s, +5 per merge, never a hard fail). Drag two identical items together to merge up the chain; dropping onto a pair surrounded by more identical items multi-merges (3+ = bonus energy + richer chime, 5+ = free seed).
2. **Chains** — `Seeds → Sprouts → Buds → Moonpetals → Glow Blooms → Star Trees` and `Dust → Fireflies → Lanterns → Wisps → Constellations`. Top tiers can't merge — they're *plantable*.
3. **Garden** — plant top-tier items into the Night Garden. Planted things grow through the session and pay **Serenity** (40% on planting, 60% on bloom). Serenity unlocks garden zones and attracts creatures.
4. **Creatures** — 12 of them (owl, moth, fox, hedgehog, moon rabbit, snail, frog, star cat, firefly sprite, deer, whale-cloud, tortoise), each drawn procedurally, each with a 3-chapter bedtime story unlocked visit by visit. The Journal shows silhouettes for the undiscovered.
5. **Goodnight** — sessions wind down (see *Bedtime design* below), show tomorrow's preview, and anything half-grown **blooms overnight**.

## Screens

`Splash → Board → Garden → Journal → Settings → Goodnight → Sleep` — bottom-nav one-handed layout, portrait only.

## Science-based engagement (all implemented)

| Principle | Where | How |
| --- | --- | --- |
| Flow / dynamic difficulty | `boardScreen.update()` | Tracks idle time + merge pace. Idle >18s → Moonwell pulses; >30s → a free "stray seed" drifts in (max 3/session). Fast players get tier-goal wishes ("grow a Glow Bloom"). |
| Variable rewards | `game/rewards.ts` | Probability re-drawn every 8 merges within `[0.04, 0.10]`; pity timer guarantees a reward within 22 merges. Rewards: gold/silver petals, energy, wild seeds, creature lures. |
| Goal gradient | `screens/ui.ts ring()` | Progress rings use an eased fill (`p^0.85`) so they visibly accelerate near completion; growth rings on plants do the same. |
| Zeigarnik effect | `core/save.ts applyOffline()` | Every session ends with growing plants; anything planted before you leave blooms overnight and is revealed with a ceremony on next launch. |
| Collection completion | `journalScreen` | Sticker-book grid, dark silhouettes + "at N Serenity" hints for the undiscovered, chapter dots per creature. |
| Peak-end rule | `main.ts sessionTick()` | Final 60s = sparkle rain + creature cameos on the board; wind-down = warm dim + lullaby; the goodnight card is the last thing you see. |

## Bedtime design

- **Wind-down** — at session end (default 15 min, adjustable 5/10/15/20) the board slows (spawn cost halves), the screen warms (`#dim` multiply blend), a synthesized lullaby fades in, and the Goodnight card appears with tomorrow's preview. *Five more minutes* is offered exactly once, then never again that session.
- **Palette** — deep indigo `#17123a`, warm amber `#ffb35c`, soft teal `#6fe3c1`. No pure white, no flashing, no sudden sounds (all envelopes ≥40 ms).
- **Audio** — 100% synthesized WebAudio (`audio/audio.ts`): chord pads + pink-noise wind + pentatonic music box; tap pitch rises with tier; merges add bell partials per bonus item. Separate **master / music / effects** sliders, haptics toggle.
- **Accessibility** — every item tier has a unique silhouette (shape-first, not hue-first), plus an optional shape-assist outline toggle. Reduced-motion toggle (and `prefers-reduced-motion` respected). ≥44 px touch targets. ARIA labels on all controls + a polite live region announcing merges/visits (`#sr`).
- **Auto-dim** — permanent warm blue-light-reduced tint, toggleable.

## Retention (non-manipulative)

Daily **dew drop** gift (+40 energy, +1 wildflower seed) with a returning-player welcome. No streaks, no penalties, no guilt copy, no fake urgency, **no notifications**. Session time pauses while the app is hidden. The Tomorrow preview names the nearest creature/zone without countdown pressure.

## Content

- **12 creatures** × 3 story chapters (`src/data/creatures.json`)
- **40 plants** — 5 zones × (Moonpetal, Glow Bloom, Star Tree, Wisp Lantern, Constellation, Golden Moonpetal, Dewbell, Nightgrass) (`src/data/plants.json`)
- **5 garden zones** unlocked by Serenity: Moonlit Glade 0 · Fern Hollow 300 · Starfall Bank 800 · Cloud Meadow 1600 · The Deep Night 2600
- **3 board moods**: Dawn Meadow, Moon Pond, Star Grove (`art/background.ts`) — auto by clock or fixed in Settings

## Architecture

```
src/
├── main.ts            boot, screen manager, session/wind-down state machine, debug API
├── core/
│   ├── save.ts        GameState schema, migrate, offline math (energy, blooms, dew)
│   └── rng.ts         seeded mulberry32
├── data/
│   ├── chains.ts      the two merge chains (names, colors)
│   ├── creatures.json 12 creatures + 36 story chapters
│   ├── plants.json    40 plants
│   ├── zones.json     5 zones
│   └── creatures.ts / plants.ts   typed exports
├── game/              pure logic (no DOM) — unit-tested
│   ├── board.ts       7×9 merge model: move/swap/merge/multi-merge/cascade
│   ├── rewards.ts     variable-ratio + pity scheduler
│   ├── garden.ts      planting, growth, serenity, zone unlocks
│   └── creatures.ts   visits, chapter unlocks, ambient visit roll
├── art/               procedural rendering (pre-rendered offscreen sprites → 60fps)
│   ├── draw.ts        glow/orb/petal/star/sleepy-face primitives
│   ├── sprites.ts     11 item sprites × 3 variants
│   ├── background.ts  3 moods: sky, moon, stars, aurora, hills, pond
│   ├── creatureArt.ts the 12 creature artists
│   └── particles.ts   bursts, rings, sparkles (cap 140)
├── audio/audio.ts     WebAudio synth (ambient, sfx, lullaby) + haptics
├── screens/           splash, board, garden, journal, settings, goodnight, story overlay
└── styles.css         glassy dark UI, safe-area aware
```

**Stack**: TypeScript + Vite + Canvas 2D (no PixiJS — for ~100 glowing sprites, pre-rendered offscreen canvases hit 60fps with zero dependencies and a 37 KB gzipped bundle). PWA: `manifest.webmanifest` + `public/sw.js` (precache core, cache-first runtime, offline after first visit). Icons are procedurally generated with `scripts/make_icons.py` (PIL).

## Adding content (data-driven)

**A new creature** — append to `src/data/creatures.json`:

```json
{
  "id": "puddle", "name": "Puddle", "species": "Rain Puddle Spirit",
  "art": "sprite",                       // reuse an existing artist...
  "threshold": 3000,                     // Serenity needed to attract it
  "zone": 4,                             // preferred zone
  "palette": { "body": "#9fd8e8", "belly": "#e8fbff", "accent": "#ffd76e" },
  "blurb": "One sentence hint.",
  "chapters": [ { "title": "...", "text": "One gentle paragraph per visit." } ]
}
```

For a unique look, add a small draw function in `art/creatureArt.ts` and register its name in the `switch(art)` — that's the whole integration; journal, thresholds, and stories all flow from the JSON.

**A new plant** — append to `plants.json` (pick a `source` from the existing item kinds or the wildflowers; `growthMin` and `serenity` are your tuning knobs). **A new zone** — append to `zones.json` with its `need` threshold and ground/flora colors.

**A new item tier** — extend `CHAINS` in `data/chains.ts` and add a `drawXxx` case in `art/sprites.ts`.

## Tuning values

All in one place, safe to tweak:

| Knob | File | Default | Meaning |
| --- | --- | --- | --- |
| `ENERGY_MAX` | `core/save.ts` | 100 | cap |
| `ENERGY_REGEN_MS` | `core/save.ts` | 10 000 | +1 energy per 10 s (also offline) |
| `SPAWN_COST` | `core/save.ts` | 10 | Moonwell spawn cost (halved during wind-down) |
| `BONUS_ENERGY_PER_EXTRA` | `data/chains.ts` | 4 | energy per item in a 3+ merge |
| `MAX_CONSUMED` / `MAX_CASCades` | `game/board.ts` | 6 / 3 | multi-merge cap / cascade depth |
| `REWARD_TUNING.BATCH` | `game/rewards.ts` | 8 | re-draw variable probability every N merges |
| `REWARD_TUNING.PITY` | `game/rewards.ts` | 22 | guaranteed reward within N merges |
| `REWARD_TUNING.P_MIN/P_MAX` | `game/rewards.ts` | 0.04 / 0.10 | variable-ratio probability bounds |
| reward weights | `game/rewards.ts WEIGHTS` | gold .32 / silver .22 / energy .20 / lure .15 / seed .11 | reward mix |
| creature `threshold`s | `data/creatures.json` | 30…2500 | Serenity to attract each creature |
| zone `need`s | `data/zones.json` | 0…2600 | Serenity to unlock zones |
| plant `serenity` / `growthMin` | `data/plants.json` | 6…60 / 4…20 min | payout (40/60 split) and growth time |
| `OVERNIGHT_AFTER_MS` | `core/save.ts` | 3.5 h | away-time before blooms resolve |
| `PEAK_LAST_S` / `WINDOWN_S` | `main.ts` | 60 / 18 | peak-end window / wind-down duration |
| session length | Settings | 15 (5/10/15/20) | minutes until wind-down |

## Tests

`npm test` — 23 tests in `tests/`:
- **merge.test.ts** — pair merge, move, swap, 3+ bonus, `MAX_CONSUMED` cap, cascade, top-tier refusal, bounds, spawn, variant precedence.
- **save.test.ts** — round-trip, corrupt JSON fallback, migration/clamps, energy regen, overnight bloom rules, dew-once-per-day.
- **rewards.test.ts** — pity bound, probability bounds, real-world reward rate, reward-kind validity.

## Debug mode

Open with `#debug` in the URL to get `window.__mp`: `spawn(n)`, `fill()`, `autoMerge(n)`, `serenity(n)`, `forceVisit()`, `winddown()`, `goodnight()`, `setLastSeenAgo(h)`, `bloomAll()`, `save()`.

## Deploying (GitHub Pages)

```bash
npm run build
cd dist && git init -b gh-pages && git add -A && git commit -m "deploy"
git remote add origin <repo-url> && git push -f origin gh-pages
# then: repo Settings → Pages → Source: gh-pages
```

The build uses `base: './'`, so it works from any subpath.
