# Amphicos FPSO Digital Twin: architecture and module contract

Stack: Vite 5 + Three.js r169, vanilla ES modules, no UI framework, no CDN, no runtime network access.
Everything visible (3D, 2D drawings, system index, tags, HMI, simulation parameters) is generated from ONE file:
`src/data/fpso_db.json` (schema: see `docs/DB_SCHEMA.md`, validated by `tools/validate_db.mjs`).

## Folder ownership (parallel build)

| Folder | Owner | Content |
|---|---|---|
| `src/data/`, `docs/ENGINEERING_BASIS.md`, `tools/validate_db.mjs` | marine-technical-engineer | Authoritative database and engineering basis |
| `src/scene/` | design-visualization | Renderer, lighting, materials, hull, topsides, rooms, equipment builders, cutaway, highlight, variants, GLB export helper |
| `src/core/`, `src/camera/`, `src/ui/`, `src/drawings/`, `src/main.js`, `index.html`, `src/styles/`, `vite.config.js`, `tools/build_single.mjs`, `tools/serve.mjs`, `tools/export_glb.mjs`, `tests/e2e/`, `README.md` | software-automation (A: platform) | App shell, navigation, camera director, UI, 2D drawings, packaging, journey tests |
| `src/sim/`, `src/hmi/`, `tests/unit/` | software-automation (B: simulation) | Simulation engine and the 15 HMI / inspection modules |

Never edit a file in another owner's folder. If you need a change there, write the request in your return report.

## Coordinates

Ship frame (database): metres, X stern(0) to bow(300), Y port positive, Z keel up, main deck Z = 28.
World frame (Three.js, Y up): `core/coords.js` (owned by A, but this mapping is fixed here):
```
world.x =  ship.x - 150
world.y =  ship.z - T          // T = vessel.operating_draft, so the sea surface is world y = 0
world.z = -ship.y              // port is world -z, starboard world +z
```
Export: `shipToWorld([x,y,z]) -> THREE.Vector3`, `worldToShip(v) -> [x,y,z]`, `boxToWorld([x0,x1,y0,y1,z0,z1]) -> THREE.Box3`, `T`.
Scene code imports these; never re-implement the mapping.

## Events and state (`src/core/`, owner A)

`core/bus.js`: `bus.on(evt, fn) -> off()`, `bus.emit(evt, payload)`.
Events (payloads in braces):
- `select:system {systemId, source}`  source = 'index'|'tag'|'3d'|'2d'|'tour'|'key'
- `select:room {roomId, source}`
- `select:component {componentId, source}`
- `open:hmi {componentId, systemId}` / `close:hmi {}`
- `nav:level {level, systemId, roomId, componentId}`  level = 'vessel'|'room'|'equipment'|'hmi'
- `view:variant {variant}`  'legacy'|'retrofit'
- `sim:tick {t}` (emitted by sim at 10 Hz), `sim:alarm {systemId, code, text, severity, active}`
- `hover:component {componentId|null}`

`core/store.js`: `store.get()`, `store.set(partial)`, `store.subscribe(fn)`. State: `{level, systemId, roomId, componentId, variant, tour, panel2d}`.

## Scene API (`src/scene/world.js`, owner design-visualization)

```js
import { createRenderer } from './renderer.js'    // { renderer, scene, camera, resize(), render(), setQuality('high'|'medium'|'low') }
import { buildWorld } from './world.js'
const world = buildWorld(db, scene, { renderer })
world.root                       // THREE.Group
world.components                 // Map<componentId, THREE.Object3D>  (each has userData {componentId, systemId, pickable:true})
world.rooms                      // Map<roomId, { group, box: THREE.Box3 (world) }>
world.pickables                  // Array<THREE.Object3D> for raycasting (low cost proxies allowed)
world.screens                    // Map<componentId, Array<THREE.Mesh>> meshes whose material.map can be replaced by a CanvasTexture (HMI mirrors in 3D)
world.setCutaway(roomId|null, {animate:true})   // opens the hull/decks/bulkheads that hide the room from the camera side; null restores the closed vessel
world.setXRay(bool)              // optional: translucent hull for vessel-level overview of internal spaces
world.setHighlight({systemId?, componentIds?, mode:'select'|'hover'|'dim-others'|null})
world.setVariant('legacy'|'retrofit')          // swaps or restyles components whose variant matters (old analogue panels vs modern HMIs)
world.update(dt, elapsed)        // animations: sea, flare flame, rotating radar, engine vibration, beacons, screens
world.tagAnchors                 // Map<systemId, THREE.Vector3> world positions for the numbered system tags (primary component, slightly above)
world.dispose()
```
Performance budget: 60 fps target on a mid-range Windows laptop iGPU at 1080p with quality 'medium'; use InstancedMesh / merged geometries for repeated items (pipes, railings, stiffeners, cable trays, cabins), shared materials, procedural textures generated once to canvas (no image files needed), one shadow-casting directional light with tight frustum, PMREM environment from `RoomEnvironment` (offline, no HDR download).

