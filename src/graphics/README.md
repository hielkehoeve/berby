# Graphics

Everything the player sees in 3D: the Malibu world, the two karts and the chase camera. All
geometry and textures are procedural (no asset files); the look is flat pastel toon shading with
one shadow-casting sun. The game loop codes against the exported signatures below and nothing
else.

## Modules

| File | Exports | Notes |
|------|---------|-------|
| `world.ts` | `buildWorld(track): World` | Sky dome + sun, fog, lights, sand, animated ocean, road ribbon, barrier walls, all scenery. `World.group` holds the lights; assign `World.background` / `World.fog` to the scene; call `World.update(dt, elapsed, focus)` every frame. |
| `kart-mesh.ts` | `createKartView(variant): KartView`, `createKartModel(look): KartModel`, `KART_LOOKS`, `steerFraction(state)`, `WHEEL_RADIUS`, `GHOST` tunables | Racers (`'player'` = Berby, hot pink, heart spoiler; `'rival'` = Vix, lavender, star) and the model builder reused for parked karts. `KartView.setGhost(amount)` fades a kart (see below). |
| `camera.ts` | `createChaseCamera(aspect)`, `updateChaseCamera(camera, target, dt)`, `snapChaseCamera(camera, target)`, `kartOcclusion(camera, target, other)`, `CHASE` and `OCCLUSION` tunables | Smoothed chase camera; `snapChaseCamera` resets it behind the kart (race start); `kartOcclusion` says how much one kart hides another. |
| `materials.ts` | `toonMaterial`, `toonGradient`, `outlineMaterial`, `paint`, `mergeParts`, `placement`, `canvasTexture`, `heartShape`, `starShape`, `rng`, colour constants | Shared helpers. |
| `preview.ts` + `/preview.html` | dev only | Standalone harness, see below. Not referenced from `index.html`. |
| `../tracks/malibu.ts` | `MALIBU: TrackDefinition` | Control points of the Malibu Sunset Loop (~1215 m, min radius ~25 m). |
| `../tracks/malibu-scenery.ts` | `MALIBU_SCENERY`, `resolveScenery(entries, track)`, `shorelineX(z)`, `hillY(x, z)`, `SHORE_X`, `NEAR_HILL`, types | Scenery placement data and resolver. |

### Renderer setup the game loop must do

```ts
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in three r18x
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// no tone mapping; colours are authored as displayed
scene.add(world.group);
scene.background = world.background;
scene.fog = world.fog;
```

Each frame: step the sim, then `kartView.update(state, dt)`, `world.update(dt, elapsed, player.position)`,
`updateChaseCamera(camera, player, dt)`, `rivalView.setGhost(kartOcclusion(camera, player, rival))`,
render. The world's shadow camera follows `focus`.

## Occlusion and ghost fade

A tailgating Vix sits exactly where the chase camera looks, hiding Berby. Two pieces fix that:

- `kartOcclusion(camera, target, other): number` (camera.ts) is a cheap per-frame test, no
  allocations. Both karts are reduced to a point `OCCLUSION.kartHeight` (0.8 m) above the ground
  and `other` is projected onto the segment from `camera.position` to `target`. It counts only
  while its parameter t lies in `OCCLUSION.tMin…tMax` (0.05…0.95, soft edges `tSoft` = 0.1 wide),
  and the result is `1 - smoothstep(perpendicular distance, inner, outer)` with `inner` = 1.0 m
  (fully blocking) and `outer` = 2.4 m (clear). Using the true 3D line means a kart just in front
  of the camera but below its view line scores low, as it should.
- `KartView.setGhost(amount)` (kart-mesh.ts) stores the request; `update(state, dt)` eases the
  applied amount toward it (`GHOST.fadeInRate` 10/s, `fadeOutRate` 5/s) and sets the opacity of
  the body and wheel materials to `lerp(1, GHOST.opacity = 0.25, amount)`. The outline shell fades
  faster and is hidden from `GHOST.outlineGoneAt` = 0.5, drawn under the body meanwhile
  (`renderOrder -1`) so its back faces don't tint the translucent body. `transparent = true` and
  `depthWrite = false` are set only on the solid→ghost transition and restored on the way back
  (with one `needsUpdate` each way, which swaps the shader variant; the first switch compiles it).
  Shadows keep casting at full strength. Every kart owns its material instances, so Berby and the
  parked karts never fade along.

In the preview, `G` parks Vix 3.5 m behind Berby on the centerline and `V` cycles her 1.5 m to
either side; the HUD shows the live occlusion value.

## Coordinate conventions

As in `shared/types.ts`: Y up, ground is XZ, heading 0 faces -Z, `object.rotation.y === heading`.
Kart models are built with the nose at local -Z and the right-hand side at +X. Scenery objects
face local -Z too ("facing: 'road'" turns that toward the asphalt).

## Scenery data format (`tracks/malibu-scenery.ts`)

`TrackDefinition` is frozen, so set dressing lives next to it. An entry is either one object or
a run of repeated objects:

```ts
// One object, anchored to the track: control point index + metres past it.
{ kind: 'house', at: { cp: 6, along: 30 }, lateral: 25, facing: 'road', color: PALETTE.cream, scale: 0.9 }
// One object at an absolute world position (hills, things on the hill).
{ kind: 'hill', at: { x: 112, z: -68 }, scale: 47, scaleY: 13, color: 0xc4ecc9 }
// A run: every `step` metres between two anchors, with optional jitter, mirroring and colours.
{ kind: 'palm', from: { cp: 28, along: 4 }, to: { cp: 31, along: 2 }, step: 6, lateral: 11.5,
  mirror: true, jitter: 0.4, scale: 1.35, scaleJitter: 0.1, tilt: 0.3, seed: 27 }
```

- `lateral` is metres from the centerline, **positive = left of travel** (`leftOf(tangent)`); on
  the seaside straight that is the ocean side. Barriers sit at ±9 m, so anything at |lateral| ≥ 11
  is off the track.
- `facing`: `'along'` (default, points in the travel direction), `'back'`, `'road'`, `'away'`;
  `yaw` adds radians on top.
- `tilt` leans the object toward the road (palm tunnel); `y` lifts its base (objects on the hill
  use `hillY(x, z)`).
- Anchors use control point indices instead of raw distances so they survive spline changes:
  `resolveScenery` finds each control point's distance with `track.nearest()`.
- Kinds: `palm`, `bush`, `flamingo` (instanced), `house`, `cafe`, `umbrella`, `towel`, `ball`,
  `surfboard`, `lifeguard`, `hill`, `arch` (merged into one static mesh), `kart` (a parked
  kart model). Add a kind by writing a `*Parts()` builder in `world.ts` and a case in `addScenery`.

`world.ts` picks the scenery list by `track.definition.id` (`SCENERY_BY_TRACK`); an unknown id
gets road, walls, sand, ocean and sky only.

## Track layout (Malibu Sunset Loop)

Top view with X right and Z down; travel is clockwise; the ocean is everything left of the wavy
shoreline at x ≈ -46 (`shorelineX(z)`).

1. Seaside straight (cp 0-2, ~230 m) heading -Z; start/finish arch and checkered line at cp 0.
2. Turn 1, right-hand sweeper inland (R 60).
3. Short approach, then the hairpin around the beach café (R 40; café, terrace and parked karts inside).
4. Link west and the hill curve: a long left-hander (R 62) wrapping a mint mound with houses and palms; the ocean view opens on the right.
5. East along the foot of the hill, right onto the south leg.
6. Right into the palm tunnel: tall palms on both sides leaning over the road.
7. Final right back onto the straight.

Arcs are sampled every 30° because a Catmull-Rom spline pinches at sparse control points.
Measured (centripetal spline): length 1214 m, minimum radius 25-27 m. The world is flat; the
"hill" is scenery only.

## Performance notes

Measured in the preview at 1280×680: ~36 draw calls, ~75k triangles of scene geometry; the
renderer's `info.triangles` reads ~115k because it also counts the shadow pass.

- Static props (houses, café, umbrellas, towels, arch, hills…) are merged into **one**
  vertex-coloured mesh with `mergeParts` (BufferGeometryUtils). Palms, bushes and flamingos are
  `InstancedMesh`es with vertex colours (one draw call each). Karts are 6 draw calls (merged body,
  outline shell, four wheels) and ~3k triangles.
- Road: one ribbon (1.25 m steps) with a single 256×512 tiled CanvasTexture (curbs, edge lines,
  centre dash). Walls: one non-indexed mesh with flat per-segment colours. Start line: one plane.
- Ocean: one ShaderMaterial on a non-uniform grid (dense near the shore); three sine waves in the
  vertex shader, analytic normals, sun glint and foam bands in the fragment shader, fog via the
  standard chunks. Sand: a vertex-coloured grid that dips below the water near the shore, so the
  waterline follows the waves.
- Sky: a 1000 m sphere that follows `focus`, `depthTest: false`, drawn first; gradient and sun
  disc in a tiny shader. Fog colour equals the horizon colour.
- Shadows: one `DirectionalLight`, 1024² map, 110 m orthographic frustum centred on `focus` and
  snapped to shadow texels (no shimmer). Only karts, palms and the static props cast; walls,
  bushes, flamingos and the ground do not.
- Toon shading: `MeshToonMaterial` with a shared 8-texel gradient (4 lit bands). Outlines are
  back-face-scaled shells, only on the karts.
- No post-processing. The ocean (~9k tris) and the palm instances (~21k) are the biggest single
  items if more budget is ever needed.

## Preview harness

```
npx vite --port 5174
open http://localhost:5174/berby/preview.html
```

Drives both karts along the centerline (no sim physics) with the chase camera. Keys: `C`
chase/orbit, `T` top-down, `Space` pause, `R` restart, `←/→` scrub 20 m, `↑/↓` speed, `W`
wireframe, `G` Vix tailgates 3.5 m behind Berby (ghost fade), `V` cycles her lateral offset
0 / +1.5 / -1.5 m. URL params: `?d=400`, `?speed=15`, `?orbit=1`, `?top=1`, `?tail=1`, `?lat=1.5`.
`window.__preview` exposes the scene, `jump(d)`, `tailgate(on, lateral)`, `occlusion()`,
`budget()` (triangles per mesh) and `shoot(name)` (POSTs a JPEG of the frame to a local collector
on port 5175, for scripted screenshots).
