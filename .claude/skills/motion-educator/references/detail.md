# Detail and camera

The bar is the best product-teardown and engineering explainers: a circuit board you could almost pick up, the
camera gliding over it, pushing in on one chip as the voice names it, the parts lifting apart to show what sits
underneath, a label that rides on the part as the view turns. Next to those, a flat icon of a chip, a "C" standing
for an ear cup or a brown wall standing for an ear reads as cheap at once, however good the script is. This page is
how to reach that bar with the kit, and how to check that you did.

Two things carry it: **the thing itself, built in detail**, and **a camera that is directed**.

## 1. Real things are built, not symbolised

When the film is about something physical (a device, a machine, an organ, a plant, a vehicle, a building), that
thing is the hero and it is built as itself: in 3D, from its real parts, at its real proportions, in materials that
read as what they are. A symbol (a box for a chip, a cone icon for a speaker, a circle for a cell) is allowed only
for something the film does not explain, at the size of an icon.

### Replicate the real one, the one your viewer knows

The model is a replica, not an invention. Build the version of the object the viewer actually sees in their life,
and build it accurately:

- **Whose object.** The request tells you where the viewer is: its language, the places and words in it, the
  platform. An Indonesian request means the nozzle at an Indonesian petrol station, the meter on an Indonesian
  wall, the motorbike on an Indonesian road; English with no other clue means the most common international
  version; another language, the version common where it is spoken. When the versions differ a lot and the clues
  do not settle it, ask.
- **Blueprints first.** Shape and parts come from technical drawings, not from guessing at photographs: they show
  every part, at true proportion, from straight on, with its name or number. Search for them before anything else:
  "<object> blueprint", "technical drawing", "dimensional drawing", "exploded view", "parts diagram", "parts list",
  "cross section", "cutaway", "CAD", "patent" (patents.google.com: the drawing pages download from
  patentimages.storage.googleapis.com), the manufacturer's spec sheet or service manual (often a PDF with an
  exploded view and a numbered parts list). Download each drawing and look at it. Collect, for each object:
  - **orthographic views** (side, front, top), with the overall dimensions;
  - **the exploded view or cross-section**, with every part named or numbered;
  - **the parts list**, so the model sheet can name every part the drawing shows.
  Write each drawing into the model sheet's `blueprints` (where it came from, which figure, what it shows); the
  board's check refuses a 3D model without one. Where sources disagree, use the one for the viewer's version and say
  so; what no drawing shows stays off screen or is labelled as unknown, never invented.
- **When the outside and the inside come from different sources** (a photo of the viewer's version outside, the
  drawings of a documented version of the same mechanism inside), fit the documented mechanism into the viewer's
  shell: the same parts, the same connections and the same order of working, scaled and placed to sit inside the
  outline they know, and say so on screen ("mechanism after US patent ..., fitted"). Do not cut between two
  different objects, and do not ask the person to choose.
- **Photographs only for what drawings do not show**: colours (and colour codes: by fuel, by voltage, by size),
  materials, finishes, markings, wear, and how the thing sits in its place. List them in `photos`. When the drawings
  and a photograph of the viewer's version disagree on shape, the photograph wins for the outside and you say so.
- **Blueprints are working material, not footage.** They shape the board and the model; they do not appear in the
  film (no drawing inset in a corner, no patent page on screen) unless the person asks for one. The film shows the
  real thing built from them; a source, when the film needs one, is a line of small type.
- **Model it from the blueprint views.** Put each orthographic drawing behind the model at its own angle
  (`space.blueprintView("side" | "front" | "top", { width })` points the camera straight at the model with almost no
  perspective, and `await space.backplate(url, { opacity: 0.5 })` lays the drawing behind it), trace each outline as
  an SVG path over it, and build from those outlines (`P.extrude` with a bevel for a flat profile; the side and top
  outlines together for a body; `P.lathe` for a turned part). Each part from the exploded view is its own named
  mesh, built the same way, in its place. A real object is never assembled from spheres and cylinders by eye.