## Camera director (`src/camera/`, owner A)

Staged navigation (brief section 6): vessel overview -> system -> room overview (from `rooms[].camera`) -> equipment focus -> HMI/inspection -> back.
- `director.flyTo({eye, target}, {duration, waypoints})` smooth eased path (Catmull-Rom through waypoints, eased time, look target interpolated separately), user input interrupts cleanly.
- Path planning from exterior to an internal room: rise/hold outside the hull at a clear standoff, move to a point outboard of the room on the open (cutaway) side, call `world.setCutaway(roomId)` during the approach, then enter to the room overview. Never pass through solid geometry: validate segments with a raycast against hull/deck colliders and add lift waypoints if obstructed.
- Inside a room: OrbitControls constrained to the room box (target clamped, distance limits), plus optional first-person walk (WASD) at eye height 1.7 m above room floor.
- History stack for Back/Escape restores previous camera pose and level.

## Simulation (`src/sim/`, owner B)

`createSim(db) -> sim`:
- `sim.start()`, `sim.stop()`, fixed step 10 Hz (`sim:tick`), deterministic given a seed (tests).
- `sim.state` plain object, single source of truth for every HMI and every 3D screen; never duplicate values in HMIs.
- `sim.command(name, args)` all operator actions go through here (e.g. `'gen.start' {id}`, `'breaker.close' {id}`, `'pms.mode' {mode}`, `'scenario.run' {id}`, `'fault.inject' {...}`).
- `sim.subscribe(path, fn)`; alarms collected in `sim.state.alarms` with system id, emitted as `sim:alarm`.
- Models: electrical network (generators with governor droop/isochronous load sharing, AVR voltage and reactive sharing, synchronising, breakers, bus tie, feeders, transformer/LV), PMS (standby start, stop, load-dependent start, load shedding, blackout recovery), relays (IED measurement, pickup, IDMT timing, trip, lockout, reset, event log), drives (VFD speed control of pumps, faults), DG local/engine (start sequence, LO pressure, cooling temp, overspeed), OMD (per-head readings, alarm, slowdown/shutdown request), boiler (BMS sequence: purge, pilot, main flame, drum level, steam pressure, flame failure), IGG (combustion, scrubber, O2 control, deck water seal, delivery to deck), ICSS (PCS loops, ESD levels, F&G concept, cause and effect, alarms; values from the same sim), PAGA (zones, tones, A/B amplifiers, line supervision, PABX interface), PABX (extensions, calls, trunk/hotline, paging into PAGA), IPTV (headend channels, set top boxes status), CCTV (cameras, NVR recording, health, PTZ). All values labelled educational simulation.

## HMI and inspection modules (`src/hmi/`, owner B)

One module per `systems[].hmi.module` id: `pms, dgctrl, relay, drives, icss, paga, pabx, iptv, cctv, boiler, igg, dglocal, omd, avr, governor`.
Each exports:
```js
export const meta = { id, title, systems: ['S02'], kind: 'hmi'|'inspection' }
export function mount(container, ctx) -> { unmount(), setVariant(variant) }
//   ctx = { db, sim, bus, componentId, systemId, variant }
export function renderMini(canvas2d, ctx)   // small live screen for the 3D monitor texture, cheap, called at <= 4 Hz
```
`src/hmi/index.js` exports `getHmi(moduleId)` and `hmiForComponent(db, componentId)`.
Visual language: restrained industrial HMI (ISA-101 style high-performance greys, colour only for abnormal states), large readable type for exhibition displays, every screen shows the banner "EDUCATIONAL SIMULATION, not live vessel control, not OEM logic".
Legacy vs retrofit: `setVariant('legacy')` shows the representative legacy interface or panel (analogue meters, lamp test, mimic), `'retrofit'` the modern interface.

## 2D drawings (`src/drawings/`, owner A)

SVG generated at runtime from the same db: GA plan (main deck), profile (starboard elevation with internal decks/rooms), deck plans per deck, room layout per room (equipment footprints with tags and access), system distribution overlay (where a system's components are). Same ids as 3D (`data-id` attributes). Click in 2D emits the same `select:*` events; selections from 3D highlight in 2D.

## Packaging (owner A)

`npm run build` -> `dist/` (multi-file, served by `tools/serve.mjs`, zero dependencies) and `dist-single/Amphicos_FPSO_Digital_Twin.html` (everything inlined, opens by double-click from file://). `tools/export_glb.mjs` uses Playwright to open the app and export the generated scene to `assets/Amphicos_FPSO_Twin.glb`. Windows launcher `Start_Digital_Twin.bat`.
