# Inkline Customs

*Every ship lies. The ink tells the truth.*

A deduction × inspection sim at an ink-drawn port, built **data-driven on a strict MVVM architecture**. You are the customs clerk: ships dock one at a time as living ink drawings, you cross-check the drawing against the paperwork, find the lie (or confirm there is none), and stamp a verdict. Fees fund your desk; mistakes cost strikes; the port watches.

Implemented from the [Inkline Customs design & engineering specification](../../wiki) (v1.0, 2026-11-17) as a solo-dev-survivable vertical slice on this branch. **Zero runtime dependencies** — the ink renderer, the audio engine and the reactive binding kit are all written in code, no asset files.

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 38 tests incl. 30,000-ship solvability sweep
npm run check:layers   # MVVM layer-boundary lint
npm run build          # typecheck + production bundle (~23 KB gz)
npm run preview        # serve dist/
```

---

## The loop

```
SHIP DOCKS → INSPECT (pan/zoom/loupe/tools) → CROSS-CHECK (manifest · registry · rulebook · tides)
→ VERDICT (Approve A · Deny D · Hold & Search H · Fine F) → FEE or STRIKE → next ship … → VERDICT CARD
```

- **Shift** = 10 minutes at 20 Hz (12,000 ticks), 6 ships at rank 0, arrivals on the tide clock.
- **3 strikes → shift lost** (fees forfeit; the career continues — no roguelite reset).
- Clean shift bonus +50¢ × ships resolved. Fines pay ×3 but only when the rule allows them.
- Hold & Search costs 45 s and angers honest captains (Guild −2).
- **Evidence pins** (+3¢ each): click any part of the drawing — or the seal / tide row on the papers — to pin the lie in red ink. Pinning feeds the card stats and the adaptive smuggler.
- **Rank ladder:** Clerk → Inspector (+Brass Scale) → Senior Inspector (+Ink Reagent) → Harbor Master (+Lamp). One new rulebook chapter per shift, older rules stay in force — escalation is additive, never faster.

## Evidence channels (no clue is colour-only)

| Channel | Read by | Example lie | Redundancy |
|---|---|---|---|
| Line weight | Eye / Magnifier | Church seal drawn in the light hand | Heavy vs light stroke on the manifest seal |
| Trade colour + pattern | Eye | Fish crate wearing Timber amber | Every trade has its own stripe pattern: fish wave · timber rings · grain dots · cloth cross · ore diagonal · faith chevron · contraband none |
| Geometry | Eye / Registry overlay | Hull silhouette ≠ registered class; mast count; bow shape | Registry prints the lawful silhouette + overlay button |
| Documents | Cross-check | Count tallies, weighed mass, embargoed flag, tide window | Numbers, never pixels |
| Hidden | Hold & Search / Reagent | Contraband under a tarp; forged ink that bleeds; erased-and-redrawn lines | Requires the verb to reveal |

Every generated case is **provably solvable**: `assertSolvable` gates the generator so an injected lie is the *only* observable violation, observable with the player's current chapters and tools, and visual clues clear a 2.5 px screen-space floor. A case that cannot be solved never ships — proven by a 30,000-ship property sweep in `test/gen.test.ts`.

## Architecture — data-driven MVVM

Six-ring layering (mirrors the spec's §4, adapted from ECS to MVVM), enforced mechanically by `npm run check:layers`:

```
app ──► view ──► viewmodel ──► model (pure simulation, imports nothing above it)
 │
 └── model/data — all game content as JSON (rules DSL, hulls, trades, flags, config)
