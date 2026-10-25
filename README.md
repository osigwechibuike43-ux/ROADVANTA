# ROADVANTA — Drive Your World.

A 3D open-world driving game that runs entirely in the browser. React + TypeScript + Three.js (React Three Fiber) + Vite.
No accounts, no backend, no API keys: progress is saved locally in the browser.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm test           # unit tests (save validation, physics, navigation, config)
```

**Test on a phone:** run `npm run dev`, then open `http://<your-computer-LAN-IP>:5173` on a phone on the same Wi‑Fi. Use landscape and the **Low** graphics preset first (Settings).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate / brake & reverse | W / S or ↑ / ↓ | GAS / BRAKE |
| Steer | A / D or ← / → | ◀ ▶ |
| Handbrake | Space | HB |
| Camera (chase / far / cockpit) | C | CAM |
| Reset car onto the road | R | RST |
| Horn | H | – |
| Pause | Esc | II |

Gamepad (left stick, triggers, A) is also read when connected. The game auto-pauses when the tab loses focus.

## What is implemented

- **City:** 7×7 block procedural city (~0.7 km²): arterial roads and streets, intersections with working traffic signals, sidewalks, crosswalks, lane/stop markings, apartments/towers/shops/houses, parks, parking, trees, lamps, bus stops, benches, hydrants, fences. Day/night cycle with window glow and lit streets.
- **Vehicles:** 6 drivable vehicles (hatch, sedan, SUV, sports coupe, supercar, motorcycle) with distinct procedural models and physics. AI traffic also has vans, buses, bicycles and police cruisers. Colours, paint, and engine/tyre/brake upgrades change the real physics values.
- **Physics:** custom arcade-sim vehicle model (grip-limited lateral dynamics, handbrake slides, suspension pitch/roll) with OBB collisions against buildings, props and other vehicles. *Rapier is not used* — a purpose-built 2D model was far more stable and cheaper on phones.
- **Traffic & pedestrians:** AI cars follow lanes along the road network, obey signals, yield to vehicles/pedestrians, turn at junctions and recover when stuck. Pedestrians use sidewalk graphs, wait for crossings, and react when hit.
- **Modes:** Free Drive (wanted level from speeding, red lights, crashes, hitting pedestrians), Career (destination, timed, delivery, distance, speed and drift challenges), Street Racing (countdown, checkpoints, AI rivals with rubber‑banding, placement payouts), Police Chase (escape or reach the safe house). 16 missions with level gates.
- **Progression:** XP, levels (30), coins, par‑time bonuses, replay reward reduction (25 %), level milestones, garage (buy / select / paint / upgrade), local save with versioning, validation and reset confirmation.
- **UI/UX:** main menu, modes, mission list, garage with live 3D preview, settings (graphics preset, camera distance, speed unit, 4 volume controls, mute), HUD with speed/gear/rpm/objective/timer/position/wanted, rotating minimap, pause menu with confirmations, results screen, first‑run controls guide, error boundary, loading screen, touch controls and a rotate‑device hint.
- **Audio:** fully procedural WebAudio (engine, tyre squeal, wind, city ambience, collisions, horn, sirens, UI sounds, ambient music). It is not positional 3D audio.
- **Performance:** merged static geometry, instanced props and pedestrians, pooled vehicle rigs, fixed sub‑stepped physics, no React renders per frame, and Low/Medium/High presets (resolution, shadows, fog, traffic and pedestrian counts).

## Architecture

```
src/
  config/     vehicles, missions, game tuning (all numbers in one place)
  core/       store (zustand UI state), save (versioned + validated), runtime (mutable game state), input, audio, math
  vehicles/   physics, collisions, procedural models
  world/      city layout, textures, buildings, roads, props, sky/lighting
  sim/        navigation graph, traffic, pedestrians, police, race AI
  game/       session (modes/missions/rewards), GameScene (loop, camera, markers)
  ui/         menus, garage, settings, HUD, overlays, touch controls
tests/        vitest unit tests
```

## Honest limitations

- No multiplayer, no accounts, no cloud save (by design).
- Buildings are procedural low-poly with generated textures, not photoreal assets; interiors do not exist.
- Only the Ronin 650 motorcycle is drivable among two-wheelers; bicycles and extra motorbikes appear in traffic only.
- Collision damage is cosmetic‑free (impacts cause shake, sound and heat, not deformation).
- Audio and graphics were validated in headless Chromium (software rendering); real‑device frame rates were not measured, so start on Low on older phones.
- Dev builds expose `window.__rv` for debugging; it is stripped in production.
