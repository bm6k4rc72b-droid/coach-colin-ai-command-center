/** Every labelled part of the Roadster: what it does, key figures and the maths behind it. Pure. */
export type PartId = 'body' | 'roof' | 'battery' | 'motorFront' | 'motorsRear' | 'wheels' | 'brakes' | 'aero' | 'thrusters' | 'cabin';

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
    name: 'Carbon body shell',
    color: '#ff2b4e',
    short: 'A low, wide teardrop that has to slip through air at 250 mph.',
    body: 'At motorway speed, more than half the energy a car uses goes into pushing air aside, and the force grows with the square of speed. The power needed grows with the cube, so a slippery shape matters most at the top end. A low frontal area and a long tapering tail keep the wake small.',
    facts: [
      ['Length · width · height', '≈ 4.2 × 2.0 × 1.1 m (est.)'],
      ['Drag coefficient Cd', '≈ 0.28 (assumed)'],
      ['Frontal area A', '≈ 1.9 m² (assumed)'],
      ['Drag at 70 mph', 'see live readout'],
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
    name: '200 kWh battery pack',
    color: '#22d3ee',
    short: 'Thousands of cells in the floor: the energy store and a structural part of the chassis.',
    body: 'The pack sits flat between the axles, which keeps the centre of mass low and the car stiff. Its job is twice as hard as an ordinary EV\'s. It must hold a huge amount of energy for range, yet also deliver close to a megawatt for a launch. Higher pack voltage means less current for the same power, and the heat lost in the pack\'s resistance falls with the square of the current.',
    facts: [
      ['Energy (announced)', '200 kWh'],
      ['Pack voltage', 'unannounced · ≈ 800 V assumed'],
      ['Cells (if 2170 format)', '≈ 11,400'],
      ['Cells (if 4680 format)', '≈ 2,100'],
      ['Original Roadster', '53 kWh · 6,831 × 18650 cells'],
    ],
    math: ['E = Σ cells · V_cell · Ah', 'P = V · I   →   I = P / V', 'heat = I² R   (½ the current → ¼ the heat)', 'C-rate = P / E   (1 MW from 200 kWh ≈ 5 C)'],
  },
  motorFront: {
    id: 'motorFront',
    name: 'Front motor',
    color: '#a78bfa',
    short: 'Drives the front wheels, so all four tyres can push.',
    body: 'An electric motor gives its full torque from zero rpm. Up to the base speed it is limited by current, which means constant torque. Above that it is limited by voltage, which means constant power, so the torque falls as speed rises. With a front motor the launch can use every tyre\'s grip, not just the rear pair\'s.',
    facts: [
      ['Motors in total', '3 (1 front · 2 rear)'],
      ['Drive', 'all-wheel'],
      ['Combined wheel torque (announced)', '10,000 N·m'],
    ],
    math: ['τ_wheel = τ_motor · G · η', 'F = τ_wheel / r', 'P = τ ω   (ω = v · G / r)'],
  },
  motorsRear: {
    id: 'motorsRear',
    name: 'Twin rear motors',
    color: '#c084fc',
    short: 'One motor per rear wheel: torque vectoring without a differential.',
    body: 'With one motor per rear wheel, the car can push the outside wheel harder in a corner and help the car turn. Under hard acceleration, weight shifts backwards, so the rear tyres carry more load and can take more torque.',
    facts: [
      ['Layout', 'one motor per rear wheel'],
      ['Benefit', 'torque vectoring'],
      ['Load transfer at 1.4 g', '≈ +23 % on the rear axle'],
    ],
    math: ['ΔN_rear = m · a · h / L', 'yaw moment M = (F_out − F_in) · track / 2'],
  },
  wheels: {
    id: 'wheels',
    name: 'Wheels and tyres',
    color: '#fbbf24',
    short: 'Four small contact patches carry every newton of the launch.',
    body: 'All the motors\' force has to pass through four patches of rubber, each about the size of a hand. A tyre can push at most μ times the load on it. If the motor asks for more, the wheel spins. That is why "0–60 mph in 1.9 s" is really a statement about tyres. It needs an average push of about 1.44 g, more than ordinary road tyres can give.',
    facts: [
      ['Tyre radius', '≈ 0.36 m (assumed)'],
      ['Grip μ (street tyre)', '≈ 0.9–1.1'],
      ['Grip μ (sticky track tyre)', '≈ 1.3–1.6'],
    ],
    math: ['F_max = μ · N = μ · (m g + downforce)', 'a_max = μ · g  (AWD, no aero)', 't(0→v) ≥ v / (μ g)'],
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
    name: 'Cold-gas thrusters (SpaceX package)',
    color: '#f472b6',
    short: 'Claimed option: rocket-style thrusters fed from a high-pressure tank.',
    body: 'Tesla said this option would replace the rear seats with a composite pressure vessel and fit about ten small cold-gas thrusters. Thrust does not depend on the tyres, so it can push acceleration past μg. The catch is the rocket equation: the gas runs out in about a second.',
    facts: [
      ['Status', 'claimed, not delivered'],
      ['Claimed 0–60 mph', '≈ 1.1 s'],
      ['Nitrogen cold gas Isp', '≈ 73 s (vₑ ≈ 716 m/s)'],
    ],
    math: ['F = ṁ · vₑ', 'burn time = m_gas · vₑ / F', 'Δv = vₑ · ln(m₀ / m₁)  (Tsiolkovsky)'],
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

export const PART_ORDER: PartId[] = ['body', 'battery', 'motorFront', 'motorsRear', 'wheels', 'brakes', 'aero', 'roof', 'thrusters', 'cabin'];

export const MILESTONES: [string, string][] = [
  ['2006', 'The original Roadster is unveiled: a lithium-ion sports car built on a Lotus Elise chassis.'],
  ['2008', 'Deliveries begin: 6,831 laptop-style cells, 53 kWh, 244 miles of range.'],
  ['2012', 'Production ends after about 2,450 cars.'],
  ['Nov 2017', 'Second-generation Roadster revealed with 1.9 s 0–60 mph and 620 miles of range as announced targets.'],
  ['Feb 2018', 'Falcon Heavy launches an original Roadster with "Starman" into orbit around the Sun.'],
  ['Today', 'The new Roadster\'s figures remain announced targets until customer cars are independently tested.'],
];