- **Check it against every drawing.** Overlay each blueprint on the render at its view (`over: true`) until the
  outlines sit on each other, then render the cutaway or exploded view beside the drawing's own at the same angle.
  Every difference is either fixed or a choice you can name. Logos and brand names may be left off unless the person
  asks for them; the shape, the colours and the local conventions stay.

### The model sheet (before any shot is built)

For each hero object, before building shots:

1. **Blueprints and parts.** Decide which real version you are replicating (above), find its blueprints, and write
   the model sheet in the storyboard's `models`: the drawings, the photographs for colour and finish, and **every
   part the drawings show**, numbered as they number them, with real sizes. The storyboard is drawn from this list:
   each part a shot explains appears in that shot's frames, and a part no shot shows is listed in `notShown` with
   the reason. The board's mechanism frames show the blueprint itself (cropped to the part, with labels and arrows
   over it) or an exact tracing of it, never a loose hand copy, so the board, the model and the drawing show the
   same parts.

   ```json
   "models": [{
     "name": "over-ear noise-cancelling ear cup",
     "variant": "the common over-ear ANC headphone sold worldwide; the viewer asked in English",
     "reference": "teardown photos of three over-ear ANC headphones; a 40 mm dynamic driver cross-section",
     "blueprints": ["each drawing: where it came from, which figure, what it shows (side view, exploded view, parts list)"],
     "photos": ["photographs used for colour, finish and markings: a URL, a catalogue page, the person's own photo"],
     "looks": "matte black shell, protein-leather cushions, brushed-metal slider; mic grille on the cup's rear",
     "scale": "1 unit = 1 mm",
     "parts": ["outer shell (ABS, 70 x 85 mm)", "feed-forward mic behind a grille on the shell", "feedback mic in front of the driver",
               "40 mm driver: basket, magnet, voice coil, cone, surround, dust cap", "main board with the ANC chip and battery",
               "memory-foam cushion in a protein-leather cover", "fabric baffle cover", "yoke and headband slider"],
     "notShown": ["parts in the drawings the film leaves out, each with why"]
   }]
   ```

   The storyboard check requires this for any film with `object3d` or `macro` shots (`"standard": 2` or more).
2. **Block it out at real proportions** with the parts in `kit/engine/parts3d.js` and three.js shapes, every named
   part its own mesh or group (named, so it can be pinned, exploded, ghosted or cut).
3. **Turnaround.** Render it alone from four angles (front, three-quarter, side, top) and from close. Compare with
   the reference: proportions, silhouette, the parts. Fix it until a stranger would name it from the silhouette
   alone.
4. **Detail pass**, three levels, each judged at its own distance:
   - *Silhouette* (the whole object at a tenth of the frame): it reads as itself.
   - *Parts* (the object filling the frame): every part from the model sheet is there and in the right place.
   - *Micro* (the macro close-up): what rewards a close look: bevels on every edge (nothing razor-sharp),
     seams and parting lines, screws, vents and grilles, markings printed on chips, solder fillets, wire
     windings, fabric weave, foam pores, grain in leather.
5. **Materials** from `parts3d.js` (`M.plastic`, `M.metal` with brushing, `M.rubber`, `M.foam`, `M.leather`,
   `M.fabric`, `M.copper`, `M.solder`, `M.silicon`, `M.ferrite`, `M.skin`, `M.glass`...), never a default grey.
   Each has a surface (a normal or roughness map), so light moves across it as the camera moves.
6. **Light** like a product set: the key from the upper side, a rim from behind that separates the object from the
   dark (`space.rim`), a soft fill, and the object standing on something (`shadows: true` and `space.floor()`) or
   held in a lit void with a rim on every side. Never a flat-lit object pasted on the background.

### Building shapes that are not boxes

