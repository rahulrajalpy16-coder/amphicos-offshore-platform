# Amphicos FPSO Digital Twin: Engineering Basis

Database: `src/data/fpso_db.json` version 1.0.0 (2026-10-30). Validator: `node tools/validate_db.mjs`.

## 0. Status statement (read first)

- This is a **representative, educational arrangement** of a converted VLCC style, internal-turret FPSO built for a demonstration platform.
- **Nothing in this database or document is engineering-validated, class-approved or OEM-specific.** No stability, structural, hazardous area, fire integrity, escape, helideck, flare radiation, electrical load flow, short circuit or protection coordination study has been performed.
- Ratings, settings, dimensions, thresholds and timings are labelled REPRESENTATIVE or UNVERIFIED. They must not be used as vessel settings, for design, for operation or for safety decisions.
- Equipment is described generically. No brand, model, part number, certification or OEM compatibility is claimed or implied.
- The only regulatory facts stated as VERIFIED are those read first-hand in this task and listed in section 9. Their applicability to any specific FPSO depends on flag, class and coastal state and is UNVERIFIED.
- Integration with any existing vessel system (PMS, ICSS, DP or other) would in practice be carried out with, or by, the relevant system manufacturer; this demonstration does not represent such an integration.

Tags used: **VERIFIED** (source read in this task, cited), **USER-SUPPLIED** (from the supplied reference package), **UNVERIFIED** (engineering judgement or general knowledge), **REPRESENTATIVE** (a plausible educational value, UNVERIFIED by definition).

## 1. Inputs reviewed

| Input | What was taken | Tag |
|---|---|---|
| `inputs/reference_package/README_Model_Notes.txt` | 300 m LOA, 52 m beam, 28 m moulded depth; coordinate system X stern to bow, Y port positive, Z keel up, metres; conceptual status | USER-SUPPLIED |
| `inputs/reference_package/FPSO_Concept_300m.glb` (88 nodes, listed from the glTF JSON chunk) | Topsides module names, order and boxes; pipe rack; cranes; cargo tank naming CT-01 to CT-06 | USER-SUPPLIED (geometry critiqued, section 2) |
| `inputs/ga-1.png` (render of `FPSO_General_Arrangement_Concept_A3.pdf`; the PDF and `FPSO_3D_Preview.png` were not opened separately) | Plan and profile arrangement, flare aft at port, turret at bow, 6 cargo tanks | USER-SUPPLIED |
| `inputs/systems_package/system_locations.json`, `FPSO_Systems_Interactive_Concept.glb` (138 nodes), `inputs/sysarr-1.png` (render of the systems arrangement PDF; PDF not opened separately) | 5 room boxes, 15 system markers, 3 DG sets | USER-SUPPLIED (critiqued, section 2) |
| `briefs/DB_SCHEMA.md` | Mandatory database schema; followed exactly, fields only added | Task brief |
| Supervisor critique, TASK.md section 2 | Seven findings; each confirmed (D12) | Task brief |

## 2. Deviations from the supplied references

Every deviation is also in `deviations_from_reference` in the database.

| ID | Reference | Issue found | Decision |
|---|---|---|---|
| D01 | Reference GLB (FPSO_Concept_300m.glb) / README_Model_Notes.txt | Hull mesh FPSO_HULL extends to z 27 while the README states 28 m moulded depth. | Depth 28 m kept per README and brief; main deck at z 28. |
| D02 | Reference GLB / GA PDF | Flare tower at x 56.5 to 63.5 (port), about 7 m forward of the aft accommodation front (x 49.5): worst-case location for radiation on the accommodation and lifeboats. | Flare moved to the forecastle (x 282 to 292, centreline), about 230 m from the accommodation. Basis: maximum separation. With bow to weather the forward flare is upwind of the topsides and accommodation, so the separation reduces but does not remove radiation and dispersion exposure; the flare base is about 9 m from the turret edge (representative). Radiation and dispersion studies decide the real location (UNVERIFIED). |
| D03 | Systems GLB / system_locations.json | ENGINE_ROOM box x 33.5 to 70.5 and MSB_ROOM x 36 to 60 overlap cargo tank CT-01 (x 53 to 81 in the reference GLB). BOILER_IGG_CONTROL_ZONE x 72.5 to 91.5 sits inside the cargo tank block. Machinery inside cargo tanks is not credible. | Engine room x 12 to 50, pump room x 50 to 58, cofferdam x 58 to 60, slop tanks x 60 to 72, cargo tanks CT-01 to CT-06 from x 72 to 250. All machinery and electrical rooms inside the engine room envelope. |
| D04 | system_locations.json / systems arrangement PDF | All 15 systems forced into 5 boxes; the commercial grouping is used as a physical room grouping. | Systems distributed over 24 rooms and open areas according to function (switchboard rooms, ECR, CCR, LER, telecom rooms, boiler room, IG room, generator flat, deck areas), with also_systems for shared equipment. |
| D05 | system_locations.json | Generator-mounted items (OMD sensors, AVR control, governor control) placed as free-standing panels away from the DGs (x 49 to 61, z 15 to 19) while the DGs are at z 10. | OMD heads on crankcase doors, OMD control unit beside each engine, governor actuator on the fuel rack, speed controller in the LCP, AVR beside the alternator terminal box (mounted_on). |
| D06 | Reference GLB (EXTERNAL_BOW_TURRET x 277 to 299) | The 22 m turret box lies inside the narrow bow (hull half breadth about 3 to 15 m there) yet is called external; an external turret would extend beyond LOA 300. | Internal turret, 16 m diameter, centred at x 265.5 in the full-breadth forward body, with turret space x 254 to 277 between forward cofferdam and collision bulkhead. |
| D07 | system_locations.json (MSB_ROOM) | MV relays and the LV MSB are not distinguished; MV relays shown as one free-standing cubicle. | Separate 6.6 kV HV switchboard room (11-panel lineup with relays on panel doors) and 440 V LV MSB room with two transformers. |
| D08 | system_locations.json / systems GLB | Field devices of PAGA, CCTV, ICSS, PABX and IPTV absent; ICSS, PAGA, PABX, IPTV, CCTV each a single rack. | Loudspeakers, beacons, cameras, telephones, displays, domes, junction boxes and transmitters distributed to the relevant areas and cabled to their racks. |
| D09 | Reference GLB (HELIDECK x -8 to 28, z 59.4) | Helideck cantilevered 8 m beyond the transom over a wheelhouse at z 51 to 59; bridge and accommodation heights inconsistent with 3 m deck heights. | Accommodation x 22 to 50 with 6 tiers to z 46, wheelhouse z 46 to 50 at the forward part, helideck x 20 to 40 at z 52.5 on the accommodation roof, funnel aft at x 8 to 16. |
| D10 | Reference GLB (MAIN_PROCESS_DECK z 27 to 29.4) | Process deck slab at z 27 to 29.4 straddles the main deck level. | Main deck at z 28; process modules retained at the reference boxes on stools from z 30. |
| D11 | Reference GLB (cargo tanks z 3.5 to 20.5, P/S only) | Cargo tanks stop at z 20.5 (7.5 m below deck) with no wing or double bottom definition. | Cargo zones from the double bottom top z 2.5 to the main deck, centreline bulkhead, double bottom ballast below. Wing tank subdivision left as a 3D detail. |
| D12 | Supervisor critique (TASK.md section 2) | All seven critique points checked against the GLB node bounds and JSON. | Confirmed: D01 (27 vs 28 m), D02 (flare), D03 (ER and boiler/IGG zone overlap CT-01), D04 (5 boxes), D05 (generator-mounted items free-standing), D07 (MV relays vs LV MSB), D08 (field devices missing). Additional findings D06, D09 to D11. |

Retained from the references: coordinate system, principal dimensions, topsides module names, order and boxes, pipe rack, crane positions, aft accommodation concept, cargo tank naming, three DG sets.

## 3. Coordinate system and data conventions