```

| Layer | Owns | Forbidden |
|---|---|---|
| `src/model/` | Schema, seeded PRNG, rules DSL evaluator, generators, world reducer (`step`). Pure, deterministic, headless-runnable. | Any DOM/window import; `Math.random`; `Date.now` (lint-enforced) |
| `src/model/data/` | **The content**: 15-rule JSON DSL, hulls, trades, flags, captains, economy config, palette. | — |
| `src/viewmodel/` | `derivePortView(world)` — everything the desk shows, derived per tick; tiny reactive `Signal`/`watch` binding kit; re-renders are signature-guarded. | Mutating the world |
| `src/view/` | Canvas ink diorama (parametric ships, exact part picking, loupe), DOM documents, HUD, stamps, verdict card, WebAudio synth. | Importing sim logic — reads the ViewModel only, emits intents |
| `src/app/` | Composition root: the **single edit queue**, the fixed 20 Hz loop, localStorage saves. | — |

**One edit queue.** The View never mutates the world; it enqueues `Interaction`s (`verdict`, `pinEvidence`, `tool`). The simulation consumes them at fixed ticks through the pure reducer `step(world, interactions)`. The queue is recorded, which makes replays, re-simulation and server anti-cheat trivially correct — `test/determinism.test.ts` proves the same seed + same script produces an identical world hash. Camera intents stay view-local in this slice.

**Data-driven content.** Adding a rule = adding a JSON object to `src/model/data/rules.json`:

```json
{
  "id": "seal.crown.weight",
  "chapter": 1, "tier": 1, "channel": "weight", "part": "seal",
  "statement": "A Crown seal is drawn in the heavy hand…",
  "requires": { "tool": null, "reveal": null },
  "when": { "params.seal.authority": "crown" },
  "check": { "part": "params.seal.weight", "expect": 2 },
  "forgery": { "sets": [{ "path": "params.seal.weight", "op": "set", "value": 1 }] },
  "verdicts": { "deny": true, "fine": false }
}
```

The evaluator is a pure function shared by the generator, the simulation and the solvability gate — the same JSON renders the rulebook UI, drives forgery injection, and (later) will validate community cases in the editor.

**Determinism** (spec §5): fixed 20 Hz tick, integer cents, `cyrb128 → sfc32` seeded streams (one per concern), no nondeterminism in `model/`. Daily shifts (`customs-v1:<date>`) use a fixed baseline plan and never touch the adaptive-smuggler histogram — identical ships worldwide.

## Spec compliance — this branch vs the full v1.0 spec

| Spec area | Status here |
|---|---|
| Core loop, desk, documents, verdict stamps, fees/strikes | ✅ playable |
| Evidence channels T1–T3 (weight, trade, geometry, document, hidden) | ✅ 15 rules / 6 chapters |
| Forgery injector + `assertSolvable` + property sweep | ✅ 10k ships × 3 tiers green |
| Determinism: seeded PRNG, one edit queue, replay hash | ✅ (render-side camera not yet recorded) |
| Career ranks, tools, chapter escalation, factions, threshold events | ✅ |
| Adaptive smuggler (softmax over missed rules) | ✅ career only, never daily |
| Reactive port entities, events | 🟡 threshold events + fee modifiers only |
| Daily seed + verdict card + share PNG download | ✅ (leaderboard/worker deferred) |
| PixiJS 3D ink renderer, WebGPU/GLSL, pooled meshes | 🔄 replaced by a zero-dep Canvas ink renderer at this ring; `render/` stays swappable |
| Cloudflare Worker (shares, re-sim anti-cheat, D1), Tauri, co-op, case editor | ⏳ later rings (architecture already queues interactions for re-sim) |

Renderer note: the spec's Pixi 3D/WebGPU ink renderer is the v1.0 target; this slice ships a hand-rolled Canvas 2D ink renderer (silhouette contours, two line weights, surface hatching, fog-as-paper) to stay asset-free and solo-survivable. The view layer is the only thing coupled to it — `viewmodel` contracts do not leak renderer types, so a Pixi renderer can slot in behind the same `PortView`.

## Testing

| Suite | Proves |
|---|---|
| `test/rng.test.ts` | PRNG reproducibility, stream separation, stable hashing |
| `test/rules.test.ts` | DSL evaluator: when/expect/expectRef/forbid/within, tool + reveal gates, ambiguity detection |
| `test/gen.test.ts` | 10,000 ships × 3 tiers: honest ships violate nothing; forged ships violate exactly their own rule; shift plans solvable and seed-stable |
| `test/determinism.test.ts` | Same seed + script → identical world hash; different seeds diverge; arrivals on schedule |
| `test/economy.test.ts` | Verdict table, fee multipliers, strikes → loss + forfeit, clean bonus, miss histogram |

`?debug` in the URL exposes a small E2E hook (`window.__inkline`: `world()`, `view()`, `advance(ticks)`) for Playwright-style browser runs — used for the golden-path verification of this branch.

## Repository context

This branch (`inkline-customs`) carries the whole standalone Vite app at repo root, following the same convention as the other games in `ahmed-m-elgammal/games` (each game = one branch = one shippable ring). `main` holds Moonpetal; merging this branch into `main` would deploy Inkline Customs to the Pages site via the existing workflow.

**Every ship lies. The ink tells the truth.**
