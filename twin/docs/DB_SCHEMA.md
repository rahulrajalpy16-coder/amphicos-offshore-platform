# fpso_db.json schema (contract between engineering, 3D, 2D, simulation and UI)

File: deliverables/amphicos-fpso-twin/src/data/fpso_db.json  (single authoritative source)
Coordinates: metres, ship frame. X = 0 at aft perpendicular/stern, +X forward to bow (300). Y = 0 centreline, +Y port. Z = 0 keel, +Z up. Main deck at Z = 28.
All boxes are axis aligned: `box: [x0, x1, y0, y1, z0, z1]` with x0<x1 etc. Positions `pos: [x, y, z]` = centre of footprint at the FLOOR (z = underside of the object).
Sizes `size: [Lx, Wy, Hz]`. `facing` = direction the operating face / front looks: "+x" | "-x" | "+y" | "-y".
Every string id is unique across the whole file. All cross references must resolve.

```jsonc
{
  "meta": { "title", "version", "date", "disclaimer", "coordinate_system", "units", "basis_doc": "docs/ENGINEERING_BASIS.md" },
  "vessel": {
    "loa": 300, "lpp": number, "beam": 52, "depth": 28, "design_draft": number, "operating_draft": number,
    "hull_offsets": {            // simple lines for lofting AND for the "inside hull" validator
      "z_levels": [0, 2, 6, 12, 20, 28],               // keel to main deck
      "stations": [ { "x": 0, "half_breadth": [..one per z_level..], "keel_z": number }, ... ]  // half breadth 0 = no hull at that z; stations from x=0 to x=300, include transom, stern taper, parallel midbody, bow
    },
    "bulwark_height": number, "sheer": 0, "camber": number,
    "decks": [ { "id": "DK_MAIN", "name": "Main deck", "z": 28, "x_range": [a,b] }, ... ],   // hull flats (tank top, ER platforms, MSB flat), main deck, accommodation decks A..E, bridge deck, helideck, topsides module deck levels
    "bulkheads": [ { "id": "BH_FR..", "name": "...", "x": number, "kind": "transverse|longitudinal", "y": optional } ],
    "zones": [ { "id": "Z_ER", "name": "Engine room", "kind": "machinery|cargo|slop|pump_room|ballast|accommodation|topsides|turret|steering", "box": [...] } ]
  },
  "topsides": [  // context equipment, not interactive demos
    { "id": "TS_SEP1", "name": "Separation train 1", "kind": "module|pipe_rack|flare|crane|turret|helideck|lifeboat|davit|offloading_reel|laydown|riser_balcony|vent_mast|accommodation|bridge|funnel|antenna_mast",
      "box": [...], "details": { free-form hints for the 3D builder: vessels count/orientation, stack heights, boom length, etc. } }
  ],
  "rooms": [
    { "id": "R_MSB", "name": "...", "deck": "DK_..", "box": [...], "zone": "Z_..", "purpose": "...",
      "access": [ { "kind": "door|hatch|stair|ladder", "pos": [x,y,z], "to": "room id | DK_MAIN | corridor" } ],
      "fire_zone": "A60 boundary etc (UNVERIFIED representative)", "hazardous_area": "safe area / Zone 1 / Zone 2 (representative)",
      "camera": { "overview_eye": [x,y,z], "overview_target": [x,y,z] }   // a good viewing position INSIDE the room (or through its cutaway) that shows the whole installation
    } ],
  "systems": [  // exactly 15, ids S01..S15 in the brief's order
    { "id": "S01", "number": 1, "name": "DG Control Retrofit and Upgradation from Legacy / Obsolete Systems", "short": "DG Control Retrofit",
      "commercial_group": "A. MSB Room / Electrical and Control Systems", "color": "#hex",
      "summary": "1-2 sentences for non-technical visitors", "function": "engineer-level paragraph",
      "operating_principle": "...", "primary_room": "R_..", "rooms": ["R_..", ...], "components": ["C_..", ...], "primary_component": "C_..",
      "hmi": { "module": "pms|dgctrl|relay|drives|icss|paga|pabx|iptv|cctv|boiler|igg|dglocal|omd|avr|governor", "host_components": ["C_.."] },
      "arrival": { "room": "R_.. (the primary_room)", "eye": [x,y,z], "target": [x,y,z], "vfov_deg": 50,   // per-system arrival viewpoint, ship frame (added in correction cycle 1)
        "primary_components": ["C_.."],      // the system's own key items in that room that must be seen from the front on arrival
        "context_components": ["C_.."],      // optional: items that are only partly visible (reported by the validator, not required to pass)
        "note": "what the view shows and any limitation" },
      "measurements": [ { "tag": "...", "name": "...", "unit": "...", "normal": "range text", "alarm": "text", "trip": "text|null", "basis": "REPRESENTATIVE|VERIFIED <source>" } ],
      "alarms": [ { "code": "...", "text": "...", "severity": "low|high|critical", "cause": "...", "response": "educational description" } ],
      "states": [ "e.g. Stopped, Starting, Running, On load, Alarm, Shutdown" ],
      "interfaces": [ { "to": "S0x | external system name", "signal": "...", "medium": "hardwired 24 VDC | 4-20 mA | Modbus RTU | Modbus TCP | Profibus DP | IEC 61850 | fibre | SIP | ..." } ],
      "legacy": { "typical_condition": "...", "limitations": ["..."], "obsolescence_note": "..." },
      "retrofit": { "scope": ["..."], "upgraded_equipment": ["generic descriptions, no brand claims"], "functional_improvements": ["qualitative, no unsupported numbers"], "integration": ["..."], "post_upgrade_operation": "...", "typical_sequence": ["survey", "FAT", "..."] },
      "demo_scenarios": [ { "id": "...", "name": "...", "description": "...", "steps": ["educational"] } ],
      "references": [ { "text": "standard or source", "status": "VERIFIED|UNVERIFIED", "url": "optional" } ]
    } ],
  "components": [
    { "id": "C_..", "system": "S0x" (or "CTX" for context equipment), "also_systems": ["S0y"], "name": "...", "tag": "plant-style tag e.g. DG-1-LCP",
      "type": one of TYPES below, "room": "R_..", "pos": [x,y,z], "size": [Lx,Wy,Hz], "facing": "+y",
      "mounted_on": "C_.. | null", "parent_group": "e.g. MV switchboard lineup id",
      "description": "...", "inspection": { "what_to_look_at": ["..."], "legacy_vs_retrofit": "..." },
      "hmi": true|false, "display": { "count": n, "kind": "touch HMI 15in | 24in workstation pair | 7in panel | LED indicators" } | null,
      "variant": "legacy|retrofit|both", "params": { builder hints: sections, cylinders, door count, LED rows, etc. } }
  ],
  "cables": [ { "id": "K_..", "from": "C_..", "to": "C_..", "kind": "power_mv|power_lv|control|network_cu|fibre|coax|bus", "protocol": "...", "systems": ["S0x"], "route": [[x,y,z], ...] } ],  // routes follow cable trays / bulkheads, not straight through walls
  "electrical": {   // drives PMS / DG / AVR / governor / relay / drives simulation
    "nominal": { "voltage_kv": n, "frequency_hz": n },
    "generators": [ { "id": "G1", "component": "C_..", "engine_component": "C_..", "rating_kw": n, "rating_kva": n, "pf": n, "rpm": n, "poles": n, "voltage_kv": n, "droop_pct": n, "basis": "REPRESENTATIVE" } ],
    "buses": [ { "id": "BUS_A", "name": "...", "voltage_kv": n } ],
    "breakers": [ { "id": "CB_G1", "name": "...", "from": "G1|BUS_A", "to": "BUS_A|F_..", "component": "C_.. (panel)", "relay": "C_..|null" } ],
    "feeders": [ { "id": "F_..", "name": "...", "bus": "BUS_A", "load_kw": n, "pf": n, "priority": 1..5 (5 = shed first), "kind": "motor|transformer|vfd|lighting|hotel|process", "drive_component": "C_..|null" } ],
    "pms_settings": { "start_standby_load_pct": n, "start_delay_s": n, "stop_load_pct": n, "stop_delay_s": n, "load_shed_stages": [ { "stage": 1, "trigger": "...", "sheds_priority": 5 } ], "blackout_restart": "...", "basis": "REPRESENTATIVE" },
    "relay_settings": [ { "relay": "C_..", "protects": "G1|F_..|TR_..", "functions": [ { "ansi": "50/51", "name": "Phase overcurrent", "pickup": "...", "curve_or_delay": "...", "basis": "REPRESENTATIVE educational" } ] } ],
    "avr": { "setpoint_kv": n, "reactive_droop_pct": n, "limits": "..." }, "governor": { "mode_options": ["droop","isochronous load sharing"], "speed_setpoint_rpm": n, "droop_pct": n }
  },
  "assumptions": [ { "id": "A01", "text": "...", "basis": "...", "affects": ["S0x"|"R_.."] } ],
  "deviations_from_reference": [ { "id": "D01", "reference": "system_locations.json / GLB / GA PDF", "issue": "...", "decision": "..." } ]
}
```

