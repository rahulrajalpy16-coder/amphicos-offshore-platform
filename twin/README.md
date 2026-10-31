# Amphicos FPSO 3D Digital Twin

An interactive, offline, exhibition-ready engineering visualisation of a representative FPSO (floating production, storage and offloading vessel) that shows where 15 electrical, automation, control and telecom systems are installed, how they work and how Amphicos would retrofit or upgrade them.

Everything you see is generated from one equipment-location database, `src/data/fpso_db.json`: the 3D vessel and rooms, the numbered tags, the system index, the 2D engineering drawings, the equipment cards and the parameters of the educational HMI simulations. Identifiers (`S01` to `S15`, `R_...` rooms, `C_...` components) are the same in every view.

> Educational simulation and representative arrangement. Not vessel-specific, not a shipyard or construction drawing, not live vessel control, not OEM logic. No engineering validation, class approval, certification or OEM compatibility is claimed. See the About panel in the app and `docs/ENGINEERING_BASIS.md`.

## Run it offline on Windows

You do not need internet access or any installation to run the delivered build.

1. Copy the whole `amphicos-fpso-twin` folder to the laptop (USB stick is fine).
2. Double-click `Start_Digital_Twin.bat`. It opens `dist-single/Amphicos_FPSO_Digital_Twin.html` in the default browser.
   You can also double-click that HTML file directly. Chrome or Edge (current versions) are recommended; hardware graphics acceleration must be on (Edge or Chrome: Settings, System).
3. Optional, for a local web server instead of a file: install Node.js 18 or newer and run `Start_Digital_Twin.bat serve`, which starts the server in a minimised window, waits until it answers and then opens http://127.0.0.1:8080/ (bound to this computer only).

For a large external display: press F11 for full screen. The interface scales with the screen (readable at 1080p and 4K). In the About panel you can set the display quality (high, medium, low) for weaker graphics hardware.

URL options (append to the address, for example `...Digital_Twin.html?presenter=1&idle=120`):

| Option | Effect |
|---|---|
| `presenter=1` | Show the presenter quick-jump bar at start |
| `idle=180` | Seconds without input before attract mode (default 180) |
| `tourDwell=9` | Seconds the guided tour stays on each system (default 9) |
| `quality=high` | `high`, `medium` (default) or `low` |
| `fps=1` | Show a frame-rate counter |

## How a visitor uses it (stages 1 to 6)

1. **Vessel**: the complete FPSO with free orbit (drag), pan (right-drag or two fingers), zoom (wheel or pinch), view presets (Views), X-ray hull, and 15 numbered tags. Tags that would overlap merge into a small room cluster whose numbers stay clickable; tags hidden behind structure are drawn dashed.
2. **Select a system** in the index (left), a tag, the presenter bar or a number key. The camera flies along a planned path (2 to 4 s, eased, through waypoints outside the hull, checked against the geometry with raycasts and lifted if anything is in the way). During the approach the hull, decks and bulkheads on the camera side are cut away.
3. **Room**: the camera arrives at the room overview. The selected system's equipment is highlighted and the rest dimmed. The right panel lists every item in the room, and for distributed systems the other rooms ("also located in") with fly-to links. Nothing opens automatically. Orbit is constrained to the room; Walk mode (F) gives a first-person view at 1.7 m eye height (WASD or arrows, drag to look, on-screen pad on touch screens).
4. **Equipment**: click any cabinet, panel, sensor or screen. The camera focuses on its operating face and the equipment card shows tag, description, inspection points, legacy versus retrofit, connections (cables and protocols, with links) and interfaces.
5. **HMI or inspection**: "Open HMI" (or "Inspect" for equipment without a screen) opens the system module in a large window (about 88 % of the screen) with the 3D view dimmed behind it. Screens in the 3D rooms show live miniature versions of the same HMIs (driven by the same simulation state). The CCTV desk shows real pictures of the twin, rendered from each camera's position and pan, tilt and zoom (about 2 pictures per second, only while the CCTV window is open).
6. **Return**: Esc or Back steps back (HMI, equipment, room, vessel) with smooth return flights; the breadcrumb (Vessel > Room > Equipment > HMI) jumps to any level; Home returns to the vessel and closes the hull.

**Legacy and Retrofit** (top bar or V) switches the equipment generation in 3D, in the simulation and HMIs (`variant.set` for all systems) and in the cards. Inside an HMI the module's own toggle switches only that system.