- **box**: [x0, x1, y0, y1, z0, z1] axis aligned
- **pos**: centre of footprint at the underside of the object
- **size**: [Lx, Wy, Hz] in ship axes, not rotated by facing
- **facing**: direction the operating face looks
- **mounted_on**: host component; mounted items may overlap their host and are excluded from clearance checks
- **system_CTX**: context equipment, not one of the 15 systems; also_systems links it to the systems it supports
- Coordinates: metres, ship frame: X = 0 at stern (transom), +X forward to bow (300); Y = 0 centreline, +Y port; Z = 0 keel, +Z up; main deck z = 28.
- Every id is unique across the file; every cross reference resolves (checked by the validator).
- `system: "CTX"` marks context equipment (switchgear, transformers, engines, pumps, UPS) that supports the 15 systems; `also_systems` links shared equipment, for example each DG engine is linked to S01, S12, S13 and S15, and each alternator to S01 and S14.
- Additions to the schema (all optional for consumers): `vessel.ap_x`, `fp_x`, hull station `note`; zone kinds `cofferdam`, `forepeak`, `open_deck`; topsides kind `deck_area` (open deck areas that host deck equipment); `meta.conventions`; `system.bms` (S10 timings); feeder fields `motor_component`, `starter_component`, `panel_component`, `running_default`, `duty`, `heavy_consumer`, `essential`, `to_bus`, `rating_kva`, pump duty fields; breaker `normally`, `kind`, `shed_by_pms`; `electrical.load_cases`, `max_normal_load_kw`, `synchroniser`, `emergency_generator`, `topsides_power`; generator links to its GCP, LCP, AVR, speed controller, actuator, OMD unit and relay.
- For transformer feeders (`to_bus` set) `load_kw` is the transformer capacity (2500 kVA x 0.85); the actual load is the sum of the feeders on the downstream bus. Load totals therefore exclude transformer feeders.

## 4. Vessel arrangement rationale

### 4.1 Hull form (UNVERIFIED, representative lines)

Principal dimensions LOA 300 m, beam 52 m, depth 28 m (USER-SUPPLIED). Lpp 288 m (AP x 9, FP x 297), design draft 22.0 m, operating draft 17.0 m, sheer 0, camber 0, bulwark 1.0 m (all UNVERIFIED representative). The hull offsets give half breadths at z = 0, 2, 6, 12, 20, 28 m:

| Station x (m) | Half breadths at z 0/2/6/12/20/28 | Keel z | Note |
|---|---|---|---|
| 0 | 0 / 0 / 0 / 0 / 14 / 18 | 14 | Transom (immersed transom bottom at z 14) |
| 4 | 0 / 0 / 0 / 6 / 18 / 21 | 10 | Stern overhang |
| 8 | 1 / 1.5 / 6 / 14 / 22 / 24 | 0 | Stern frame / skeg |
| 15 | 3 / 8 / 14 / 20 / 24.5 / 25.5 | 0 | Aft body, engine room aft end |
| 25 | 10 / 17 / 22 / 24.5 / 25.8 / 26 | 0 | Aft body |
| 40 | 18 / 23 / 25.5 / 26 / 26 / 26 | 0 | Aft shoulder |
| 55 | 23.5 / 25.9 / 26 / 26 / 26 / 26 | 0 | Parallel midbody start |
| 150 | 23.5 / 25.9 / 26 / 26 / 26 / 26 | 0 | Midship |
| 240 | 23.5 / 25.9 / 26 / 26 / 26 / 26 | 0 | Parallel midbody end |
| 260 | 21 / 24.5 / 25.8 / 26 / 26 / 26 | 0 | Forward shoulder |
| 275 | 14 / 19 / 23 / 25 / 25.8 / 26 | 0 | Fore body |
| 285 | 8 / 12 / 17 / 21.5 / 24.5 / 25.5 | 0 | Fore body, forepeak |
| 292 | 3 / 6 / 11 / 16 / 21 / 23.5 | 0 | Bow with flare |
| 297 | 0.5 / 2 / 5 / 9 / 15 / 19.5 | 0 | Bow, bulb root |
| 300 | 0 / 0 / 0.3 / 1.5 / 5 / 10 | 6 | Stem at main deck |

The form has an immersed transom (bottom at z 14), stern overhang and skeg, a parallel midbody from x 55 to x 240 with a 2.5 m bilge radius, a forward shoulder, bow flare and a small bulb root. It is a visualisation and containment envelope, not a lines plan.

### 4.2 Subdivision (aft to forward)

| Zone | Name | Kind | Extent |
|---|---|---|---|
| Z_AFTPEAK | Aft peak and steering gear (context) | steering | x 0 to 12, y -24 to 24, z 10 to 28 |
| Z_ER | Engine room (machinery space) | machinery | x 12 to 50, y -26 to 26, z 2.5 to 28 |
| Z_ER_CASING | Engine casing trunk (exhaust uptakes from DGs, boilers and IGG to funnel) | machinery | x 8 to 21.5, y -6 to 6, z 9.5 to 28 |
| Z_PUMP | Cargo pump room | pump_room | x 50 to 58, y -26 to 26, z 2.5 to 28 |
| Z_COF_AFT | Aft cofferdam | cofferdam | x 58 to 60, y -26 to 26, z 2.5 to 28 |
| Z_SLOP | Slop tanks P and S | slop | x 60 to 72, y -26 to 26, z 2.5 to 28 |
| Z_CT1 | Cargo tank CT-01 (P and S, centreline bulkhead) | cargo | x 72 to 102, y -26 to 26, z 2.5 to 28 |
| Z_CT2 | Cargo tank CT-02 (P and S, centreline bulkhead) | cargo | x 102 to 132, y -26 to 26, z 2.5 to 28 |
| Z_CT3 | Cargo tank CT-03 (P and S, centreline bulkhead) | cargo | x 132 to 162, y -26 to 26, z 2.5 to 28 |
| Z_CT4 | Cargo tank CT-04 (P and S, centreline bulkhead) | cargo | x 162 to 192, y -26 to 26, z 2.5 to 28 |
| Z_CT5 | Cargo tank CT-05 (P and S, centreline bulkhead) | cargo | x 192 to 222, y -26 to 26, z 2.5 to 28 |
| Z_CT6 | Cargo tank CT-06 (P and S, centreline bulkhead) | cargo | x 222 to 250, y -26 to 26, z 2.5 to 28 |
| Z_DB | Double bottom ballast tanks (cargo length) | ballast | x 60 to 250, y -26 to 26, z 0 to 2.5 |
| Z_COF_FWD | Forward cofferdam | cofferdam | x 250 to 254, y -26 to 26, z 2.5 to 28 |
| Z_TURRET | Internal turret space and moonpool | turret | x 254 to 277, y -24 to 24, z 0 to 28 |
| Z_FPK | Fore peak (ballast) and bosun store | forepeak | x 277 to 300, y -24 to 24, z 0 to 28 |
| Z_ACCOM | Aft accommodation, bridge and mast | accommodation | x 22 to 50, y -18 to 18, z 28 to 62 |
| Z_AFTDECK | Aft main deck: offloading station, funnel, emergency generator house | open_deck | x 0 to 22, y -24 to 24, z 28 to 46 |
| Z_CARGODECK_AFT | Main deck, aft end of cargo area (IG deck seal and valves) | open_deck | x 58 to 66, y -26 to 26, z 28 to 36 |
| Z_TOPSIDES | Topsides process area | topsides | x 66 to 250, y -26 to 26, z 28 to 56 |
| Z_TURRET_DECK | Turret deck and swivel gantry | turret | x 254 to 277, y -14 to 14, z 28 to 52 |
| Z_FOREDECK | Forecastle deck and flare tower | open_deck | x 277 to 300, y -24 to 24, z 28 to 120 |

Rationale: machinery aft under the accommodation (typical of converted VLCC FPSOs, UNVERIFIED); pump room directly forward of the engine room so that cargo and ballast pumps are driven from motors in the gas-safe engine room through gas-tight bulkhead shaft seals; a cofferdam and slop tanks separate the pump room from the cargo tanks; no machinery or electrical room overlaps a cargo or slop zone (validator check). The internal turret sits in the full-breadth forward body between a forward cofferdam and the collision bulkhead.

### 4.3 Decks and flats

