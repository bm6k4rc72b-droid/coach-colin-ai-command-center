# Flight Club — jet suit simulator (educational)

Fly an Iron Man-style jet suit. It weighs 200 kg with the pilot and has two boot jets that gimbal
fore and aft, plus two palm jets. The simulation uses real rigid-body physics and real
control software, simplified for teaching. The "arc reactor" energy source is the only
fictional part, and the app says so.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # physics, mixer, energy, PID, autopilot on every course, tour
npm run build
```

## What it teaches

| Topic | Where |
| --- | --- |
| Thrust vs weight, rigid-body dynamics, quaternion attitude | `src/core/flight.ts` |
| Thruster mixing: boot gimbal → pitch, palm differential → roll, palm gimbals → yaw | `mix()` in `flight.ts` |
| Momentum-theory fan power (P = F^1.5 / √(2ρA)), turbine fuel burn (TSFC) | `fanPower`, `energyRate` |
| Ground effect, drag, landing loads, G-LOC dose model | `step()` |
| PID with derivative-on-measurement and anti-windup; nested loops | `src/core/control.ts` |
| Three assist levels: torque, attitude, velocity + altitude hold | `Controller` |
| Guidance autopilot, correlated wind gusts (Ornstein–Uhlenbeck) | `src/core/courses.ts` |
| Step-response tuning lab with automatic diagnosis | `stepResponse()` |

Headline numbers: hovering needs 1 962 N of thrust. Twenty-four kilograms of kerosene gives
about 5 minutes of hover, while 24 kg of the best lithium cells gives about 90 seconds. Lifting a
person with fans takes more than 200 kW. Maximum thrust-to-weight is 3.3, so a real suit cannot
pull the g-forces seen in the films.

## Controls

W/S pitch, A/D roll, Q/E yaw, Space/Shift up and down, 1/2/3 assist level, R restart. On a touch
screen, use the two thumb sticks.

Educational fan project. It is not affiliated with any film, comic or jet-suit company.
