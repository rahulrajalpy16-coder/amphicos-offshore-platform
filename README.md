# Amphicos 3D Offshore Platform

Interactive 3D demonstration platform for offshore clients: a jack-up rig, the Amphicos FPSO digital twin and the
Amphicos frequency converter, in one connected offshore scene. It runs in a browser with no internet connection,
no installation and no paid services.

Three experiences open from the home screen:

1. **3D Rig Experience**: power, drive, jacking and safety systems of a generic jack-up rig.
2. **3D FPSO Experience**: the FPSO digital twin, 15 electrical, automation and telecom systems, plus the AMP-SPC
   frequency converter and AMP-HI hybrid inverter on deck.
3. **Explore Complete Offshore Environment**: both assets and the shore-power application in one scene.

Every system follows the same steps: asset overview, system overview (the camera frames the complete equipment and
fades anything in the way), component or HMI (the camera faces the screen, then the HMI opens), and Back.

All content is a representative educational demonstration: not vessel-specific, not for construction and not live
vessel control.

## Editions

| Edition | Where | Notes |
|---|---|---|
| Online | GitHub Pages (built by `.github/workflows/pages.yml`) | Leaves out the client's CAD screenshots |
| Offline | `dist/Amphicos_Platform_Offline.zip` | Unzip, then run the launcher for Windows or macOS; works with no internet |

### Running the offline edition

1. Unzip `Amphicos_Platform_Offline.zip` (USB drive, external disk or laptop). Keep the files together.
2. Windows: double-click `Start Amphicos (Windows).bat`. macOS: double-click `Start Amphicos (Mac).command`
   (first time only: right-click it, choose Open, then Open). Or simply open `index.html` in Chrome or Edge.
3. Full screen: F11 (Windows) or Ctrl+Cmd+F (Mac). Esc steps back.

Best results: current Chrome or Edge with hardware acceleration on, laptop plugged in. Optimised for a MacBook Air M2
(16 GB); on a 4K exhibition TV, Exhibition mode (View menu) keeps the 3D smooth automatically. The View menu also has
a frame counter for a quick check before a demo (a steady 50 to 60 fps is ideal).

## Building from source

Requires Node.js 18 or newer (the npm registry is needed once for `npm ci`).

```
npm run setup        # installs the FPSO twin's build tools (three.js, Vite, esbuild)
npm run build        # dist/web (online) and dist/offline/Amphicos_Platform (offline)
npm run package      # build + dist/Amphicos_Platform_Offline.zip
npm run test:twin    # FPSO twin unit tests
```

The offline edition includes the 13 container design screenshots only when they are present in `private/shelter/`
(not committed). Without them the build still succeeds and simply leaves the image gallery out.

Browser tests (`tests/*.mjs`) use Playwright with a locally installed Chromium; serve `dist/offline/Amphicos_Platform`
on http://127.0.0.1:8766 (and the same folder as `demo-test.html` on port 8765 for the older suites) before running them.

## Project structure

```
src/rig/rig.html        The platform page: home, rig scene, offshore view, converter, rig HMIs and simulations
src/shared/fonts.css    Embedded fonts (Barlow Condensed, IBM Plex Sans, IBM Plex Mono; SIL Open Font License)
twin/                   The FPSO digital twin (Vite project; its own README and engineering basis in twin/docs)
twin/src/embed/         Embedded mode: handover with the platform, converter menu, showcase containers, exterior module
launchers/              Windows and macOS launchers and the offline README
tools/build.mjs         Builds both editions as self-contained HTML (three.js bundled, no CDN, no web fonts)
tools/package.mjs       Zips the offline edition
tests/                  Browser test suites (framing audit, handover, HMIs, offline)
```

## How the two engines work together

The platform page and the FPSO twin are separate pages that behave as one application. The FPSO beside the rig is
built from the twin's own database, so it is the same vessel. Entering the FPSO flies the platform camera to the twin's
overview, the twin fades in over it at exactly the same picture (same camera, field of view and screen offset), and
the platform stops drawing. Leaving reverses this. Only one 3D view draws at a time.

## Maintenance notes

- Rig systems, components and HMIs live in `src/rig/rig.html` (`PKG`, `SUB`, `SCREENS`, `HMI_X`). New systems are framed
  and cleared of obstructions automatically; `tests/audit.mjs` measures every system's framing.
- FPSO systems, rooms and equipment come from `twin/src/data/fpso_db.json` (see `twin/README.md`).
- The showcase container positions on the FPSO deck are shared by both engines: `twin/src/embed/showcase.js`.