| Deck | Name | z (m) | x range |
|---|---|---|---|
| DK_TT | Tank top (inner bottom), engine room and pump room | 2.5 | 12 to 58 |
| DK_ER2 | Engine room second deck (generator flat) | 9.5 | 16 to 50 |
| DK_ER_UP | Engine room upper platform (ECR, switchboard, drives, boiler and IG rooms) | 18.0 | 12 to 50 |
| DK_MAIN | Main deck (upper deck) | 28.0 | 0 to 300 |
| DK_PROC | Process module support level (module stools) | 30.0 | 66.5 to 250 |
| DK_ESB_UP | Emergency generator house upper level | 31.5 | 9 to 20 |
| DK_A | Accommodation A deck | 31.0 | 22 to 50 |
| DK_B | Accommodation B deck (lifeboat embarkation) | 34.0 | 22 to 50 |
| DK_C | Accommodation C deck | 37.0 | 22 to 50 |
| DK_D | Accommodation D deck | 40.0 | 22 to 50 |
| DK_E | Accommodation E deck | 43.0 | 22 to 50 |
| DK_NAV | Navigation bridge deck | 46.0 | 38 to 50 |
| DK_WHTOP | Wheelhouse top (antenna platform) | 50.0 | 38 to 50 |
| DK_HELI | Helideck | 52.5 | 20 to 40 |

Engine room: tank top on a 2.5 m double bottom, generator flat at z 9.5 (8.5 m clear for the DGs and overhead handling), upper platform at z 18.0 carrying the enclosed control and electrical rooms (4.5 m high including cable space) and the boiler and IG rooms (9.5 m high). Accommodation: six tiers of 3.0 m from the main deck to z 46, wheelhouse z 46 to 50, antenna platform above, helideck at z 52.5 (UNVERIFIED representative).

### 4.4 Topsides and external structures

- Process modules, pipe rack and cranes: reference boxes retained (USER-SUPPLIED), modules on stools from z 30.
- **Flare**: moved from x 56.5 to 63.5 (immediately forward of the accommodation in the references) to a lattice tower on the forecastle at x 282 to 292, tip z 120, giving about 230 m horizontal separation from the accommodation front. Basis: maximise separation of the radiation source from the accommodation, lifeboats and helideck. With the vessel bow to weather the forward flare is upwind of the unit, so radiation and any unignited or vented gas are carried aft over the topsides and towards the accommodation and helideck. The large separation reduces but does not remove this; the flare base is also close to the turret (about 9 m from the turret edge, representative). Radiation and dispersion studies are required to set the real location, height and tip arrangement (UNVERIFIED).
- **Turret**: internal turret, 16 m diameter, centred at x 265.5, with turret deck, swivel stack and gantry (D06).
- **Helideck** on the accommodation roof (x 20 to 40) with the funnel aft at x 8 to 16; with the vessel bow to weather only the funnel exhaust is carried aft, away from the helideck. The aft helideck is downwind of the process area, flare and vents, so turbulence and hot or toxic gas exposure, as well as obstacle sectors, need a helideck environmental study (UNVERIFIED).
- **Stern offloading station** (hose reel and hawser winch) for tandem offloading; **emergency generator house** on the aft main deck (port), separate from accommodation and machinery fire zones; **vent mast** at the aft end of the cargo deck; four lifeboats on davits at B deck.

### 4.5 Rooms and open areas

| Room | Name | Deck | Box | Hazardous area (representative) | Access |
|---|---|---|---|---|---|
| R_ER_LOWER | Engine room lower level (tank top) | DK_TT | x 26 to 49.5, y -17 to 17, z 2.5 to 9.5 | Safe area (machinery space), representative | stair to R_ER_GEN; ladder to R_ER_GEN |
| R_ER_GEN | Engine room generator flat | DK_ER2 | x 24 to 49.5, y -18 to 18, z 9.5 to 18 | Safe area (machinery space), representative | stair to corridor; stair to R_ER_LOWER |
| R_ECR | Engine control room (ECR) | DK_ER_UP | x 22 to 32, y -16 to -4, z 18 to 22.5 | Safe area, air conditioned | door to corridor |
| R_MSB | LV main switchboard room (440 V MSB) | DK_ER_UP | x 33 to 49.5, y -16 to -4, z 18 to 22.5 | Safe area, air conditioned | door to corridor; door to corridor |
| R_HVSWBD | HV switchboard room (6.6 kV main switchboard) | DK_ER_UP | x 22 to 37.5, y 4 to 17, z 18 to 22.5 | Safe area, air conditioned | door to corridor |
| R_DRIVES | Drives and MCC room | DK_ER_UP | x 38 to 49.5, y 4 to 17, z 18 to 22.5 | Safe area, air conditioned | door to corridor |
| R_BOILER | Auxiliary boiler room | DK_ER_UP | x 13 to 21.5, y 6 to 18, z 18 to 27.5 | Safe area (machinery space), representative | door to corridor |
| R_IGG | Inert gas generator room | DK_ER_UP | x 13 to 21.5, y -18 to -6, z 18 to 27.5 | Safe area (machinery space), representative | door to R_ER_GEN |
| R_PUMP | Cargo pump room | DK_TT | x 50.5 to 57.5, y -16 to 16, z 2.5 to 27.5 | Zone 1 (representative, hazardous area plan required) | ladder to DK_MAIN |
| R_MESS | Mess room | DK_MAIN | x 24 to 36, y 2 to 17, z 28 to 31 | Safe area | door to corridor |
| R_REC | Recreation room | DK_MAIN | x 24 to 36, y -17 to -2, z 28 to 31 | Safe area | door to corridor |
| R_TER | Telecom equipment room A | DK_A | x 24 to 35, y 1.5 to 16, z 31 to 34 | Safe area, air conditioned | door to corridor |
| R_UPS | UPS and battery room | DK_A | x 24 to 35, y -16 to -6, z 31 to 34 | Safe area, battery ventilation required | door to corridor |
| R_CCR | Central control room (CCR) | DK_A | x 36 to 49.5, y -16 to -1.5, z 31 to 34 | Safe area, air conditioned | door to corridor |
| R_LER | Local equipment room (ICSS instrument equipment room) | DK_A | x 36 to 49.5, y 1.5 to 16, z 31 to 34 | Safe area, air conditioned | door to corridor |
| R_CABIN | Representative officer cabin (C deck) | DK_C | x 24 to 28.5, y 12 to 17, z 37 to 40 | Safe area | door to corridor |
| R_BRIDGE | Navigation bridge (wheelhouse) | DK_NAV | x 40 to 50, y -16 to 16, z 46 to 50 | Safe area | stair to corridor |
| R_MAST | Wheelhouse top antenna platform | DK_WHTOP | x 41 to 50, y -6 to 6, z 50 to 62 | Safe area | ladder to R_BRIDGE |
| R_EMG | Emergency generator and emergency switchboard room | DK_MAIN | x 9.5 to 19.5, y 8.5 to 20.5, z 28 to 31.5 | Safe area | door to DK_MAIN |
| R_TELB | Telecom equipment room B | DK_ESB_UP | x 9.5 to 19.5, y 8.5 to 20.5, z 31.5 to 35 | Safe area | stair to R_EMG |
| R_OFFLOAD | Stern offloading station | DK_MAIN | x 1 to 7.5, y -13 to 13, z 28 to 34 | Zone 2 during offloading (representative) | door to DK_MAIN |
| R_IG_DECK | Aft cargo deck (IG deck water seal and valves) | DK_MAIN | x 58.5 to 66, y -20 to 20, z 28 to 34 | Zone 1 / Zone 2 (representative) | door to DK_MAIN |
| R_PROC_DECK | Topsides process deck (open area) | DK_MAIN | x 66.5 to 250, y -24 to 24, z 28 to 54 | Zone 1 / Zone 2 (representative, hazardous area plan required) | door to DK_MAIN |
| R_TURRET | Turret deck and swivel gantry | DK_MAIN | x 254.5 to 277, y -12.5 to 12.5, z 28 to 50 | Zone 1 / Zone 2 (representative) | stair to DK_MAIN |

Room sizing logic (UNVERIFIED): HV switchboard room 15.5 x 13 m for an 11-panel 6.6 kV lineup (9.6 m) plus synchroniser panel, with 1.0 m rear aisle for cable termination, a front operating aisle of about 9 m and generator control and PMS cabinets on the opposite wall. LV MSB room 16.5 x 12 m for a 9-section 440 V switchboard with front and 1.2 m rear access and two cast resin transformers. Drives room for two MV VFDs (4.8 m each) and an LV VFD and MCC row. ECR with PMS and ICSS operator stations and machinery repeaters. CCR in the accommodation (control station) next to the LER (ICSS cabinets), telecom room A and the UPS and battery room. Every floor or wall standing cabinet, panel or console has at least 0.8 m free space in front of its operating face inside the room (validator check); camera viewpoints are inside each room at a high corner.

