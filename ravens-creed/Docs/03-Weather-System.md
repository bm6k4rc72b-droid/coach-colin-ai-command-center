# Weather and Atmosphere: Implementation Plan

Code: [`RCWeatherTypes.h`](../Source/RavensCreed/Public/Weather/RCWeatherTypes.h) ·
[`RCWeatherSubsystem.h`](../Source/RavensCreed/Public/Weather/RCWeatherSubsystem.h) ·
[`RCWeatherSubsystem.cpp`](../Source/RavensCreed/Private/Weather/RCWeatherSubsystem.cpp)

## Goals

Weather is beautiful and readable, and it changes how you play: it lowers grip, hides you from guards, freezes you,
pushes your sail, decides whether a fire arrow lights thatch, and can kill you on an exposed summit.

## Model

```
            +----------------- seasons (World State clock: 4 x 12 days) -----------------+
            v                                                                            |
 Markov chain over weather types  --(target preset)-->  smoothstep blend over BlendHours |
 (per region data table, season weights, night-only rows)        |                       |
                                                                  v                      |
                                                    FRCWeatherState (live)               |
             +--------------------+---------------+-------------+-------------+----------+
             v                    v               v             v             v
      surface integration   rendering push   precipitation   lightning     gameplay queries
      wetness, snow cover   MPC + height fog Niagara at the  Poisson       grip, visibility, noise,
      (rain soaks, sun,     + clouds         player (shelter strikes,      cold, wind, sky exposure
      wind and warmth dry;                   aware)          targets tall
      snow below 1 C,                                        & conductive
      melts into wetness)                                    things
```

- **State** (`FRCWeatherState`): cloud coverage, precipitation (type + intensity), wind direction and speed, fog
  density, temperature offset, lightning rate, aurora, plus integrated surface wetness and snow cover.
- **Presets** (`FRCWeatherPreset` rows in a data table): target state, duration, blend time, season weights,
  transitions, night-only flag, region. Example rows for the Western Fjords:

| Row | Type | Cloud | Precip | Wind m/s | Fog | Temp offset | Lightning/min | Season weights (Sp,Su,Au,Wi) | Transitions |
|---|---|---|---|---|---|---|---|---|---|
| Fj_Clear | Clear | 0.2 | 0 | 4 | 0.01 | +2 | 0 | 1, 1.4, 0.8, 0.6 | Overcast 3, Fog 1, AuroraNight 1 |
| Fj_Overcast | Overcast | 0.8 | 0 | 7 | 0.03 | 0 | 0 | 1, 1, 1.2, 1 | Clear 2, Drizzle 2, Rain 1, Snow 1 |
| Fj_Fog | Fog | 0.7 | 0 | 1 | 0.25 | −1 | 0 | 1.2, 0.6, 1.5, 1 | Clear 1, Overcast 2, Drizzle 1 |
| Fj_Rain | Rain | 0.95 | 0.7 | 11 | 0.06 | −2 | 0 | 1.2, 1, 1.5, 0.4 | Overcast 2, Thunderstorm 1, Drizzle 1 |
| Fj_Storm | Thunderstorm | 1 | 0.95 | 18 | 0.08 | −3 | 4 | 0.8, 1.2, 1.3, 0.1 | Rain 3, Overcast 1 |
| Fj_Snow | Snow | 0.9 | 0.6 | 6 | 0.05 | −4 | 0 | 0.4, 0, 0.5, 2 | Overcast 2, Blizzard 1, Clear 1 |
| Fj_Blizzard | Blizzard | 1 | 1 | 24 | 0.15 | −9 | 0 | 0.1, 0, 0.2, 1.5 | Snow 3 |
| Fj_Aurora | AuroraNight | 0.1 | 0 | 2 | 0.01 | −5 | 0 | 0.8, 0.2, 1, 1.6 | Clear 2, Fog 1 (night only) |