| The thing | How |
| --- | --- |
| Anything turned: a cone, a cup, a bottle, a knob, a lens, a fruit, a bulb, a can | `P.lathe(profile)` from a traced profile; `P.smoothProfile` rounds its corners |
| A flat outline with thickness: a bracket, a leaf, a gear, a logo-less badge, a car's side, an ear's outline | `P.extrude(svgPathD, depth, { bevel })` from a traced outline; a deep bevel makes it soft |
| Rounded blocks: housings, chips, batteries, phones | `P.roundedBox(w, h, d, r)` |
| Wires, cables, pipes, veins, roads | `P.tube(points, radius)` |
| A body, a limb, a bone, a muscle, an organ | never built from shapes: the real mesh (see *Living things*, below) |
| Organic lumps with no fixed shape: rocks, a blob of fat, a soft cell | a sphere or a lathe shape, its vertices pushed out by a smooth noise |
| Crowds of the same thing: cars, cells, trees, molecules | build one in detail, then `THREE.InstancedMesh` |
| Electronics | `P.pcb`, `P.ic` (qfn / qfp / soic), `P.smd`, `P.shield`, `P.usbC`, `P.header`, `P.mic`, `P.screw` |
| A speaker or headphone driver | `P.driver` (basket, magnet, pole piece, voice coil, spider, cone, surround, dust cap, all explodable) |

Where the kit has no piece, build it from these, as `parts3d.js` builds its own, and keep it in the film's folder.

### Living things: anatomy is loaded, tissue is measured

A viewer has looked at their own arm all their life: an arm made of cylinders, a muscle drawn as a smooth red
sausage or a cell drawn as a pink tube with purple drops reads as a toy at once, however good the light. Organic
form is never modelled from primitives.

**The body, at the scale you can see: load the real one.** `kit/tools/anatomy.mjs` builds a `.glb` from
BodyParts3D, a whole human body measured from a real person (every bone, muscle, organ, vessel and the skin, in
millimetres, CC BY 4.0). Name the parts the way the database does (`--find biceps` lists them); the tool smooths
them, marks where each muscle thins into tendon, trims the whole-body skin to a sleeve around a limb (`near`), and
writes the credit beside the model. `kit/engine/body3d.js` loads it with tissue materials and poses it:

```js
const B = createBody(space, P);
const arm = await B.load("assets/arm.glb");                          // parts: arm.userData.parts.biceps ...
const elbow = B.joint(arm, { pivot, below: ["radius", "ulna", "hand"], above: ["humerus", "scapula"], blend: 6 });
const flex = B.flex(arm.userData.parts.biceps);                        // the belly thickens, the tendons do not
const glass = B.xray(arm.userData.parts.skin);                         // skin to a clear shell: the muscles show
tl.to(elbow, { angle: 105, duration: 1.2 }, t); tl.to(flex, { v: 1, duration: 1.2 }, t);
film.each((t) => { B.update(); space.render(1, t); });
```

- **Pose it as the body moves.** A hinge (`B.joint`) turns the bones below it rigidly and bends the muscles and
  skin that cross it smoothly. A muscle that works flexes. Never turn a forearm by rotating a whole group, which
  tears the skin and the muscles at the joint.
- **Show the layers in order.** Skin, then skin as glass (`B.xray`) with the muscles under it, then the one
  muscle (the others ghosted), then into it. The viewer keeps their place because the arm never changes.
- **Frame around the database's limits.** The skin is one surface for the whole body, so where a limb meets the
  trunk (the armpit, the inner thigh) a trimmed sleeve has an opening: frame skin shots from the outside of the
  limb, or show the skin as glass there. The source is about 2000 triangles a muscle: smooth it (`"smooth": 1`
  or `2`) and keep extreme close-ups for the tissue builders below.