## 5. Electrical basis (REPRESENTATIVE)

- **Generation**: three medium-speed diesel generators, each 3000 kWe, 3750 kVA, pf 0.8, 6.6 kV, 60 Hz, 720 rpm (10 poles), droop 4 %. Installed 9000 kW.
- **Distribution**: 6.6 kV main switchboard with bus sections MV_A (G1, G2, TR1, cargo pump 1 VFD) and MV_B (G3, TR2, cargo pump 2 VFD) and a bus tie normally closed; two 6.6/0.44 kV 2500 kVA transformers to the 440 V MSB buses LV_1 and LV_2 with an LV bus tie normally open. LV insulated with insulation monitoring (UNVERIFIED representative).
- **MV earthing and earth fault grading**: high resistance earthed: each generator neutral via a neutral earthing resistor (NER) rated 20 A, 10 s (REPRESENTATIVE), so a single earth fault draws about 40 to 60 A with two or three sets online; feeder and bus tie earth fault protection uses core balance CTs 50/1 A (REPRESENTATIVE); earth fault pickups are illustrative and time graded from load to source (feeders 0.3 s, bus tie 0.6 s, generators 1.0 s) so the device nearest the fault trips first; no grading study performed.
- **Topsides gas turbine generators**: shown as context in the power generation module only. Many FPSOs supply the process from topsides GTGs and keep hull DGs for marine, utility and essential loads; the hull-to-topsides interconnection is vessel specific. Including GTGs in the PMS demonstration would imply an interconnection philosophy that cannot be justified here, so the PMS demonstration covers the three hull DGs, which is also the scope of systems 1, 2, 12 to 15.
- **Emergency generator and switchboard**: context only (400 kW representative).

| Load case | Running feeders | Total kW | Sets expected online |
|---|---|---|---|
| Production, no offloading (normal) | 14 | 2585 | 2 |
| Production with tandem offloading (cargo pumps, ballast pump 1, IGG blower 1) | 18 | 5345 | 3 |
| Maximum normal load (offloading plus both ballast pumps) | 19 | 5595 | 3 |

Maximum normal load 5595 kW against installed 9000 kW; N-1 capacity 6000 kW also covers the maximum normal load.

Feeders and shed priorities (1 = never shed, 5 = shed first):

| Feeder | Name | Bus | kW | Priority | Kind | Running by default |
|---|---|---|---|---|---|---|
| F_TR1 | Transformer TR1 6.6/0.44 kV 2500 kVA to LV bus 1 | MV_A | 2125 | 1 | transformer | True |
| F_CP1 | Cargo offloading pump 1 (6.6 kV VFD) | MV_A | 1200 | 4 | vfd | False |
| F_TR2 | Transformer TR2 6.6/0.44 kV 2500 kVA to LV bus 2 | MV_B | 2125 | 1 | transformer | True |
| F_CP2 | Cargo offloading pump 2 (6.6 kV VFD) | MV_B | 1200 | 4 | vfd | False |
| F_SWC1 | Sea water cooling pump 1 (VFD) | LV_1 | 90 | 2 | vfd | True |
| F_LTFW1 | LT fresh water cooling pump 1 (DOL, MCC) | LV_1 | 55 | 2 | motor | True |
| F_BP1 | Ballast pump 1 (VFD) | LV_1 | 250 | 3 | vfd | False |
| F_IGG_BLW1 | IG blower 1 (MCC starter) | LV_1 | 110 | 3 | motor | False |
| F_BLR_AUX | Boiler auxiliaries (forced draft fans, feed pumps) | LV_1 | 120 | 3 | motor | True |
| F_ER_MCC1 | Engine room MCC section 1 (purifiers, compressors, fans) | LV_1 | 380 | 2 | motor | True |
| F_HVAC1 | Accommodation HVAC 1 | LV_1 | 260 | 5 | hotel | True |
| F_GALLEY | Galley and laundry | LV_1 | 180 | 5 | hotel | True |
| F_LIGHT1 | Normal lighting and small power 1 | LV_1 | 110 | 3 | lighting | True |
| F_ESB_FEED | Emergency switchboard normal supply (emergency lighting, PAGA B, nav and radio) | LV_1 | 150 | 1 | lighting | True |
| F_SWC2 | Sea water cooling pump 2 (VFD, standby) | LV_2 | 90 | 2 | vfd | False |
| F_LTFW2 | LT fresh water cooling pump 2 (DOL, standby) | LV_2 | 55 | 2 | motor | False |
| F_BP2 | Ballast pump 2 (VFD) | LV_2 | 250 | 3 | vfd | False |
| F_IGG_BLW2 | IG blower 2 (standby) | LV_2 | 110 | 3 | motor | False |
| F_ER_MCC2 | Engine room MCC section 2 | LV_2 | 300 | 2 | motor | True |
| F_HVAC2 | Accommodation HVAC 2 | LV_2 | 240 | 5 | hotel | True |
| F_UPS_ICSS | ICSS, telecom and PAGA A UPS input | LV_2 | 80 | 1 | process | True |
| F_LIGHT2 | Normal lighting and small power 2 | LV_2 | 100 | 3 | lighting | True |
| F_DECK | Deck machinery and workshop | LV_2 | 120 | 4 | motor | True |
| F_TOPS_UTIL | Hull-to-topsides utility supply | LV_2 | 400 | 4 | process | True |

PMS settings (REPRESENTATIVE): start standby at 85 % for 10 s; stop at 35 % for 180 s if the remaining sets stay below 70 %; minimum 2 sets; heavy consumer reserve 1300 kW; standby order G3, G1, G2. Load shedding:
- Stage 1: online load > 100 % of online capacity for delay_s (2 s), or frequency < 58.8 Hz for 1 s (isochronous mode only), or generator breaker trip with remaining capacity below load (immediate, fast_delay_s); sheds priority 5; delay_s 2, fast_delay_s 0.5.
- Stage 2: still overloaded delay_s (3 s) after stage 1, or frequency < 58.2 Hz (isochronous mode only); sheds priority 4; delay_s 3.
- Stage 3: still overloaded delay_s (3 s) after stage 2, or frequency < 57.6 Hz (isochronous mode only); sheds priority 3; delay_s 3.
- Governor mode used by the PMS: isochronous load sharing. The PMS runs the DG governors in isochronous load sharing, so normal frequency stays at 60.0 Hz whatever the load and an underfrequency below 58.8 Hz indicates a real power deficit. With 4 % droop (back-up mode) frequency would fall to 58.8 Hz at about 50 % load, so the frequency triggers are disabled in droop mode and only the power and generator-trip triggers apply (REPRESENTATIVE).
- Blackout restart: Dead bus detected (all bus voltages < 30 % for 1 s): heavy consumers blocked and LV feeders of priority 3 to 5 opened; all available standby sets start; the first set at rated voltage and frequency closes onto the dead bus (only one set permitted to close on a dead bus); further sets synchronise; feeders reconnect in priority order 1, 2, 3 in groups 5 s apart; priority 4 and 5 need operator reset. Target restoration time about 45 s (REPRESENTATIVE, not a rule value).

Protection (REPRESENTATIVE educational values, never vessel settings). ANSI device numbers per IEEE C37.2 as summarised in the source in section 9:

- **C_IED_G1** protects G1 (CT 400/1 A): 87G Generator differential Id > 0.10 x In, slope 20 %, instantaneous; 51V Voltage restrained overcurrent 1.2 x In (394 A), IEC standard inverse, TMS 0.25; 50 High-set overcurrent 3.0 x In, definite time 0.25 s; 32 Reverse power -8 % Pn (-240 kW), definite time 5 s; 40 Loss of field (offset mho) offset -0.5 Xd', diameter Xd, 0.5 s; 46 Negative sequence alarm I2 > 8 % In, trip I2 > 10 % In, I2^2 t, K = 20; 27 Undervoltage 85 % Un, 3 s; 59 Overvoltage 110 % Un / 120 % Un, 2 s / 0.2 s; 81U Underfrequency 57.0 Hz, 2 s; 81O Overfrequency 63.0 Hz, 2 s; 51N Stator earth fault (NER current, high resistance earthed system) 5 A primary (25 % of 20 A NER), definite time 1.0 s (last stage of earth fault grading); 49 Thermal overload 1.05 x In alarm, 1.15 x In trip, thermal model, tau 30 min.
- **C_IED_G2** protects G2 (CT 400/1 A): 87G Generator differential Id > 0.10 x In, slope 20 %, instantaneous; 51V Voltage restrained overcurrent 1.2 x In (394 A), IEC standard inverse, TMS 0.25; 50 High-set overcurrent 3.0 x In, definite time 0.25 s; 32 Reverse power -8 % Pn (-240 kW), definite time 5 s; 40 Loss of field (offset mho) offset -0.5 Xd', diameter Xd, 0.5 s; 46 Negative sequence alarm I2 > 8 % In, trip I2 > 10 % In, I2^2 t, K = 20; 27 Undervoltage 85 % Un, 3 s; 59 Overvoltage 110 % Un / 120 % Un, 2 s / 0.2 s; 81U Underfrequency 57.0 Hz, 2 s; 81O Overfrequency 63.0 Hz, 2 s; 51N Stator earth fault (NER current, high resistance earthed system) 5 A primary (25 % of 20 A NER), definite time 1.0 s (last stage of earth fault grading); 49 Thermal overload 1.05 x In alarm, 1.15 x In trip, thermal model, tau 30 min.
- **C_IED_G3** protects G3 (CT 400/1 A): 87G Generator differential Id > 0.10 x In, slope 20 %, instantaneous; 51V Voltage restrained overcurrent 1.2 x In (394 A), IEC standard inverse, TMS 0.25; 50 High-set overcurrent 3.0 x In, definite time 0.25 s; 32 Reverse power -8 % Pn (-240 kW), definite time 5 s; 40 Loss of field (offset mho) offset -0.5 Xd', diameter Xd, 0.5 s; 46 Negative sequence alarm I2 > 8 % In, trip I2 > 10 % In, I2^2 t, K = 20; 27 Undervoltage 85 % Un, 3 s; 59 Overvoltage 110 % Un / 120 % Un, 2 s / 0.2 s; 81U Underfrequency 57.0 Hz, 2 s; 81O Overfrequency 63.0 Hz, 2 s; 51N Stator earth fault (NER current, high resistance earthed system) 5 A primary (25 % of 20 A NER), definite time 1.0 s (last stage of earth fault grading); 49 Thermal overload 1.05 x In alarm, 1.15 x In trip, thermal model, tau 30 min.
- **C_IED_BT** protects MV_A (CT 1200/1 A): 51 Phase overcurrent 1.0 x CT (1200 A), IEC standard inverse, TMS 0.2; 51N Earth fault (core balance CT 50/1 A) 4 A primary, definite time 0.6 s (graded between feeders 0.3 s and generators 1.0 s); 25 Synchronism check dV 5 %, df 0.1 Hz, dphi 10 deg, permissive; 67 Directional overcurrent (optional) 0.8 x CT, definite time 0.4 s.
- **C_IED_TR1** protects F_TR1 (CT 300/1 A): 50 High-set overcurrent (illustrative value; needs inrush and LV through-fault study) 4400 A primary (about 20 x In_tr; above the about 3.7 kA LV bolted through-fault reflected to 6.6 kV for an assumed 6 % impedance), definite time 0.1 s; coordination with LV breakers not studied, no discrimination claimed; 51 Phase overcurrent 1.2 x In_tr (263 A), IEC very inverse, TMS 0.15; 50N/51N Earth fault (core balance CT 50/1 A) 2 A primary, definite time 0.3 s (first stage of earth fault grading); 49 Thermal (transformer winding temperature monitor input) 130 degC alarm, 150 degC trip, via PT100 temperature monitor.
- **C_IED_TR2** protects F_TR2 (CT 300/1 A): 50 High-set overcurrent (illustrative value; needs inrush and LV through-fault study) 4400 A primary (about 20 x In_tr; above the about 3.7 kA LV bolted through-fault reflected to 6.6 kV for an assumed 6 % impedance), definite time 0.1 s; coordination with LV breakers not studied, no discrimination claimed; 51 Phase overcurrent 1.2 x In_tr (263 A), IEC very inverse, TMS 0.15; 50N/51N Earth fault (core balance CT 50/1 A) 2 A primary, definite time 0.3 s (first stage of earth fault grading); 49 Thermal (transformer winding temperature monitor input) 130 degC alarm, 150 degC trip, via PT100 temperature monitor.
- **C_IED_CP1** protects F_CP1 (CT 200/1 A): 50 Instantaneous overcurrent 8 x In (980 A), definite time 0.05 s; 51 Phase overcurrent 1.1 x In (135 A), IEC standard inverse, TMS 0.1; 50N/51N Earth fault (core balance CT 50/1 A) 2 A primary, definite time 0.3 s (first stage of earth fault grading); 49 Thermal overload (drive input transformer) 1.05 x In, thermal model; 27 Bus undervoltage trip 70 % Un, 1 s.
- **C_IED_CP2** protects F_CP2 (CT 200/1 A): 50 Instantaneous overcurrent 8 x In (980 A), definite time 0.05 s; 51 Phase overcurrent 1.1 x In (135 A), IEC standard inverse, TMS 0.1; 50N/51N Earth fault (core balance CT 50/1 A) 2 A primary, definite time 0.3 s (first stage of earth fault grading); 49 Thermal overload (drive input transformer) 1.05 x In, thermal model; 27 Bus undervoltage trip 70 % Un, 1 s.

AVR: setpoint 6.6 kV, reactive droop 4 %, Over-excitation limiter 1.6 x rated field current for 10 s; under-excitation limiter per capability curve; V/Hz limiter 1.05 pu. Governor: modes droop, isochronous load sharing, setpoint 720 rpm, droop 4 %, overspeed trip 828 rpm (115 %). Synchronising window: slip 0.1 Hz, voltage 5 %, angle 10 deg. All REPRESENTATIVE.

## 6. Per-system location rationale

### S01 DG Control Retrofit and Upgradation from Legacy / Obsolete Systems

- Primary room: HV switchboard room (6.6 kV main switchboard) (`R_HVSWBD`); primary component `C_GCP1`; HMI module `dgctrl`.
- Rooms: R_ER_GEN, R_ECR, R_HVSWBD. Components: 3 own, 15 including shared.
- Rationale: Generator control panels GCP-1 to GCP-3 stand in the HV switchboard room beside the generator incomer panels they control (short CT/VT and breaker control wiring, one place for synchronising). They link to the DG local panels, AVRs and speed controllers at the engines and to the PMS. Operator access is also through the PMS station in the ECR.
- Legacy condition: Relay-based start and synchronising logic with discrete analogue load sharing modules, older original components, partly undocumented modifications.
- Retrofit scope: Replace genset controllers in GCP-1 to GCP-3; New auto-synchroniser and load sharing functions; Re-terminate interfaces to LCP, AVR, governor and breaker; Network link to PMS; Update drawings and I/O lists.

### S02 Power Management System Upgradation

- Primary room: HV switchboard room (6.6 kV main switchboard) (`R_HVSWBD`); primary component `C_PMS_CAB`; HMI module `pms`.
- Rooms: R_ECR, R_MSB, R_HVSWBD, R_CCR, R_LER. Components: 4 own, 34 including shared.
- Rationale: Redundant PMS controllers are in the HV switchboard room (data from GCPs, relays and LV MSB breakers converge there); operator stations in the ECR (machinery watch) and CCR (production control). Load shedding acts on LV MSB feeder breakers.
- Legacy condition: Hardwired relay-logic PMS or first-generation PLC with mimic panel, limited trending and no redundancy.
- Retrofit scope: New redundant PMS controllers and network; Operator stations in ECR and CCR; Interface to new genset controllers and relays; Load shedding tables and blackout recovery logic; Simulation-based testing before cut-over.

### S03 MV Relays - Testing, Calibration and Upgradation

