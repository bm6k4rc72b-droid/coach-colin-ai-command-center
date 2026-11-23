# NPC Interaction and Social Simulation

Code: [`RCSocialTypes.h`](../Source/RavensCreed/Public/Social/RCSocialTypes.h) ·
[`RCSocialSubsystem`](../Source/RavensCreed/Private/Social/RCSocialSubsystem.cpp) ·
[`RCNPCComponent`](../Source/RavensCreed/Private/Social/RCNPCComponent.cpp) ·
[`RCNPCCharacter`](../Source/RavensCreed/Private/Social/RCNPCCharacter.cpp)

> **Implemented in code:** records, personality, bonds, opinion/fear/trust, memories, witnesses, rumours, decay,
> deaths and vengeance flags, faction reputation, schedules and utility choice, the interaction menu and pickpocketing.
> **Designed, not yet coded:** Mass-entity tiers, bark templates, and NPCs moving home after a death.

## What every named NPC has

| Data | Where | Notes |
|---|---|---|
| Identity: id, name, faction, home region | `FRCNPCRecord` | Persistent, saved |
| Personality: bravery, greed, morality, gossip, piety (0..1) | `FRCPersonality` | Weights every reaction and AI score |
| Bonds: kin, spouse, friend, lord, sworn, rival, enemy, with strength −1..1 | `FRCBond` | Drive grief, vengeance, rumour routes, approval of harm to others |
| Attitude to Bjorn: opinion (−100..100), fear (0..100), trust (0..100) | `FRCNPCRecord` | Disposition = Hostile, Wary, Neutral, Friendly, Devoted |
| Memories: what, who, to whom, when, intensity, first-hand or rumour | `FRCMemory` | Up to 48 per NPC, weakest forgotten first; grave acts never fully fade |
| Needs: hunger, rest, social, warmth, safety | `FRCNeeds` (live) | Utility layer |
| Schedule: hour blocks with activity and spot tag, winter variant | `URCScheduleAsset` | Designers author per archetype, override per NPC |
| Dialogue graph, silver, recruitable, essential-until flag | `URCNPCComponent` | Essential NPCs are knocked down, not killed, until their story flag clears |

## Records vs. actors (simulation level of detail)

| Distance from player | Representation | Update |
|---|---|---|
| < 40 m | Full actor (`ARCNPCCharacter`), AI controller, behaviour tree, perception | Brain every 2 s, body every frame |
| 40–150 m | Actor with reduced tick, crowd animation, no perception | Brain every 5 s |
| Loaded cell, > 150 m | Mass entity (position, activity, schedule) | Schedule only |
| Unloaded region | Record only | Hourly: rumours, memory decay, deaths and moves from world events |

Promotion hydrates the actor from the record; demotion writes nothing (the record is already authoritative).

## Events, witnesses and memory

Anything socially meaningful calls `URCSocialSubsystem::ReportEvent(FRCSocialEvent)`: kills, harm, theft (successful or
failed pickpocket), threats, lies, broken oaths, desecration, help, gifts, mercy. Dialogue effects of type `Remember`
report events with the conversation partner as a guaranteed witness.

**Who sees it.** Live NPCs within `35 m × lerp(0.3, 1, severity)`, scaled by weather visibility (or by
`max(visibility, noise)` for loud acts such as killings), awake, facing the act (or within 4 m if behind), with a clear
line of sight.

**How they react.** Each witness forms a first-hand memory and adjusts opinion, fear and trust from a base table per act:

| Act | Opinion | Fear | Trust |
|---|---|---|---|
| Helped / Gifted / Spared / Defended / Kept oath | +10 / +8 / +12 / +15 / +8 | 0 to +4 | +3 to +15 |
| Insulted / Threatened | −6 / −8 | 0 / +12 | −2 / −5 |
| Stole / Lied / Broke oath | −12 / −6 / −15 | 0 to +4 | −15 / −20 / −30 |
| Harmed / Killed / Desecrated / Betrayed | −15 / −25 / −20 / −35 | +15 / +30 / +8 / +5 | −10 to −45 |

Harm is filtered through the witness's bond with the victim: harming someone they love multiplies outrage (up to 2×),
harming someone they hate flips the sign (an enemy of the victim approves). Moral NPCs judge harder, greedy NPCs shrug at
theft, pious NPCs are outraged by desecration, brave NPCs feel less fear.

