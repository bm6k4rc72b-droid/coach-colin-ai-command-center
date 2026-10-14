# SUNFORGE — nuclear fusion in 3D

**Made by Colin Cook.**

An interactive 3D breakdown of a tokamak fusion reactor at ITER scale. Orbit a cutaway machine,
click every part to learn what it does, then take the controls and drive the plasma from cold
gas to breakeven, a burning plasma and ignition — using real fusion physics.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # reactivity, energy, power balance, stability limits, tour
npm run build
```

## What's in the 3D model

Each part from the classic tokamak diagram is a clickable 3D component with an explanation and
key numbers:

| Part | What it does |
| --- | --- |
| Toroidal plasma ring | D–T fuel at ~150 million °C, held by magnetism alone; particles follow helical field lines |
| Superconducting toroidal field coils | 18 D-shaped magnets making the 5.3 T field around the ring |
| Central solenoid | A transformer driving 15 MA through the plasma, twisting the field into helices |
| Poloidal field coils | Shape the plasma into a D and hold it in place |
| Vacuum vessel | Double-walled steel chamber at ultra-high vacuum |
| Blanket | Catches neutrons for heat and, in a power plant, breeds tritium from lithium |
| Divertor | Exhaust: takes heat and helium ash onto tungsten targets |
| Heating systems | Neutral-beam injector and radio-frequency antennas |
| Cryostat | Keeps the magnets at −269 °C |

Visuals: custom GLSL plasma with flowing helical striations, about 5,000 particles moving along the
magnetic field, flowing field lines, neutrons flying out to the blanket with green tritium-breeding
flashes, glowing divertor strike points, a pulsing neutral beam and RF waves, bloom
post-processing, a cutaway with glowing plasma cross-sections, and an exploded view.

## The physics

| Model | Where |
| --- | --- |
| D–T reactivity ⟨σv⟩ from the Bosch–Hale (1992) fit | `src/core/physics.ts` |
| Fusion, alpha, neutron power; bremsstrahlung + impurity/synchrotron radiation; transport loss 3nT/τ | `balance()` |
| Gain Q, ignition, Lawson triple product and the nτ-for-Q curves | `balance()`, `nTauForQ()` |
| Troyon beta limit and Greenwald density limit → disruption | `betaLimit()`, `greenwaldLimit()` |
| Mass defect (17.6 MeV) and the 3.5 / 14.1 MeV energy split from momentum | `massDefect()`, `energySplit()` |

The ITER design point comes out at about 500 MW of fusion power with Q ≈ 10–12; JET-like
conditions give Q < 1; a long confinement time reaches ignition. Profiles, fuel dilution and
impurity radiation are folded into a few labelled tuning constants, so this is a teaching model,
not a design code.

A 15-step guided tour walks through every part, the reaction, the road from cold gas to ignition,
a disruption and the exploded view.