- Primary room: HV switchboard room (6.6 kV main switchboard) (`R_HVSWBD`); primary component `C_IED_G1`; HMI module `relay`.
- Rooms: R_MSB, R_HVSWBD. Components: 9 own, 22 including shared.
- Rationale: Numerical relays are fitted on the LV compartment doors of the 6.6 kV panels they protect (8 IEDs), as is standard for metal-clad switchgear; a portable secondary injection test set represents the testing and calibration activity. Transformers and LV MSB are separate (LV MSB room) so that MV protection and LV distribution are not confused.
- Legacy condition: Rows of electromechanical or static single-function relays per panel, calibrated manually, no event recording.
- Retrofit scope: Relay survey and protection study review; Replace relays with numerical IEDs (door cut-outs and wiring adapters); Settings conversion and coordination check; Secondary injection and trip testing; Communication to PMS/SCADA.

### S04 Drives and Pump Controls

- Primary room: Drives and MCC room (`R_DRIVES`); primary component `C_VFD_CP1`; HMI module `drives`.
- Rooms: R_ER_LOWER, R_DRIVES, R_PUMP, R_CCR, R_LER. Components: 15 own, 21 including shared.
- Rationale: VFDs and the MCC are in an air-conditioned drives and MCC room on the upper platform; motors are in the engine room lower level against the forward bulkhead and drive the cargo and ballast pumps in the pump room through gas-tight shaft seals; local control stations stand at the motors; operator control is from the ICSS process console in the CCR.
- Legacy condition: Steam turbine driven cargo pumps or fixed-speed motors with throttling; DOL or star-delta starters in an old MCC; early-generation drives with discontinued spares.
- Retrofit scope: Replace or add VFDs for cargo, ballast and cooling pumps; Motor assessment for inverter duty; Control interface to ICSS and PMS; Harmonic study and filter review; Local control stations rewiring.

### S05 ICSS - Integrated Control and Safety System

- Primary room: Central control room (CCR) (`R_CCR`); primary component `C_ICSS_CON1`; HMI module `icss`.
- Rooms: R_ER_GEN, R_ECR, R_HVSWBD, R_PUMP, R_MESS, R_UPS, R_CCR, R_LER, R_IG_DECK, R_PROC_DECK, R_TURRET. Components: 48 own, 53 including shared.
- Rationale: Operator consoles and the large display wall are in the CCR; the marine operator station is in the ECR; system, safety, fire and gas, network and marshalling cabinets are in the LER next to the CCR; a remote I/O cabinet serves machinery signals; Ex junction boxes and transmitters are on the process deck, turret and in the pump room.
- Legacy condition: DCS and safety PLCs from an earlier installation generation with obsolete operator PCs and operating systems, separate F&G panel and limited spares.
- Retrofit scope: HMI migration to new operator stations; Controller and I/O migration with marshalling reuse; F&G integration onto ICSS graphics; Cause and effect verification; Phased hot cut-over planning.

### S06 PAGA - Public Address and General Alarm System

- Primary room: Telecom equipment room A (`R_TER`); primary component `C_PAGA_A`; HMI module `paga`.
- Rooms: R_ER_LOWER, R_ER_GEN, R_ECR, R_MSB, R_HVSWBD, R_BOILER, R_PUMP, R_MESS, R_REC, R_TER, R_UPS, R_CCR, R_LER, R_CABIN, R_BRIDGE, R_TELB, R_OFFLOAD, R_PROC_DECK, R_TURRET. Components: 29 own, 34 including shared.
- Rationale: PAGA A rack in telecom room A (accommodation) and PAGA B rack with its own battery cabinet in telecom room B (emergency generator house) so that the two systems are in different fire zones; loudspeaker and beacon loops A and B are interleaved in every area; access panels in CCR (desk), bridge (console) and ECR (wall).
- Legacy condition: Analogue amplifier racks with manual changeover, partial line supervision and ageing access panels.
- Retrofit scope: New PAGA controllers and amplifiers A/B; Supervised loudspeaker loops; New access panels (IP or serial); ICSS interface; Speech intelligibility checks (to be specified).

### S07 PABX System

- Primary room: Telecom equipment room A (`R_TER`); primary component `C_PABX`; HMI module `pabx`.
- Rooms: R_ER_LOWER, R_ER_GEN, R_ECR, R_MSB, R_HVSWBD, R_DRIVES, R_BOILER, R_PUMP, R_TER, R_UPS, R_CCR, R_CABIN, R_BRIDGE, R_MAST, R_OFFLOAD, R_PROC_DECK, R_TURRET. Components: 16 own, 20 including shared.
- Rationale: PABX rack in telecom room A; industrial telephones with acoustic hoods in machinery spaces, Ex telephones in the pump room, process deck and turret, desk phones in control rooms and cabins; external trunks via the VSAT link.
- Legacy condition: TDM PABX with proprietary line cards and digital system phones.
- Retrofit scope: IP-PBX server; Analogue gateways for field phones; SIP trunk to WAN; PAGA paging interface; Number plan migration.

### S08 IPTV System

- Primary room: Telecom equipment room A (`R_TER`); primary component `C_IPTV_HE`; HMI module `iptv`.
- Rooms: R_MESS, R_REC, R_TER, R_CABIN, R_MAST. Components: 7 own, 9 including shared.
- Rationale: Headend in telecom room A; satellite TV receive domes on the wheelhouse top antenna platform; displays in the mess, recreation room and cabins.
- Legacy condition: Analogue RF distribution over coax with amplifiers and splitters.
- Retrofit scope: IPTV headend; Network distribution; Displays or set-top boxes; Information channel.

### S09 CCTV System

- Primary room: Central control room (CCR) (`R_CCR`); primary component `C_CCTV_DESK`; HMI module `cctv`.
- Rooms: R_ER_GEN, R_PUMP, R_TER, R_CCR, R_OFFLOAD, R_IG_DECK, R_PROC_DECK, R_TURRET. Components: 11 own, 13 including shared.
- Rationale: NVR in telecom room A; monitor desk in the CCR (plus large display); Ex cameras on the process deck, aft cargo deck, turret gantry (covering turret and flare), stern offloading station, pump room and engine room.
- Legacy condition: Analogue cameras on coax to a video matrix and DVR.
- Retrofit scope: IP cameras with Ex enclosures where required; NVR and video management; Fibre network to deck areas; CCR client desk.

### S10 Boiler Control System Retrofits and Upgradations

- Primary room: Auxiliary boiler room (`R_BOILER`); primary component `C_BCP1`; HMI module `boiler`.
- Rooms: R_ECR, R_BOILER. Components: 11 own, 13 including shared.
- Rationale: Two auxiliary boilers in the boiler room on the upper platform beside the engine casing (uptakes straight into the funnel); burner, flame scanner and drum level transmitter on each boiler; burner management panel at each boiler front; remote indication in the ECR and on ICSS.
- Legacy condition: Relay or cam-timer burner sequence, pneumatic or analogue controllers, mechanical air/fuel linkages.
- Retrofit scope: New burner management controller; Electronic air/fuel ratio with servo motors; New flame scanners; Drum level transmitter and control; ICSS interface.

### S11 IGG - Inert Gas Generator Control System Retrofits and Upgradations

- Primary room: Inert gas generator room (`R_IGG`); primary component `C_IGG_LCP`; HMI module `igg`.
- Rooms: R_ECR, R_IGG, R_CCR, R_BRIDGE, R_IG_DECK. Components: 16 own, 19 including shared.
- Rationale: Oil-fired IG generator, scrubber tower, two IG blowers, local control panel, oxygen analyser and gas regulating valve at the forward bulkhead in the IG room inside the machinery space (outside the cargo area, VERIFIED requirement 2.3.1.1.2), with its door into the engine casing rather than towards the ECR; IG main routed on the open deck outboard of the accommodation (requirement 2.2.3.2.9, routing representative); deck water seal, non-return valve and deck isolating valve on the main deck in the cargo area (VERIFIED requirement 2.2.3.1.9); indication and recording in the CCR, oxygen indication in the ECR, IG main pressure on the bridge (VERIFIED requirements 2.2.4.3 and 2.2.4.4); two room oxygen sensors in the IG room (VERIFIED requirement 2.2.4.5.4).
- Legacy condition: Relay sequence logic, analogue O2 analyser with chart recorder, pneumatic regulating valve positioner.
- Retrofit scope: New IGG control PLC and HMI; Oxygen analyser renewal and electronic recording; Remote panels in CCR, ECR and bridge; Valve positioner upgrade; ICSS interface.

### S12 DG Local Control Panels

