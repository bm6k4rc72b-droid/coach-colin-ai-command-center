# Human Atlas

A full-screen 3D human anatomy explorer: 890 real anatomical structures from
[BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) in
anatomical position, with a minimal floating interface. The anatomy itself can be
exploded into a catalogued specimen sheet.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # typecheck + production build in dist/
npm run build:anatomy  # regenerate public/anatomy from the BodyParts3D archive
```

## What's in it

| | |
|---|---|
| **Systems** | 8 systems (skeleton, muscles, heart, sensory organs, arteries, veins, nervous, respiratory) with toggles and presets (All, Skeleton, Organs). Systems fade in and out, staggered slightly when several change at once. |
| **Explode** | Every piece has an `assembledPosition` and an `explodedPosition` on a specimen sheet: large structures in the top rows, small ones packed densely at the bottom. Transitions use easeInOutCubic and a slight per-row stagger, and the camera pulls back as the sheet opens. |
| **Specimen collections** | Hand, Shoulder, Thigh, Foot, Heart and Brain, each filtered by Both, Left or Right. Choosing one frames that region and lays it out as its own sheet. |
| **Hover / select** | BVH-accelerated raycasting, a navy tooltip (name and category), an emphasised selection with everything else dimmed, and camera focus on the selected structure. |
| **Information panel** | Category, name, a description built only from manifest facts, ID, system, region and side. Relationships show verified attachments (clickable) and "nearby" structures, which are labelled as proximity only. On small screens it becomes a bottom sheet. |
| **Isolate** | Keeps the selection opaque, ghosts everything else and centres the orbit on the selection. |
| **Camera** | OrbitControls with damping 0.05. Every move tweens. `focusOnObject(mesh)` lives in `src/scene/cameraRig.ts`. Toolbar buttons: zoom in and out, front view, orbit and pan modes, reset, full screen. |
| **Search** | Press `/` to focus it. Use the arrow keys and Enter to pick a result. |

Keys: `/` search · `F` front view · `R` reset camera · `+`/`-` zoom · `O`/`P` orbit/pan ·
`Esc` steps back (close credits → exit isolate → clear selection → leave collection).
`?ao=0` disables ambient occlusion.

## Anatomy assets

### Source

Put the BodyParts3D archive in `assets/anatomy/raw/` (gitignored, about 1.3 GB):

```
assets/anatomy/raw/
  parts_list_e.txt           id → English name
  conventional_part_of.txt   part-of tree
  *.obj | *.stl              one mesh per element, file name = element ID
                             (also searched in raw/obj/ and raw/stl/)
```

The committed build was generated from the BodyParts3D 3.0 data (the 99%-reduced
set, as STL) mirrored at
[Kevin-Mattheus-Moerman/BodyParts3D](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D),
because the DBCLS archive host was not reachable from the build machine. The
script prefers `.obj` when both formats exist, so the original OBJ download works
unchanged.

### Build (`scripts/build-anatomy.ts`)

1. Maps every mesh ID to its English name (`parts_list_e.txt`).
2. Classifies each piece into a system using the dataset's own part-of tree
   (`scripts/rules/classify.ts`). Name patterns are used only to split the
   cardiovascular system into heart, arteries and veins, and to read laterality.
   **Anything no rule covers is written to `assets/anatomy/unclassified.tsv`
   instead of being guessed.** Currently 44 pieces are listed there: digestive,
   urinary, genital, endocrine and lymphoid organs, and the skin.
3. Assigns a region from the part-of tree. Pieces with no region node fall back
   to name keywords and then body height, and each fallback is logged in
   `assets/anatomy/build-report.txt`.
4. Detects side from the name ("left ventricle" is not the left side of the
   body), then checks it against the mesh centroid.
5. Converts millimetres (Z up) to metres (Y up, anterior +Z), welds, decimates
   with meshoptimizer (24.1 M → 1.1 M triangles), and writes one
   meshopt-compressed GLB per system with every piece as a node named by its ID.
6. Computes the atlas sheet layout (`src/lib/atlasLayout.ts`, shared with the
   app), the curated attachments and the proximity lists, then writes
   `public/anatomy/manifest.json`.

Options: `--raw <dir> --out <dir> --ratio 0.055`.

### Manifest

```ts
{ id, name, system, region, side, meshFile, assembledPosition, explodedPosition,
  size, category, partOf, relations, nearby, triangles }
```

`meshFile` is the system GLB that contains the piece, as a node named `id`.

### Swapping in other meshes

The loader (`src/scene/Anatomy.tsx`) depends only on the manifest and on node
names. To use different geometry, write GLBs in which each piece is a node named
by its manifest `id` and positioned at `assembledPosition` (any glTF quantization
is baked out on load), and point `meshFile` at them. If the manifest is missing,
the app shows a load error that names the build command.

## Relationships policy

- **Origin / Insertion** (muscles) and **Attached muscles** (bones) come from
  `scripts/rules/attachments.ts`: textbook-standard, bone-level attachments for
  127 muscles (253 left and right pieces), resolved to meshes on the same side. Muscles that are not
  listed show "No verified attachment data".
- **Part of** groups come from the BodyParts3D tables.
- **Nearby** lists structures whose surfaces lie within 4 mm in the model. It is
  always labelled as proximity, never as a connection.

Descriptions are assembled from these facts only. No relationship is inferred.

## Architecture

```
src/
  scene/engine.ts      piece registry + per-frame animation (positions, fades, highlight)
  scene/cameraRig.ts   tweened camera, follow mode, focusOnObject()
  scene/Anatomy.tsx    GLB loading (per system, Suspense), BVH, pointer events
  scene/Viewer.tsx     Canvas, studio lighting (Lightformer environment), N8AO
  state/store.ts       zustand store: the only React state
  ui/*                 floating panels (Framer Motion)
```

React state changes only retarget the engine (`applyState`). All interpolation
happens in `useFrame` against plain objects, so nothing re-renders per frame. The
tooltip follows the cursor by writing straight to its DOM node.

Performance: per-system GLBs (cached by `useGLTF`) load progressively, smallest
first. Geometry is meshopt-compressed and decimated. Raycasting uses
three-mesh-bvh. Hidden pieces are set to `visible = false` so they skip both
culling and raycasting. Frustum culling uses per-piece bounding spheres. Faded
"ghost" pieces move to a non-interactive layer. Instancing and LOD are not used:
no two pieces share geometry, and the decimated meshes are already light.

## Credits

**BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by CC表示-継承2.1 日本**
(BodyParts3D © 2008 Life Science Integrated Database Center, now the Database
Center for Life Science, under
[Creative Commons Attribution-ShareAlike 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en)).
License terms: <http://lifesciencedb.jp/bp3d/info_en/license/index.html>.

The derived meshes and manifest in `public/anatomy/` were re-oriented, decimated
and compressed, and are distributed under the same CC BY-SA 2.1 JP license. The
app shows the full attribution under **Sources & credits**.

Educational use only. Not for diagnosis or clinical decisions.