**2D drawings** (G): general arrangement plan, inboard profile, deck plans, room layouts (equipment footprints, operating faces, tags, access, cable routes) and a system distribution view, all generated from the database at run time, with title blocks marked "Representative arrangement, not for construction". Clicking anything in 2D selects and flies to it in 3D; anything selected in 3D is highlighted in 2D ("Follow 3D" keeps the room or deck in sync). Drag to pan, wheel to zoom, double-click to fit.

## Presenter and exhibition use

| Key | Action |
|---|---|
| 1 to 9, 0 | Fly to systems 1 to 10 |
| Shift+1 to Shift+5 | Fly to systems 11 to 15 |
| PageDown / N, PageUp / B | Next or previous system (works with presentation clickers) |
| Esc | Back one step |
| H or Home | Vessel overview |
| I or Enter | Open the HMI or inspection of the focused equipment |
| G | 2D drawings |
| X | X-ray |
| V | Legacy or retrofit |
| F | Walk mode in a room |
| T | Guided tour (Space pauses) |
| P | Presenter quick-jump bar |
| ? | About and shortcuts |

- **Guided tour** (T or the Guided tour button): visits all 15 systems, first the installation room, then the main equipment, with plain-language captions for non-technical visitors. Any click or key pauses it; Resume, Previous, Next and End tour are on the caption.
- **Attract mode**: after `idle` seconds without input the app closes panels, returns to the vessel and slowly orbits with a "touch to explore" prompt. Any input returns control.

## Build from source

Requires Node.js 18 or newer. No network access is needed at run time; `npm ci` needs the npm registry once.

```
npm ci
npm run build          # validates the database, builds dist/ and dist-single/Amphicos_FPSO_Digital_Twin.html
npm run serve          # serves dist/ on http://127.0.0.1:8080
npm run dev            # development server with hot reload
npm test               # unit tests (simulation, HMI modules, platform)
npm run test:e2e       # full visitor journey in headless Chromium (uses a globally installed Playwright, see below)
npm run export:glb     # writes assets/Amphicos_FPSO_Twin.glb (about 43 MB) from the generated scene
```

**End-to-end tests and Playwright.** `tests/e2e/run_e2e.mjs` and `tools/export_glb.mjs` load Playwright with `require('playwright')` from a global installation; Playwright is deliberately not listed in `package.json`, so `npm ci` and the offline build need no browser download. On a machine with internet access, install it once with `npm install -g playwright` and `npx playwright install chromium` (make the global module resolvable, for example with `NODE_PATH`). Useful options: `--no-build`, `--only=S04,S12` (journeys for selected systems; the boot, 2D, presenter, attract, phone, offline and console tests always run).