- Primary room: Engine room generator flat (`R_ER_GEN`); primary component `C_DG1_LCP`; HMI module `dglocal`.
- Rooms: R_ER_GEN, R_ECR. Components: 3 own, 7 including shared.
- Rationale: Floor-standing local control panel on the walkway beside each engine (local start/stop, emergency stop, engine safety system, local HMI) with the speed controller inside.
- Legacy condition: Relay logic, analogue gauges, lamp indication and discrete timer relays.
- Retrofit scope: New local control panel or controller in existing panel; Engine safety system renewal; Sensors and wiring check; Interface to GCP and alarm system.

### S13 OMD - Oil Mist Detection Sensors

- Primary room: Engine room generator flat (`R_ER_GEN`); primary component `C_DG1_OMDU`; HMI module `omd`.
- Rooms: R_ER_GEN, R_ECR. Components: 22 own, 27 including shared.
- Rationale: Six detector heads on the crankcase doors of each engine (one per compartment), a control unit beside each engine, alarm and shutdown outputs to the engine safety system in the LCP, repeat panel in the ECR and link to the alarm system.
- Legacy condition: Central suction-type detector sampling all compartments through pipes, or no OMD on older engines with bearing temperature monitoring only.
- Retrofit scope: Detector heads on crankcase doors; Control unit per engine; Shutdown wiring to engine safety system; ECR repeater and alarm interface.

### S14 DG AVR Controls Retrofit Solutions

- Primary room: Engine room generator flat (`R_ER_GEN`); primary component `C_DG1_AVR`; HMI module `avr`.
- Rooms: R_ER_GEN, R_HVSWBD. Components: 3 own, 9 including shared.
- Rationale: AVR in an enclosure beside the alternator auxiliary terminal box (typical OEM practice for brushless alternators, UNVERIFIED); voltage bias and kvar sharing from the GCP; alternative placement in the GCP is noted as a vessel-specific option.
- Legacy condition: Analogue AVR with potentiometer settings, ageing capacitors and limited protection.
- Retrofit scope: Digital AVR replacement; Sensing and droop CT check; Commissioning with step response tests; Interface to GCP/PMS.

### S15 DG Governor Controls Retrofit Solutions

- Primary room: Engine room generator flat (`R_ER_GEN`); primary component `C_DG1_SPD`; HMI module `governor`.
- Rooms: R_ER_GEN, R_HVSWBD. Components: 6 own, 12 including shared.
- Rationale: Governor actuator on the engine fuel rack at the free end; electronic speed controller in the DG local control panel (short MPU and actuator wiring); speed bias and load sharing from the GCP.
- Legacy condition: Mechanical-hydraulic governor with ball-head and manual droop setting, or first-generation analogue speed control.
- Retrofit scope: Digital speed controller; Electric or electro-hydraulic actuator; Speed pickups; Load sharing interface to GCP; Tuning and load acceptance tests.

## 7. Legacy versus retrofit content policy

- Legacy limitations describe typical obsolescence patterns (spares, analogue governors and AVRs, electromechanical relays, hardwired PMS, analogue PAGA, TDM PABX, coax CCTV, relay-based burner and IGG sequences). Actual product lifecycle status must be confirmed with each OEM; every `obsolescence_note` says so.
- Functional improvements are qualitative. The validator rejects any percentage figure in `functional_improvements`. No performance, availability, energy saving, safety or compliance improvement is quantified or certified.
- Upgraded equipment is described generically, with no brand names and no compatibility claims. The typical sequence (survey, FDS, FAT, installation, SAT, class or client witness where required, training) is a generic project outline.
- Safety function changes (ESD, F&G, boiler and IGG trips, OMD shutdown) are stated as subject to the operator's functional safety and class processes, which are not part of this demonstration.

## 8. Assumptions register

| ID | Assumption | Basis / tag | Affects |
|---|---|---|---|
| A01 | Vessel is a representative converted VLCC style FPSO with internal turret, aft accommodation and aft machinery; principal dimensions 300 x 52 x 28 m from the reference package. | USER-SUPPLIED dimensions (reference README); arrangement UNVERIFIED engineering judgement | vessel |
| A02 | Hull lines (hull_offsets) are simplified representative lines: immersed transom, stern taper, parallel midbody x 55 to 240, bow with flare and small bulb. Not a lines plan. | UNVERIFIED | vessel |
| A03 | Double bottom / tank top at z 2.5 m; engine room flats at z 9.5 (generator flat) and z 18.0 (upper platform). Deck heights in accommodation 3.0 m. | UNVERIFIED | R_ER_LOWER, R_ER_GEN, R_ECR, R_MSB, R_HVSWBD, R_DRIVES |
| A04 | Three 3000 kWe, 3750 kVA, 6.6 kV, 60 Hz, 720 rpm medium-speed DGs supply the hull 6.6 kV switchboard; 440 V LV MSB via two 2500 kVA transformers. All ratings representative. | REPRESENTATIVE UNVERIFIED | S01, S02, S03, S12, S14, S15 |
| A05 | Topsides gas turbine generators are context only; the PMS demonstration covers the hull DG plant. The hull/topsides interconnection is vessel specific and not modelled. | UNVERIFIED | S02, TS_PWR |
| A06 | Governor speed controller is located in the DG local control panel (short MPU/actuator wiring); AVR is in an enclosure beside the alternator auxiliary terminal box. Both are common practice options; some vessels place them in the generator control panel. | UNVERIFIED | S14, S15, S12 |
| A07 | Each DG engine is a 6-cylinder in-line medium-speed engine with one OMD head per crankcase compartment (6 heads). | UNVERIFIED | S13 |
| A08 | 3000 kW per set exceeds the 2,250 kW threshold in the MSC.1/Circ.1345 interpretation of SOLAS II-1/27.5 (OMD or equivalent as part of automatic shut-off for medium and high-speed engines). Whether the interpretation applies to generator engines on a given FPSO depends on flag, class and the scope of SOLAS II-1/27.5, whose text was not read in this task. | Threshold VERIFIED (MSC.1/Circ.1345); applicability UNVERIFIED | S13 |
| A09 | Inert gas requirements quoted (5 % O2 delivered, 8 % in tank, 100 mm WG low pressure alarm, CCR recording, ECR O2 indication, bridge pressure indication, non-return devices on deck in the cargo area, IGG outside the cargo area) are taken from MSC.367(93). Whether the FSS Code applies to a given FPSO depends on flag, class and coastal state. | VERIFIED source text; applicability UNVERIFIED | S11 |
| A10 | Relay settings, PMS thresholds, AVR and governor values are REPRESENTATIVE educational values and must never be used as vessel settings. Real settings come from the vessel protection study and OEM data. | REPRESENTATIVE | S02, S03, S14, S15 |
| A11 | Equipment dimensions (cabinets, switchgear, VFDs, boilers, IGG, gensets) are typical envelope sizes for visualisation, not OEM dimensions. | UNVERIFIED | components |
| A12 | Fire zone, A-60 boundary and hazardous area labels are representative. No hazardous area classification, fire integrity or escape analysis has been done. | UNVERIFIED | rooms |
| A13 | Flare tower on the forecastle is chosen for maximum horizontal separation (about 230 m) from the aft accommodation. With the vessel bow to weather the forward flare is upwind of the unit, so radiation and any unignited or vented gas are carried aft over the topsides towards the accommodation and helideck; separation reduces but does not remove this. The flare base is about 9 m from the turret edge (representative). Location and height are decided by flare radiation and dispersion studies. | UNVERIFIED | TS_FLARE |
| A14 | Helideck on the accommodation roof with the funnel aft of it. With the vessel bow to weather only the funnel exhaust is carried aft, away from the helideck; the aft helideck is downwind of the process area, flare and vents, so turbulence and hot or toxic gas exposure need a helideck environmental study. | UNVERIFIED | TS_HELIDECK, TS_FUNNEL |
| A15 | PAGA uses two systems (A and B) in separate fire zones with interleaved loudspeaker loops in each area. Sound levels and intelligibility are not calculated. | UNVERIFIED | S06 |
| A16 | Collision bulkhead at x 277 with FP at x 297 and Lpp 288 is a representative placement; the regulatory range was not checked in this task. | UNVERIFIED | vessel |
| A17 | Mounted items (mounted_on) are positioned on their host; their own front access is through the host's access space and they are excluded from the 0.8 m clearance check. | database convention | components |
| A18 | Component size [Lx, Wy, Hz] is in ship axes (not rotated by facing). Facing gives the direction the operating face looks. | database convention (see DB_SCHEMA.md) | components |
| A19 | Cable routes are representative polylines along room trays, a central riser at x 23, y -1 and the main deck trunk at y -1, z 29.5; they do not model penetrations, segregation or cable sizing. | UNVERIFIED | cables |
| A21 | The IG main is routed from the IG room up the engine casing to the open main deck and along the open deck outboard (starboard) of the accommodation to the aft cargo deck, so it does not pass through accommodation, service or control station spaces (FSS 2.2.3.2.9, read in this task). The IG room door opens into the engine casing, not towards the ECR. Pipe routing is not modelled in 3D; compliance is not claimed. | Requirement text VERIFIED (MSC.367(93) paras 2.2.3.2.9 and 2.3.1.1.2); routing UNVERIFIED representative | S11, R_IGG |
| A20 | System names are the brief's names with the em dash in items 3, 5, 6, 11 and 13 written as a spaced hyphen (house style forbids em dashes). | house style rule | S03, S05, S06, S11, S13 |