- **Animals, plants, fossils, objects in a museum**: look for a measured scan first. The Smithsonian's 3D
  collection (3d.si.edu, many models CC0) and NIH 3D (3d.nih.gov: organs, cells, proteins, each with its own
  licence) are reachable from most sessions. Record the source and licence in the model sheet and credit it in
  the film. Build from drawings only what no scan exists for, and then from measured references (anatomical
  plates, dissections, specimen photographs), never from memory.

**Below what the eye can see: build it from measurements.** Tissue, cells and molecules have no scan you can load
at film quality, so they are built, but from a dimension sheet: every size and count from histology or electron
microscopy, with its source, written into the model sheet before the model. A muscle fibre is a long cylinder
10 to 100 µm across, its many nuclei flattened and lying just under the membrane along its length (never round
blobs on top), striated across its axis, packed with myofibrils; a sarcomere is about 2.2 µm, thin filaments
anchored in zig-zag Z-discs, thick filaments with their heads in helical rows and a bare zone at the M-line, six
thin around each thick in section. Get one level wrong and a biologist stops watching. `kit/engine/tissue3d.js`
builds skeletal muscle at every level this way (muscle, fascicle, fibre, myofibril, sarcomere, with sliding
filaments and hypertrophy); use it as the pattern for other tissue.

**Scale is a journey, not a cut.** Go from the arm to the molecule in steps the viewer can follow: each level
appears inside the one before it (the fascicle inside the cut muscle, the fibre inside the fascicle), with a
scale note (`1 mm`, `50 µm`, `2 µm`) and the colour of each structure kept from level to level.

### When 2D is right

Charts, timelines, maths, text and the invisible (a sound wave, a field, a flow, a signal) are drawn in 2D or as
light in the 3D scene, crisp and clean. The invisible is best drawn *where it happens*: the sound wave travels
through the air around the 3D ear cup, the current runs along the board's traces, the field bends around the 3D
magnet. A diagram is a cutaway of the real thing, not a different picture of it.

### A set, not a void

The object lives somewhere. Establish it in its world, lit like product photography: headphones on a desk beside a
keyboard in a dim room with warm lamps glowing out of focus behind; a board on a cutting mat; an onion on a chopping
board in a kitchen. `P.desk()` gives a wooden top, a far wall and practical lights that open into bokeh under
`cam.blur`; `P.dust()` gives floating motes that catch the light (and, moved by a function of time, can draw a
sound wave or a flow through the air). Warm key, deep shadows, one accent colour. The void (a dark studio sweep)
is for the macro and the cross-section, after the world has been seen.

### Instruments: how the best ones explain

On top of the 3D, thin technical overlays make the invisible measurable, all in one light style (1.5-2.5 px lines,
small uppercase mono labels, the accent colour for the live part):

- a live readout tied to the picture: an oscilloscope trace labelled with what it measures, moving as the part moves;
- a ruler with the real dimension beside a part ("30 mm"), a distance scale with real values ("0 dB, -6 dB, -12 dB");
- a chart drawn into the scene (a polar pattern around the microphone, a frequency curve behind the driver);
- the source of a number on screen, in small type ("inverse-square law; manufacturer's polar chart, 1 kHz"), and
  "illustrative" on any cross-section drawn for clarity.

### Words on screen for a short