TYPES (the 3D builder implements one procedural model per type; use params for variation):
diesel_generator_set, alternator, engine_local_panel, oil_mist_detector_head, oil_mist_detector_unit, avr_unit, governor_actuator, speed_controller_cabinet,
mv_switchboard_panel, lv_switchboard_panel, protection_relay_ied, generator_control_panel, pms_cabinet, synchroniser_panel,
vfd_cabinet, mcc_lineup, pump_motor, transformer, ups_cabinet, battery_rack,
operator_console, workstation_desk, large_display_wall, control_cabinet, marshalling_cabinet, safety_controller_cabinet, field_junction_box,
telecom_rack_19in, paga_amplifier_rack, paga_access_panel, loudspeaker_horn, loudspeaker_ceiling, alarm_beacon, pabx_rack, telephone_industrial, telephone_desk,
iptv_headend_rack, tv_display, satellite_antenna_dome, cctv_camera_fixed, cctv_camera_ptz, nvr_rack, cctv_monitor_desk,
marine_boiler, boiler_burner_unit, boiler_control_panel, flame_scanner, drum_level_transmitter,
igg_generator_unit, igg_scrubber_tower, igg_blower, igg_control_panel, o2_analyser_cabinet, deck_water_seal, igg_deck_valve,
field_transmitter, cable_tray (context), ladder_stair (context), generic_cabinet