## 9. References and claims register

VERIFIED in this task (read first-hand on 2026-10-30):

| Fact used | Source | Where used |
|---|---|---|
| IG system to deliver gas with O2 not more than 5 % by volume; tank atmosphere O2 not exceeding 8 % by volume at positive pressure | IMO Res. MSC.367(93), FSS Code ch.15 paras 2.2.1.2.1, 2.2.1.2.5; https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.367%2893%29.pdf | S11 measurements and alarms |
| Automatic venting if O2 exceeds 5 %; automatic shutdown on predetermined limits; regulating valve automatically closed | MSC.367(93) paras 2.2.2.2, 2.2.2.4, 2.3.1.2.1 | S11 alarm IGG-001, states |
| Two non-return devices, first a deck seal or equivalent, second a non-return valve; located in the cargo area on deck; water seal low level alarm at all times; two supply pumps if a water seal is fitted (2.2.3.1.4) | MSC.367(93) paras 2.2.3.1.1 to 2.2.3.1.4, 2.2.3.1.9 | S11 deck components, R_IG_DECK location |
| IG generators outside the cargo tank area, may be in machinery spaces; spaces containing IG generators shall have no direct access to accommodation, service or control station spaces | MSC.367(93) para 2.3.1.1.2 | R_IGG location and door (door into the engine casing; compliance not claimed) |
| IG piping shall not pass through accommodation, service and control station spaces | MSC.367(93) para 2.2.3.2.9 | Assumption A21 (IG main routed on open deck outboard of the accommodation; not modelled, not claimed) |
| Gas regulating valve at the forward bulkhead of the forward-most gas-safe space the IG main passes through | MSC.367(93) para 2.3.1.2.2 | C_IGG_RV location |
| Continuous indication and recording of IG main pressure and O2 in the cargo control room; pressure meter on the bridge; O2 meter in the machinery control room | MSC.367(93) paras 2.2.4.2 to 2.2.4.4 | C_IGG_RP_CCR, C_IG_PI_BR, C_IGG_O2_ECR |
| Alarms: O2 > 5 %, low pressure < 100 mm WG, high pressure, power failures; IGG specific: fuel supply, generator power, low water pressure/flow, high water level, high gas temperature, blower failure, water seal low level; two room O2 sensors alarming below 19 % | MSC.367(93) paras 2.2.4.5.1, 2.2.4.5.4, 2.3.2.1, 2.3.2.2 | S11 alarms and measurements |
| At least two IG blowers delivering inert gas to the cargo tanks (or one with spares for IG generator systems); in this model the two IG blowers supply the burner and deliver the gas through the scrubber to the deck (arrangement representative) | MSC.367(93) para 2.3.1.4.1 | C_IGG_BLW1, C_IGG_BLW2 |
| OMD arrangements (or bearing temperature monitors or equivalent) are part of the automatic shut-off arrangements of SOLAS II-1/27.5 for medium and high-speed diesel engines of 2,250 kW and above or with cylinders over 300 mm bore; for low-speed engines they initiate alarm and slow down | IMO MSC.1/Circ.1345, 2 June 2010, via https://www.traficom.fi/files/media/regulation/22629-MSC_1-Circ_1345_-_Tulkinta_SOLAS_II-1_27_5.pdf | S13, assumption A08 |
| ANSI/IEEE C37.2 device number titles: 25 synchronising check, 27 undervoltage, 32 directional power, 40 field/loss of excitation, 46 phase balance/negative sequence, 49 thermal, 50 instantaneous overcurrent, 50N, 51 AC time overcurrent, 51N, 51G, 51V, 59 overvoltage, 64 ground, 67 AC directional overcurrent, 81 frequency, 81U, 81O, 86 lockout, 87 differential, 87G. 49T is not on that page, so transformer thermal protection is written generically as 49 | VERIFIED (secondary source, titles only; IEEE C37.2 not read): Wikipedia 'ANSI device numbers', https://en.wikipedia.org/wiki/ANSI_device_numbers | S01 and S03 references, relay functions |

Not verified in this task (cited only as context, tagged UNVERIFIED in the database): IEC 61892 and class rules for MOU electrical installations; IEC 61850; IEC 61800; IEC 61511; IEC 60079; ISO 13702; NORSOK T-001; IEEE 421; IACS UR M10 and M67; SIP RFC 3261; helideck standards; collision bulkhead position rules. Applicability of SOLAS and the FSS Code to a specific FPSO is UNVERIFIED.

## 10. Validation performed (and not performed)

`tools/validate_db.mjs` (Node 22, no dependencies) checks: schema required fields; unique ids and resolving references; principal dimensions and hull station consistency; exactly 15 systems S01 to S15 with brief names; components and HMI module per system and two-way system/component consistency; every room inside the hull envelope (interpolated offsets) or, above the main deck, inside an accommodation, bridge, deckhouse or topsides box with its footprint inside the deck outline; room floor equals its deck level; no room overlap; no room overlapping a cargo or slop zone; access points on the room boundary with resolving targets; camera eye and target inside the room and not inside equipment; every component inside its room; no intersection between components in a room (mounted items may touch or overlap their host); 0.8 m front access clearance for every floor or wall standing cabinet, panel, console, rack and junction box; cable endpoints exist and route ends are within 1 m of their components, orthogonal segments; electrical references (breakers, buses, feeders, relays, relay settings), generator rpm versus poles, kW versus kVA x pf, load case sums, installed capacity above maximum normal load, N-1 warning, transformer loading warning; flare to accommodation separation at least 150 m; no numeric percentages in retrofit improvements; no em or en dashes. It also checks every per-system arrival viewpoint (`systems[].arrival`): eye position and height band, clearance from equipment and room fittings, operating faces toward the eye (75 deg limit), unoccluded sight lines to each primary component and primary components inside the central 80 % safe frame, with the numbers reported per system (rules in docs/DB_SCHEMA.md).

Mutation tests were run in this task (room overlap, component outside room, clearance obstruction, intersection, broken reference, wrong system name, em dash, room outside hull, insufficient generation, room in a cargo zone, 14 systems, displaced cable route): the validator failed each one as intended.

Not performed: any naval architecture, structural, stability, hazardous area, fire, escape, ventilation, flare, helideck, electrical (load flow, short circuit, protection coordination, harmonics), functional safety or class review. Geometric checks are axis-aligned box checks only.

## 11. Maintaining the database

`src/data/fpso_db.json` is the single authoritative source for the 3D model, 2D drawings, simulation and UI. Edit it directly, keep ids stable (other modules reference them), add new components with a room, position, size and facing, and run `node tools/validate_db.mjs` before committing. Room boxes and hull offsets drive both 3D and 2D, so a change there propagates to every view.

## 12. Data that would be needed for a vessel-specific version

- Vessel GA, machinery arrangement and deck plans
- Electrical single line diagrams, load list and protection study (relay settings)
- Generator, engine, AVR and governor OEM data and existing control drawings
- PMS functional description and load shedding tables
- ICSS architecture, I/O list and cause and effect charts
- Telecom (PAGA, PABX, IPTV, CCTV) block diagrams and device layouts
- Boiler and IGG maker documentation and current alarm and trip lists
- Hazardous area classification drawings, fire zone plan and escape routes
- Flag, class and coastal state requirements applicable to the unit