`dist/` is a multi-file build for a web server (browsers block ES modules from file:// so use `npm run serve`). `dist-single/` is the self-contained file for double-click use.

## Project structure

```
index.html                  App page (no external resources, restrictive Content Security Policy)
src/main.js                 Entry: wires data, scene, simulation, HMIs, camera, navigation, UI and 2D
src/data/fpso_db.json       THE authoritative database (schema: docs/DB_SCHEMA.md, validated by tools/validate_db.mjs)
src/core/                   coords.js (ship <-> world frame), bus.js (events), store.js (state), nav.js (navigation
                            state machine and history), deps.js (module resolution)
src/camera/                 director.js (orbit, flights, constraints, presets), path.js (route planning, pure),
                            collide.js (raycast rules incl. cutaway clipping), walk.js (first-person mode)
src/ui/                     shell (top bar, breadcrumb), system index, tags, context panel (room panel, equipment
                            card), HMI window host, live 3D screen textures, picking, presenter (keys, tour,
                            attract), About
src/drawings/               views.js (SVG drawings generated from the db, pure), panel.js (2D dock, pan/zoom, cross-selection)
src/scene/                  Procedural vessel, topsides, rooms, equipment builders, materials, cutaway, highlight
src/sim/                    Simulation engine (single source of truth for all HMIs and 3D screens)
src/hmi/                    15 HMI and inspection modules (mount, unmount, setVariant, renderMini)
src/styles/app.css          UI styles (system font stack, scales with display size)
tools/                      build_single.mjs, serve.mjs, export_glb.mjs, validate_db.mjs
tests/unit/                 Simulation and HMI unit tests; src/core/__tests__/ platform unit tests
tests/e2e/run_e2e.mjs       Visitor journey for all 15 systems, 2D/3D cross-selection, offline, phone viewport
docs/                       ARCHITECTURE.md (module contract), DB_SCHEMA.md, ENGINEERING_BASIS.md
dist/, dist-single/         Build outputs
assets/                     Exported GLB of the generated model
```

## Extending it (data-driven)

- **Add or move equipment**: add a component to `components[]` in `fpso_db.json` (id, system, room, pos, size, facing, type, description, inspection). Add its id to the system's `components`. Run `npm run validate`. The 3D builder for its `type`, the room panel, the 2D room layout and the tags pick it up automatically.
- **Add a room**: add it to `rooms[]` with its box inside the hull and a `camera.overview_eye/overview_target`. Flights, cutaway, the 2D deck plan and the room layout use it without code changes.
- **Add a system**: add an entry to `systems[]` (id, number, name, commercial_group, primary_room, rooms, components, primary_component, hmi.module, legacy, retrofit). The index, tags, presenter keys, tour and 2D markers are generated from this list. If it needs a new HMI, create `src/hmi/<module>.js` exporting `meta`, `mount(container, ctx)` and `renderMini(canvas, ctx)` and register it in `src/hmi/index.js`.
- **Replace an HMI**: modules only talk to `ctx.sim` (commands and state) and `ctx.bus`, so a module can be rewritten without touching the scene or navigation.
- **Replace the 3D model of an equipment type**: edit its builder in `src/scene/equipment/`; positions stay in the database.

## Design decisions (platform)

- **Vanilla ES modules + Three.js r169, no UI framework**: smallest offline footprint, no runtime dependencies besides three.
- **One event bus and one store** decouple views: index, tags, 3D picks, 2D drawings, keys and the tour all emit the same `select:*` events; the navigation state machine (`core/nav.js`) is the only place that changes level and camera.
- **Camera flights**: centripetal Catmull-Rom spline through planned waypoints (exterior standoff, portal outside the room on the cutaway side, room overview), eased in and out, look target eased separately so the destination is framed early. Exterior legs are raycast against the full scene and lifted where blocked; legs inside the opened hull are checked against equipment (hull and decks are removed by the cutaway, and the raycast honours the cutaway clipping planes). User input interrupts a flight cleanly.
- **Arrival viewpoints**: selecting a system flies to `systems[].arrival` (eye, target, vertical FOV and the system's primary components, authored in the database) so the system's own key equipment is in view; `rooms[].camera` is used for room navigation and as the fallback. After every system arrival an occlusion-aware check samples each primary component (centre and operating face), counts a sample only if it lies in the free screen area between the panels and is the first thing hit by a pick ray, and logs a console warning if a component is hidden. Database arrival viewpoints are never moved automatically; only the room-camera fallback is adjusted when fittings block it.
- **Stall-protected flights**: the flight clock advances by one typical frame when a frame takes far longer than usual (for example a shader compile on first entry to a room), so a stall pauses the flight instead of making the camera jump.
- **History stack** stores the camera pose of every level so Back returns to exactly where the visitor was.
- **CCTV live view**: `ctx.renderCameraView()` renders the scene from the camera component into a 320 x 180 render target, throttled to about 2 fps and slower if a render is expensive, reusing the last picture in between.
- **Optical centre between the panels**: the camera view offset is shifted so the vessel or room is framed in the free area between the system index and the context panel.
- **Tags as DOM elements** (not WebGL sprites) for crisp text at 4K, accessibility and touch targets; declutter by screen-space clustering and occlusion fading.
- **2D drawings as SVG generated at run time** from the same database, with non-scaling line weights so they stay legible at any zoom.
- **Palette**: Amphicos blue (#3BAEE6) and navy (#1F3B64) from the flyer used only for selection and accents on a dark neutral UI; colour otherwise reserved for states (amber legacy, red alarm), following high-performance HMI practice.
- **System fonts only** (Segoe UI on Windows), so no font files are loaded.

## Limitations (honest)

- The vessel and equipment are **procedural, representative models** built from the database, not a scanned or shipyard model. Proportions and locations follow typical FPSO practice documented in `docs/ENGINEERING_BASIS.md`; they are not those of a specific vessel.
- **No previous application source code** was supplied, only concept GLB files, GA PDFs and a system location JSON. These were reviewed and used as references (deviations are recorded in the database); the platform was built new.
- **Simulations are educational**: plausible, internally consistent behaviour, not OEM control logic and not suitable for operational decisions.
- **Performance figures from the automated tests are indicative only**: the headless test browser renders in software (SwiftShader), which is far slower than a laptop GPU. Real frame rates must be checked on the target exhibition laptop (use `?fps=1`).
- The exported GLB (`assets/Amphicos_FPSO_Twin.glb`) is a static snapshot of the procedural model for use in other viewers; it is not used by the app, which always builds the model from the database.
- The single-file build runs in current Chrome and Edge. Very old browsers without WebGL 2 are not supported.
- Touch screens are supported (orbit, pinch, tap, on-screen walk pad); multi-touch gestures depend on the browser and display driver.