Arrival viewpoint rules (`systems[].arrival`, checked by `tools/validate_db.mjs`, which reports the per-system numbers):
- The app flies to `arrival` when a system is selected; `rooms[].camera` remains the room overview and the fallback.
- Eye inside the room box with a 0.3 m wall margin, at least 0.3 m from every component box and 0.25 m from every room fitting. Height band: arrivals are panel-facing views, not room overviews, so in rooms 8 m or more high the eye may be anywhere from 2.0 m above the floor (no platform or walkway levels are defined in the database for these rooms) up to 0.3 m below the deckhead; in other rooms 0.3 to 0.8 m below the deckhead (1.0 m in open areas). The deckhead band of `rooms[].camera` is unchanged. Target at least 0.2 m inside the room box (the app clamps the orbit target to that box).
- Every primary component: in the arrival room and belonging to the system (`system` equals the system id, or the system id is in `also_systems`, for example the GCPs for S02); operating face toward the eye (at most 75 deg from the face normal; 75 to 85 deg only when the note contains `GRAZING ACCEPTED: <reason>`, used only where no viewpoint works; above 85 deg always an error); sight lines from the eye to the box centre and to the front-face centre not blocked by another component box or a room fitting (the component's host and the items mounted on it are part of the same assembly); all 8 box corners inside the central 80 % of a 1.05 aspect frame at 70 deg vertical FOV (the free area between the side panels, with the FOV widened as in `src/camera/director.js`).
- A mounted item whose front lies inside its host (for example a speed controller behind a glazed LCP door, or an actuator inside the engine envelope box) is checked at the host surface in front of it.
- Room fittings (luminaires, trays, ducts, crane rails, girder, pipes, vent trunks, stairs) come from a port of `src/scene/rooms.js` inside the validator; if `rooms.js` changes, the port must be updated. Parts of equipment models that extend beyond their database box (for example exhaust uptakes and service piping) are not in the box model.
- An arrival is an installation view, not a panel close-up. Coverage check: the validator counts the system's own components in the room (`systems[].components` located there) whose box centre is inside the safe frame with an unblocked centre sight line, for the arrival and for `rooms[].camera` of the same room (for the room camera the sight line starts 1.0 m from the eye, because some database room-camera eyes sit inside or against a fitting and are moved by the app at run time). It warns when the arrival count is lower than the room-camera count, unless the note contains `NARROWER VIEW ACCEPTED: <reason>`, used only for a genuine geometric limit. The per-system table is printed on every run.