- **Mission locks:** quests call `RequestWeather(Thunderstorm)` and `SetWeatherLocked(true)` (*The Drowned Oath* runs in
  a guaranteed storm). Dialogue effects can request weather (a völva's rite).

## Rendering

**Sky and clouds.** Sky Atmosphere + Volumetric Cloud. The cloud material reads `RC_Cloud` (coverage remap of the
weather map), `RC_WindX/Y/WindSpeed` (advection offset accumulated in the material via `Time`), and `RC_Rain` (darker,
lower bases). Lumen handles bounce; Volumetric Cloud shadows on the directional light dim the land under fronts.

**Fog.** Exponential Height Fog density from `FogDensity`; volumetric fog scattering raised with precipitation so rain
shafts read in torchlight. Local fog volumes for fjord mist banks.

**Wetness (every opaque master material).** `MF_Weather` adjusts base colour, roughness and normal:

```hlsl
// MF_Weather custom node (inputs: BaseColor, Roughness, Normal, WorldNormal, Porosity, PuddleMask, RC_* from MPC)
float wet = saturate(RC_Wetness * (1 - SnowMask));
// Porous surfaces (thatch, wood, earth) darken more; metal and polished stone darken less.
float darken = lerp(1.0, lerp(0.85, 0.55, Porosity), wet);
float3 color = BaseColor * darken;
// Water film: roughness drops toward 0.08 on up-facing surfaces, less on walls.
float upFacing = saturate(WorldNormal.z * 2 - 0.4);
float film = wet * lerp(0.4, 1.0, upFacing);
float rough = lerp(Roughness, 0.08, film);
// Puddles: vertex-painted or height-derived mask, filled as wetness rises past 0.4.
float puddle = saturate((PuddleMask - (1 - wet) * 1.2) * 4) * upFacing;
rough = lerp(rough, 0.02, puddle);
color = lerp(color, color * 0.6, puddle);
// Rain ripples in puddles: animated flipbook normal blended by RC_Rain.
float3 n = lerp(Normal, RippleNormal, puddle * RC_Rain);
```

**Snow accumulation.** Up-facing mask `saturate((WorldNormal.z - 0.55) * 4) * RC_Snow`, broken up by world-space noise
and blocked under roofs via a top-down "sky occlusion" render target baked per streaming cell (an orthographic depth
capture from above, refreshed when the cell loads). Snow material layer: subsurface white, sparkle, and Nanite
displacement (UE 5.4 tessellation) for depth on terrain. Footprints: a render-target trail around the player and NPCs.

**Wind on everything.**
- Foliage: `RC_WindX/Y/WindSpeed` drive the shared pivot-painter wind function, so trees bend toward the actual wind.
- Cloth (cloaks, furs, banners, sails): a `UWindDirectionalSourceComponent` updated from `GetWindAt` around the player
  each tick, plus per-component Chaos Cloth wind for sails (below).
- Particles: Niagara rain/snow receive `User.Wind`, so rain slants and snow streams.

**Precipitation.** Niagara systems attached above the player: GPU sprites, depth-buffer collision for splashes, a
`User.Sheltered` switch that swaps streaks for drips under eaves. Puddle splashes and dripping eaves are spawned from
the same intensity.

**Lightning and thunder.** A Poisson process (`LightningPerMinute`) picks strike points biased to tall, exposed,
conductive actors (tag `Conductive`: masts, spear racks, armoured warriors on summits). The bolt is a Niagara ribbon;
`RC_Lightning` flashes the sky and clouds; a short-lived directional light pulse lights the scene. Thunder plays after
`distance / 343 m/s`. Flashes are capped (default three per second) for photosensitivity.

**Aurora.** Night-only presets drive `RC_Aurora`, read by the sky material: two scrolling curtain layers sampled from
a 3D noise volume, tinted green to violet, masked to high elevation, with a faint reflection in still water.

**Seasons.** World State's season and progress drive foliage colour (a seasonal LUT in the foliage material), snow
line height, daylight length (sun angle by latitude per region), and the temperature baseline.

## Gameplay

| Weather effect | System | Implementation |
|---|---|---|
| Slippery rock and decks | Parkour, combat | `GetSurfaceGrip()`: climbing stamina drain scales by 1/grip; slip checks at low stamina; dodges slide further |
| Ice | Parkour | `Ice` tag or ice physical material → grip ≤ 0.3; requires an axe-hook upgrade to climb |
| Rain and wind mask sound | Stealth, AI | `GetNoiseMultiplier()` scales hearing range; pickpocket chance improves |
| Fog, rain, blizzard, night | AI sight, Raven Sight | `GetVisibilityMultiplier()` (floored at 0.25 for readability); Raven Sight pierces half of the loss |
| Cold | Survival | `GetColdDamagePerSecond(insulation, sheltered, nearFire)`: wind chill and wet clothes; fur gear, fires and roofs counter it |
| Lightning | Hazard, tactics | Strikes damage and knock climbers off walls; can be lured onto a target on a tower (*The Drowned Oath*) |
| Fire | Combat, raids | Fire arrows and torches call `IRCFlammable::TryIgnite(wetness)`: soaked thatch refuses to burn |
| Sailing | Ships | Sail force from `GetWindAt` (below); storms raise waves and capsize risk; fog hides raiders |
| NPC routines | Social | Outdoor schedule entries lose utility with precipitation and wind; non-duty NPCs seek shelter and hearths |
| Dialogue | Narrative | `WeatherIs` conditions; omen lines; NPCs comment on storms |
| Navigation | Exploration | Overcast hides the sun-stone compass; aurora nights show the north |

**Sail force (sample).**

```cpp
// ARCLongship::TickSailing: apparent wind on the sail, lift/drag split by trim.
const FVector TrueWind = Weather->GetWindAt(GetActorLocation());             // m/s
const FVector Apparent = TrueWind - GetVelocity() / 100.f;                    // m/s, relative to the hull
const FVector SailNormal = SailComponent->GetForwardVector().GetSafeNormal2D();
const float Angle = FMath::Acos(FMath::Clamp(FVector::DotProduct(-Apparent.GetSafeNormal2D(), SailNormal), -1.f, 1.f));
const float Lift = FMath::Sin(2.f * Angle) * LiftCoefficient;                // best around 45 degrees
const float Drag = FMath::Square(FMath::Cos(Angle)) * DragCoefficient;       // running before the wind
const float Q = 0.5f * 1.225f * Apparent.SizeSquared() * SailArea * SailTrim; // dynamic pressure (N)
const FVector Force = (Apparent.GetSafeNormal2D() * Drag + FVector::CrossProduct(FVector::UpVector, Apparent.GetSafeNormal2D()) * Lift) * Q;
HullBody->AddForce(FVector::VectorPlaneProject(Force, FVector::UpVector) * 100.f); // to UU (cm)
```

## Performance budgets (PS5, 60 fps mode)

| Item | Budget |
|---|---|
| Volumetric clouds | ≤ 1.2 ms (half-res, temporal reprojection) |
| Precipitation particles | ≤ 0.4 ms, ≤ 60k GPU sprites |
| Weather subsystem tick | ≤ 0.05 ms game thread. The current code traces sky exposure every call; caching per 2 m cell for 1 s is the planned optimisation |
| Snow occlusion captures | On cell load only; async |
| Lightning | One strike per frame maximum; light pulse ≤ 0.2 ms |

## Phases

1. **Slice:** fjord presets, wetness and snow layers in master materials, rain/snow Niagara, lightning with damage and
   ignition, wind on foliage and cloaks, gameplay queries wired into parkour, stealth and cold.
2. **Alpha:** volumetric cloud authoring per region, aurora, footprints, sails, AI shelter routines, photo-mode weather.
3. **Beta:** seasonal LUTs, ice climbing, blizzard navigation, ship storms, accessibility pass.