Use `"captions": "frame"` in the storyboard: a short line at the top (in portrait, just under the safe area), the
words not yet said dim, each lit as it is said, and the key word of the line inside a selection frame with corner
handles (name it in the shot's `"keys"`). It reads like the best product shorts and never covers the object.

## 2. The camera is directed

The camera tells the viewer where to look, the way a hand would point. In the kit it is `space.cam` with
`createStage3D(canvas, { rig: true })`: tween `az`, `el`, `dist`, the target `tx ty tz`, `fov`, `roll`, `focus`
and `blur`; `sway` adds a slow hand-held drift.

### The grammar of a teardown film

| Move | What it does | How |
| --- | --- | --- |
| **Establish** | the whole object, three-quarter view, slow orbit | `az` 25-40, `el` 15-30, `fov` 28-35, orbit 10-25 degrees over the shot |
| **Approach** | travel to the part the voice is about to name | ease the target onto the part and `dist` down to a third or less |
| **Macro** | the part fills the frame; shallow focus | `fov` 18-24, `blur` 0.5-1, `focus` on the part, `sway` 0.6 |
| **Rack focus** | from one part to the next without cutting | tween `focus` (and the target a little) |
| **Reveal** | what is inside: lift the parts apart, cut it open, or fade the shell | `space.explode`, `space.cutaway`, `space.ghost`, with a camera move on top |
| **Mechanism** | the part working: the coil pushing the cone, current flowing | hold or drift, slow, so the motion reads |
| **Pull back** | the part in its place in the whole, then the whole in the world | the reverse of the approach |

### Rules

- **Every 3D shot moves.** A deliberate move (orbit, push, crane, rack focus) on top of a slow drift. A hero held
  straight-on and still is a slide.
- **Three-quarter views.** Straight-on and flat side views only for a cross-section that must be read like a
  drawing, and even then the camera drifts.
- **Close when named.** When the voice names a part, the part fills 30-60% of the frame's height within half a
  second of the word, and a pin (`space.pin`) names it.
- **Vary the angle.** No two consecutive shots from the same angle and distance; alternate wide, medium, macro.
- **One continuous camera** while the subject stays the same: no cut between two views of one object when a move
  can carry the eye there. Cut when the scale or the subject changes.
- **Ease every move** (`power2.inOut` or `power3.inOut`), 1.5 to 3.5 s; never linear, never a jolt.
- **Depth of field** only in macro and medium shots, focused on what the voice is about; nothing important blurred.
- Write each 3D shot's move in the storyboard's `camera` field: where it starts and ends, the lens, the focus.
  The check requires it on `object3d` and `macro` shots.

## 3. Pins: labels that live on the part

`space.pin(part, "voice coil<small>copper wire</small>", { dx, dy, at })` puts a dot on the part (`at` is a point in
the part's own coordinates), an elbow line and a label chip; it follows the part through every camera move and
explode. Tween `pin.show` 0 to 1 as the word is said, back to 0 when the voice moves on. Keep pins inside the safe
area; put them on the side with space; at most three at once.

## 4. Portrait

In 9:16 the object is framed tall: stand it up or turn the camera so its long side runs down the frame, keep the
subject in the upper two thirds, pins to the left or right inside the safe area, never under the captions. A wide
board becomes a top-down view at an angle, or the camera travels along it.

## 5. The check, before anyone else sees it

Look at the stills (`render.mjs --stills`) and answer each in writing:

0. **The replica test.** Your model next to your best reference photo at the same angle: a viewer from that
   place would say "that's the one".
1. **The crop test.** Crop the hero out of a still and shrink it to a tenth: would a stranger name it? Crop a part
   at full size: would they name the part?
2. **The parts count.** Every part on the model sheet that the film talks about appears, recognisable, in a close
   shot.
3. **No placeholders.** No default material, no unbevelled box standing for something round, no icon standing for
   a thing the film explains.
4. **The camera log.** Every 3D shot's move, in order: none static, none repeated back to back, every named part
   seen close.
5. **The anatomist's test** (living things). Each level next to a real image of it (an anatomy plate, a
   dissection photo, a micrograph, an electron micrograph): the shape, the proportions, where things sit (nuclei at
   the edge of a muscle fibre, tendon where the muscle thins) and the size note all agree with the source. Nothing
   organic is a primitive.
6. **Side by side with the bar.** Put your best frame next to a frame of a top teardown explainer you know: would
   yours sit in that film? If not, it is not finished: add the missing level of detail.

The reviewer (`review.md`) is asked the same questions, and rates any schematic stand-in for a real object
"ordinary".
