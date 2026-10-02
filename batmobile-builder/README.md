# Night Interceptor: a Batmobile-style vehicle builder (educational)

Design an armoured night-pursuit vehicle, then see what physics thinks of it. One car has to
meet eight requirements at once, and every part trades one against another.

> Educational fan project. It uses real vehicle-dynamics models, simplified for teaching. It is
> not affiliated with any film or comic.

## Run it

```bash
cd batmobile-builder
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest (19 tests)
npm run build    # typecheck + build
```

## What you build

| Part | Options | What it changes |
|---|---|---|
| Chassis | street interceptor · off-road "tumbler" · urban tank | Mass, track width, centre of gravity, drag area, crumple zone, suspension travel you can fit |
| Powertrain | 6.2 L V8 · twin-turbo V12 · quad electric motors · gas turbine | Power, mass, onboard energy and efficiency |
| Armour | none · composite · ceramic · steel | Protection rating against mass, stiffness and a higher centre of gravity |
| Tyres | street · all-terrain · run-flat | Grip and rolling resistance |
| Drive | rear-wheel drive · all-wheel drive | How much of the weight is pushing |
| Suspension and aero | spring rate · travel · damping · rear wing · ride height | Jump landings, downforce versus drag, rollover |

## The eight tests (the "Gotham pursuit" mission)

| Test | Model |
|---|---|
| 0–100 km/h and ¼ mile | min(power ÷ speed, μ × weight on driven wheels) − drag − rolling resistance, integrated over time |
| Top speed | Power = (½ρC<sub>d</sub>A·v² + C<sub>rr</sub>·m·g)·v, or the gearing limit |
| 100–0 km/h braking | μ(mg + downforce) plus drag, integrated over the stop |
| Hairpin, R = 30 m | Grip limit v² = μg / (1/R − μ·½ρC<sub>l</sub>A/m) against rollover at the static stability factor, track ÷ (2h) |
| Canal jump, 20 m | Ballistic range v²·sin 2θ / g. The landing energy per wheel is compared with spring and damper capacity, ½kx²·(1 + 2.5ζ) |
| Barrier crash, 56 km/h | Occupant g = v² ÷ (2 × (crumple + restraint)). Stiff armour reduces crumple |
| Range at 100 km/h | Usable energy ÷ (drag + rolling resistance) |
| Protection | Armour rating ≥ 3 |

Only about 6% of part combinations pass everything. A 10-step **guided tour** goes from a
supercar, which bottoms out on the jump and has no armour, to a mission-ready tumbler. On the
way it shows why steel armour makes crashes worse and why tall cars tip before they slide.

## Architecture

```
src/config/parts.ts   every part, constant and mission target
src/core/vehicle.ts   pure physics for every test (unit tested)
src/core/mission.ts   requirements, score and lessons
src/core/tour.ts      narrated tour over an actions interface
src/scene/            Three.js car model and night-city test ground with animations
src/main.ts           UI wiring
```