## Rumours

Every in-game hour, each living NPC with a strong unshared memory about Bjorn tells bonded NPCs (chance =
gossip × bond strength). Rumours arrive at 60% intensity, enemies of the victim embellish harmful rumours (×1.4), and
each memory is passed on once. This runs on records, so news crosses regions with traders and kin even when nobody is
loaded. Overnight, trivial memories fade by 15% a day; killings, betrayals and broken oaths fade to a floor and stay.

## Deaths and ripples

`NotifyNPCKilled(victim, killer, witnessed)`:
- marks the record dead forever and writes `DEAD_<Id>` (and `KILLED_BY_PLAYER_<Id>` if the player did it);
- gives every NPC bonded ≥ 0.5 a grief memory (killer known only if witnessed);
- writes `VENGEANCE_<Id>` for brave kin who know the killer, which ambush encounters and quests read;
- frees the victim's schedule slots and shop; quests with `FailWhenAny: NPCDead` fail or branch; the settlement can
  adopt their household; ending slides drop or change their line.

## Interaction menu

`URCNPCComponent::GetInteractionOptions` returns what's possible right now:

| Option | Requirements | Outcome |
|---|---|---|
| Talk | Not hostile, has dialogue | Dialogue graph with memory-aware entry |
| Follow (tail) | Always | Stealth objective: stay in range, keep suspicion low |
| Pickpocket | Carries silver or pocket items | Chance from facing, sleep, rain noise, suspicion; failure is a public theft |
| Recruit | Recruitable and Friendly+ | Joins settlement or party |
| Bribe | Greed > 0.4 | Silver for opinion (trust drops slightly) |
| Intimidate | Bravery < 0.7 | Fear up, opinion down; may reveal information |
| Assassinate | Killable (not essential, or flag cleared), unaware, behind or above | Instant kill; social report |
| Trade | Merchants | Prices scale with opinion and faction reputation |

Betrayal is an effect, not a button: quests and dialogue grant a `Betrayed` memory when Bjorn breaks faith with someone
who trusted him (high trust makes the fall harder).

## Daily life

The utility layer runs every 2 s per brain:

```
score(planned activity) = 0.55 (0.75 if duty) x (1 - weather misery x (0.85, or 0.3 for duty)) [outdoor entries only]
score(Eat)              = hunger x 0.9
score(Sleep)            = rest^2 x 1.2
score(WarmByFire)       = warmth x 0.95
score(Flee)             = safety x (1.2 - bravery)
score(Shelter)          = weather misery x 0.7                    [if the planned activity is outdoors]
misery = clamp(precipitation x 0.7 + wind/40 + lightning/min x 0.1, 0, 1)
```

The winner's activity and spot tag go to the blackboard; behaviour trees move the NPC to the nearest free spot with that
tag and play the activity. A storm empties the market; guards stay at their posts, hunched; the hall fills up.

## Barks and reactivity without a voice-line explosion

Ambient lines are templates keyed by disposition, the strongest memory, the player's alignment title and the current
weather, e.g. `Bark.Wary.Killed.Kin` → "You killed my brother, raven. Walk on." Writers fill a table of templates; VO
records each template once per voice type.

## Worked example

Bjorn kills the Skaldby smith Orm in the rain at dusk, behind the forge.
1. `ReportEvent(Killed, victim Orm, severity 1)`: rain cuts sight range, but a kill is loud: noise wins, ~25 m. One
   apprentice sees it. He gets opinion −40 (he liked Orm), fear +25.
2. `NotifyNPCKilled(Orm, Player, witnessed)`: Orm's brother Ketil (bond 0.9) and widow Ragna (0.95) learn of the death;
   both know the killer through the apprentice's report, so Ketil gets `VENGEANCE_Ketil`.
3. Next hours: the apprentice (gossip 0.8) tells his friends; by the next day the hall knows. Hrafnsson reputation
   −12.5. Ragna's schedule changes to Mourn, then she moves to her sister in the next fjord (`HomeRegion` change).
4. Three days later: Ketil refuses trade, then ambushes Bjorn on the cliff path in a fog bank. Spare him (`Spared`, the
   feud can end) or kill him (Ragna's opinion hits the floor; a slide line follows).
