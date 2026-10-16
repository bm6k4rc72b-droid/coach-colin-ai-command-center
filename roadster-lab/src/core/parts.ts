/** Every labelled part of the Roadster: what it does, key figures and the maths behind it. Pure. */
export type PartId = 'body' | 'roof' | 'battery' | 'fans' | 'motorsRear' | 'wheels' | 'brakes' | 'aero' | 'thrusters' | 'cabin';

export interface Part {
  id: PartId;
  name: string;
  color: string;
  short: string;
  body: string;
  facts: [string, string][];
  /** The equations, one per line. */
  math: string[];
}

export const PARTS: Record<PartId, Part> = {
  body: {
    id: 'body',
    name: 'Ano White body',
    color: '#e5e7eb',
    short: 'Long, low and wedge-shaped, with sharp geometric surfacing.',
    body: 'The 2026 car shown on 15 October has sharper, faceted surfaces than the rounded 2017 prototype. Its paint, called "Ano White", is inspired by aerospace coatings. The glass is gold-tinted, after a spacesuit visor. At speed, more than half the energy goes into pushing air aside: drag grows with the square of speed, and the power to beat it with the cube.',
    facts: [
      ['Paint', 'Ano White (aerospace-coating inspired)'],
      ['Glass', 'gold-tinted, visor style'],
      ['Headlights', 'hidden slit · full-width tail bar'],
      ['Drag coefficient Cd', '≈ 0.25 (assumed)'],
    ],
    math: ['F_drag = ½ ρ Cd A v²', 'P_drag = F_drag · v = ½ ρ Cd A v³', 'double the speed → 4× the force, 8× the power'],
  },
  roof: {
    id: 'roof',
    name: 'Removable glass roof',
    color: '#7dd3fc',
    short: 'A targa panel that stows in the trunk: coupé or open roadster.',
    body: 'The roof is a single glass panel. Taking it off changes the airflow over the cabin. The open car has more drag, and a well-shaped windscreen header keeps the buffeting away from the occupants.',
    facts: [
      ['Type', 'Removable glass targa panel'],
      ['Seats', '2 + 2'],
      ['Open-top drag', 'higher Cd · A (more turbulence)'],
    ],
    math: ['ΔP = ½ ρ Δ(Cd A) v³', 'open roof ≈ +5–10 % Cd A on most roadsters'],
  },
  battery: {
    id: 'battery',
    name: 'Battery pack',
    color: '#22d3ee',
    short: 'A floor pack built to charge from 15 to 85 % in about 10 minutes.',
    body: 'Tesla did not give the pack size at the reveal, but it said 500 kW peak charging and 15→85 % in about 10 minutes. That alone bounds the pack. Moving 70 % of the energy in a sixth of an hour at no more than 500 kW means the pack can hold at most about 119 kWh. This model assumes 80 kWh, which matches the "over 300 miles" quoted. The 2017 car promised 200 kWh and 620 miles.',
    facts: [
      ['Charging (stated)', '500 kW peak · 15→85 % ≈ 10 min'],
      ['Pack bound from that claim', '≤ 119 kWh'],
      ['Assumed here', '80 kWh · 800 V'],
      ['Range (stated)', 'over 300 miles'],
    ],
    math: ['E ≤ P·t / ΔSoC = 500 kW × (10/60) h / 0.70 = 119 kWh', 'P = V · I   →   I = P / V', 'heat = I² R', 'C-rate = P / E'],
  },
  fans: {
    id: 'fans',
    name: 'Suction fans and ground seal',
    color: '#38e1ff',
    short: 'Fans pull air out from under the car, so the atmosphere presses it onto the road, or onto an upside-down ramp.',
    body: 'Tesla calls it a multi-mode fan and ground-sealing system. Fans pump air out from under the floor, and skirts seal the gap, so the pressure under the car drops below the air pressure above it. The difference times the floor area is a downforce that works even at walking pace, unlike wings, which need speed. It is the same idea as the 1970 Chaparral 2J and the 1978 Brabham BT46B "fan car". The 2026 car used it to stay stuck to an inverted ramp.',
    facts: [
      ['Pressure drop for 9 kN', '≈ 1.5 kPa (1.5 % of an atmosphere)'],
      ['Floor area (est.)', '≈ 6 m²'],
      ['Fan power (est.)', 'about 5–20 kW'],
      ['Precedent', 'Chaparral 2J (1970), Brabham BT46B (1978)'],
    ],
    math: ['F = ΔP · A_floor', 'leak flow Q = C·(perimeter·gap)·√(2ΔP/ρ)', 'fan power P = Q·ΔP / η'],
  },
  motorsRear: {
    id: 'motorsRear',
    name: 'Twin rear motors',
    color: '#c084fc',
    short: 'Rear-wheel drive: one motor per rear wheel, with torque vectoring.',
    body: 'The 2026 car dropped the 2017 car\'s front motor. The top trim was quoted at over 1,000 kW (1,341 hp), with about 1,400 N·m of motor torque. Rear drive means only two tyres push, so grip depends on the rear load. Acceleration shifts weight backwards, and suction adds more.',
    facts: [
      ['Power (stated)', '> 1,000 kW top trim · > 800 kW base'],
      ['Motor torque (reported)', '≈ 1,400 N·m'],
      ['Drive', 'rear-wheel, torque vectoring'],
    ],
    math: ['N_rear = (m g + F_suction)·w_r + m a h / L', 'F_max = μ · N_rear', 'yaw moment M = (F_out − F_in) · track / 2'],
  },
  wheels: {
    id: 'wheels',
    name: 'Wheels and tyres',
    color: '#fbbf24',
    short: 'Super-light thin-spoke wheels; every newton of the launch passes through two rear contact patches.',
    body: 'A tyre can push at most μ times the load on it. On rear tyres alone, with μ ≈ 1.5, about 1.5 g is the ceiling. The fans raise it by adding load without adding mass. Anything faster than that has to come from thrust, which does not go through the tyres at all.',
    facts: [
      ['Design', 'super-light, thin spokes'],
      ['Grip μ (assumed)', '≈ 1.5'],
      ['Tyre radius', '≈ 0.35 m (assumed)'],
    ],
    math: ['F_max = μ · N', 't(0→60) ≥ 26.8 m/s ÷ a', 'a = (F_tyres + F_thrust − drag) / m'],
  },
  brakes: {
    id: 'brakes',
    name: 'Brakes and regeneration',
    color: '#fb7185',
    short: 'Motors run backwards as generators; the discs handle the rest.',
    body: 'Slowing down turns kinetic energy back into something else. Regenerative braking turns some of it back into charge. The friction discs turn the rest into heat, which is why they glow on a hard stop from high speed. Stopping distance grows with the square of speed.',
    facts: [
      ['Energy at 250 mph', 'see live readout'],
      ['60–0 mph', 'see live readout'],
    ],
    math: ['KE = ½ m v²', 'd = v² / (2 μ g)', 'regen energy ≈ η · ½ m v²'],
  },
  aero: {
    id: 'aero',
    name: 'Active aero',
    color: '#34d399',
    short: 'A rear spoiler and underbody that press the car down at speed.',
    body: 'Downforce adds to the load on the tyres without adding mass, so grip rises with speed. It also adds drag, which is why the spoiler deploys only when it is needed.',
    facts: [
      ['Downforce coefficient ClA', '≈ 0.25 m² (assumed)'],
      ['Downforce at 150 mph', 'see live readout'],
    ],
    math: ['F_down = ½ ρ Cl A v²', 'corner speed v = √(μ g r / (1 − μ ρ ClA r / 2m))'],
  },
  thrusters: {
    id: 'thrusters',
    name: '10 compressed-air thrusters',
    color: '#f472b6',
    short: 'Ten cold-gas thrusters on a 600-litre compressed-air tank: launch, lift, roll and soften the landing.',
    body: 'Engineering VP Lars Moravy said the demo car used 10 thrusters fed from 600 litres of compressed air, rechargeable, developed with SpaceX. About 80 kN was reported from the rear ports. Cold gas means no fire: high-pressure air expands through a nozzle and the reaction pushes the car. Here: four rear thrusters for launch, four side thrusters that fire as couples to roll the car, and two underneath for lift and landing. The tank pressure was not disclosed; this model assumes 300 bar.',
    facts: [
      ['Thrusters (stated)', '10'],
      ['Tank (stated)', '600 L compressed air, rechargeable'],
      ['Rear thrust (reported)', '≈ 80 kN'],
      ['Air at 300 bar (assumed)', '≈ 214 kg'],
    ],
    math: ['m_air = p V / (R T)', 'vₑ = η √(2 cₚ T (1 − (pₐ/p)^((γ−1)/γ)))', 'F = ṁ · vₑ', 'Δv = vₑ · ln(m₀ / m₁)'],
  },
  cabin: {
    id: 'cabin',
    name: 'Cabin and occupants',
    color: '#e2e8f0',
    short: 'Four seats, and the people in them feel every g.',
    body: 'At 1.4 g you are pressed into the seat with 1.4 times your body weight. That is more than a jet airliner\'s take-off and close to a Formula 1 car\'s launch. Your head and neck feel it most.',
    facts: [
      ['Seats', '2 + 2'],
      ['Launch load on a 75 kg person', '≈ 1,050 N'],
      ['Airliner take-off', '≈ 0.3 g'],
    ],
    math: ['F_seat = m_person · a', 'g = a / 9.81 m s⁻²'],
  },
};

export const PART_ORDER: PartId[] = ['body', 'fans', 'thrusters', 'motorsRear', 'battery', 'wheels', 'brakes', 'aero', 'roof', 'cabin'];

export const MILESTONES: [string, string][] = [
  ['2006', 'The original Roadster is unveiled: a lithium-ion sports car built on a Lotus Elise chassis.'],
  ['2008', 'Deliveries begin: 6,831 laptop-style cells, 53 kWh, 244 miles of range.'],
  ['2012', 'Production ends after about 2,450 cars.'],
  ['Nov 2017', 'Second-generation Roadster prototype shown: 1.9 s 0–60 mph and 620 miles as announced targets.'],
  ['Feb 2018', 'Falcon Heavy launches an original Roadster with "Starman" into orbit around the Sun.'],
  ['15 Oct 2026', 'Production Roadster revealed in Texas: it drives up a curling ramp upside down on suction, rolls 180° in mid-air on compressed-air thrusters, lands on its wheels, and does 0–60 mph in 0.81 s live.'],
  ['2028', 'Production target given at the reveal. Price and road approval for the thruster car not yet announced.'],
];
