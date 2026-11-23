# Raven's Creed: Saga of the North — Game Design Document

Version 0.1 · Vertical-slice planning draft · Target: Unreal Engine 5.4+ (PC, PS5, Xbox Series X|S)

> One-line pitch: a Norse shadow-walker climbs, stalks and fights through Viking-Age Scandinavia, the North Sea and Anglo-Saxon
> England, where every person remembers what you did, every choice bends the saga, and the storm itself is an opponent.

## Contents

1. [Vision and pillars](#1-vision-and-pillars)
2. [Setting and timeline](#2-setting-and-timeline)
3. [Protagonist](#3-protagonist-bjorn-vargrsson)
4. [Story outline](#4-story-outline)
5. [Companions](#5-companions)
6. [Factions and reputation](#6-factions-and-reputation)
7. [Alignment: the four winds](#7-alignment-the-four-winds)
8. [Quest structure and key branch points](#8-quest-structure-and-key-branch-points)
9. [Endings](#9-endings)
10. [Core gameplay systems](#10-core-gameplay-systems)
11. [Open world](#11-open-world)
12. [Social simulation (summary)](#12-social-simulation-summary)
13. [Weather as gameplay (summary)](#13-weather-as-gameplay-summary)
14. [Progression and economy](#14-progression-and-economy)
15. [UI, camera and photo mode](#15-ui-camera-and-photo-mode)
16. [Audio](#16-audio)
17. [Accessibility](#17-accessibility)
18. [Business model, scope and risks](#18-business-model-scope-and-risks)

Companion documents: [systems architecture](02-Systems-Architecture.md) · [weather](03-Weather-System.md) ·
[social simulation](04-Social-Simulation.md) · [sample quest](05-Sample-Quest-The-Drowned-Oath.md) ·
[art direction](06-Art-Direction.md) · [roadmap](07-Roadmap.md)

---

## 1. Vision and pillars

**Fantasy.** You are the raven in the rafters: the shadow that ends a feud before it starts, or starts one on purpose. The
North is beautiful and indifferent: fjords under aurora, mud-and-thatch towns in driving rain, stave halls lit gold
against black storms.

| Pillar | What it means in play | Test of success |
|---|---|---|
| **Total NPC reactivity** | ~600 named NPCs with schedules, relationships, memories and opinions. Anyone can be talked to, followed, robbed, recruited, betrayed or killed, and the world remembers. | A player kills a minor smith; three days later his brother refuses to trade, his widow moves town, and a rumour reaches the jarl. |
| **Branching saga** | Every quest outcome writes world flags. Four alignment axes, six companions with approval and loyalty arcs, 8 major endings with dozens of ending-slide variations. | Two players compare notes and find different companions, different kings alive and different towns standing. |
| **Shadow, steel and stone** | Fluid parkour on cliffs, ruins and rigging; social stealth; assassination; weighty open combat; sailing and boarding; raids and settlement building. | Any objective can be solved by stealth, by open battle, or by talking. |
| **The storm is a character** | Volumetric weather, wet and snowy surfaces, wind on cloth, sails and grass, lightning that starts fires, blizzards that blind guards, aurora nights. Weather changes stealth, traversal, navigation, AI and dialogue. | Players wait for rain to rob a hall, or lure a target onto a tower during a thunderstorm. |

**Tone.** Saga realism with a thread of the uncanny: seiðr visions, a raven that may be more than a bird, the gods
ambiguous. Violence has weight and consequence. Humour lives in skaldic insults and companions' banter.

**Comparable experiences.** Open-world historical action-RPGs for traversal, stealth and combat; classic party-based
RPGs for companion arcs, alignment and ending slides; survival games for weather pressure (lighter touch).

## 2. Setting and timeline

The saga runs **870–878 CE**, from the Great Heathen Army's hold on Jórvík (York) to the battle at Edington, with a
prologue in **862** in Norway. Historical anchors (real events and rulers) frame the story; the hidden-order conflict is
fiction woven between the lines of the chronicles.

| Year | History | Saga |
|---|---|---|
| 862 | Petty kingdoms of Norway contest for power | **Prologue.** Skaldby burns; a boy with a raven-brand survives |
| 866–867 | The Great Army takes York | Act I begins in 870 with the Army entrenched in Jórvík |
| 871 | Alfred becomes king of Wessex | Act II: the Wessex court and Mercian intrigue |
| 874 | Mercia's king Burgred flees to Rome | The Circle's silver debts surface in Mercia |
| 878 | Alfred's winter at Athelney, victory at Edington | Act III climax; the treaty that splits England, or doesn't |

**Fiction layer.**
- **The Raven Wardens (Hrafnvǫrðr).** A secret order sworn to keep power from pooling in too few hands: "No hoard
  without a hand to break it." Members keep their oath through stealth, silver-cutting and, when needed, a knife. Their
  sign is a stylised raven.
- **The Gullbrand Circle (Circle of the Golden Brand).** Jarls, abbots, moneyers and merchants who bind kings with silver
  debt and broker wars so that both sides owe them. They wear a hidden ring branded with a sun-wheel.

## 3. Protagonist: Bjorn Vargrsson

| | |
|---|---|
| **Age** | 34 at Act I |
| **Origin** | Skaldby, a fjord village in western Norway |
| **Role** | Infiltrator, assassin, reluctant leader |
| **Weapons** | Hidden Fang (wrist-seax), Dane axe, seax, bow, round shield |
| **Look** | Shaved sides, braided crown, rune tattoos on brow and cheek, wolf-fur mantle over dark leather and riveted plates, gold-tooled bracers, raven embroidered on the cloak's back |

**Mysterious past.** At eight, Bjorn was found in the ash of Skaldby's great hall, the only survivor, with a raven
branded on his wrist and no memory of the night. The Wardens' Norway cell raised him. He has *Raven Sight*: flashes of
seiðr vision that show heat, intent and old blood. The saga reveals, in layers:
1. Skaldby was burned by the Gullbrand Circle (Act I).
2. The Warden who carried him out, his mentor **Ingvar Grey-Hood**, was the one who betrayed Skaldby's location (Act II).
3. Bjorn's father was **Hálfdan Silfrhandr**, founder of the Circle's northern ring, who branded his own son to hide
   him among the Wardens as a future weapon (Act III). Bjorn can embrace, reject or exploit this inheritance.

**Voice and expression.** Dialogue tones are mapped to the four winds (Section 7): *Oath* (honest, direct), *Shadow*
(misdirection), *Rune* (reverent, prophetic) and *Crown* (ambitious, commanding). The player chooses intent, not
paraphrase traps: choice text says what Bjorn will do.

## 4. Story outline

**Prologue: Ash and Feather (862).** Playable as child-Bjorn during the burning of Skaldby (tutorial: hiding, climbing,
a first glimpse of Raven Sight). Hard cut to 870.

**Act I: The Oath-Breakers (870–871), Norway and the North Sea.**
Bjorn, now a Warden, returns to the fjords as Jarl **Eirik Brandson** calls a *thing* (assembly) at the cliff stave-hall
of **Valdrheim** to bind the clans for a summer fleet. A Circle agent plans to poison the oath-cup and start a feud
(sample quest: *The Drowned Oath*). The act ends with Bjorn sailing west, with or without the clans' fleet, carrying the
first proof that the Circle burned Skaldby.
- Key companions met: **Astrid Ravenmaid**, **Ulfhild the Völva**, **Kári Half-Troll**.
- Branch points: who rules the Hrafnsson clan; whether the fleet sails united, split, or under Bjorn's own banner.

**Act II: Silver and Salt (872–876), England.**
Jórvík under the Army, Lindisfarne's ruins, the Mercian court, Wessex. Bjorn hunts the Circle's "Five Rings" (one per
region), each a multi-path assassination contract with a social web around the target. He uncovers Ingvar's betrayal.
- Key companions: **Brother Aelfric** (monk and Wessex spy), **Eadgyth of Tamworth** (exiled Mercian archer),
  **Snorri Sly-Tongue** (skald and thief).
- Settlement: found **Hrafnsstead**, a Norse-English farmstead that grows with raids, trade and diplomacy.
- Branch points: the fate of Ingvar (kill, spare, exile, or keep him as a double agent); alliance with Wessex, the Army,
  or neither; who becomes king in Mercia (historical puppet, Eadgyth's claim, or a Circle stooge); Lindisfarne's relics
  (return, ransom or burn).

**Act III: The Storm-Crown (877–878), the Danelaw and Wessex.**
The Circle funds both sides of the coming war. The truth of Hálfdan comes out. A three-day storm (the "Wolf-Winter")
covers the climax: Chippenham's winter raid, Athelney's marshes, Edington.
- Branch points: Bjorn's choice about his father's ring; which companions stand with him; whether Edington becomes a
  rout, a treaty, or a massacre; whether the Wardens survive and in what form.

**Epilogue.** Ending slides (Section 9) per region, companion and settlement, then free roam in the resulting world state.

## 5. Companions

Each companion has approval (−100..100), a loyalty quest, at least one point of no return, and can die, leave, betray,
or be romanced (Astrid, Aelfric, Eadgyth, Ulfhild; all optional, all player-initiated).

| Companion | Archetype | Leans toward | Loyalty quest | Breaks with Bjorn if… |
|---|---|---|---|---|
| **Astrid Ravenmaid** | Shield-maiden, Warden initiate | Honor, Glory | *The Shield Unbroken*: avenge her sister's oath-breaker in single combat, or not | Bjorn murders unarmed men in front of her twice |
| **Ulfhild the Völva** | Seeress, keeper of storm-lore | Piety | *Nine Nights*: a vision quest during a blizzard | Bjorn desecrates a holy site of either faith |
| **Kári Half-Troll** | Berserker, comic and tragic | Glory, Ambition | *The Bear-Shirt*: cure or embrace his rage | Bjorn sells captives as thralls |
| **Brother Aelfric** | Monk, Wessex spy | Cunning, Piety | *Ink and Iron*: steal back a forged charter | Bjorn burns Lindisfarne's relics |
| **Eadgyth of Tamworth** | Exiled thegn's daughter, archer | Honor, Ambition | *The Rightful Hall*: retake her father's hall | Bjorn crowns the Circle's Mercian stooge |
| **Snorri Sly-Tongue** | Skald, pickpocket, liar | Cunning | *A Saga Worth Stealing*: a heist in Jórvík's mint | Bjorn is "too honest" for too long (Honor > 70 and Cunning < 0) |

Companions react in real time (banter, approval toasts in subtitles, camp conversations), argue with each other
(Astrid and Snorri; Ulfhild and Aelfric), and remember the same world events NPCs do.

## 6. Factions and reputation

Faction reputation (−100..100) is derived from the opinions of member NPCs plus faction-level events (raids, treaties,
murders of leaders). It gates trade prices, safe passage, quest givers, guard behaviour and endings.

| Faction | Region | Wants | Hostile when |
|---|---|---|---|
| **Clan Hrafnsson** (Bjorn's adoptive clan) | Western fjords | Land, honour, a fleet | Oaths broken in their hall |
| **The Ylfings** (Jarl Sigrid Ironhair) | Northern fjords | Revenge for an old feud; the sea-lanes | Hrafnsson favoured over them |
| **The Great Army in Jórvík** | Northumbria | Silver, land, a crown in the Danelaw | Bjorn sides with Wessex openly |
| **Kingdom of Wessex** (King Alfred) | Wessex | Survival, then reconquest | Bjorn raids churches in Wessex |
| **Mercia** (court of Tamworth) | Midlands | A king who isn't a puppet | The Circle's stooge is exposed or killed, depending on the court faction |
| **The Church** (monasteries, bishops) | England | Relics, souls, silver | Desecration, relic theft |
| **Raven Wardens** | Hidden, everywhere | Break hoards of power | Bjorn joins the Circle |
| **Gullbrand Circle** | Hidden, everywhere | Debt and control | Always, unless Bjorn joins |
| **Wolf-heads** (outlaws) | Forests, marsh | Survival | Bjorn hunts outlaws for bounties |

## 7. Alignment: the four winds

Four independent axes, each −100..100, shift with dialogue, quest outcomes and witnessed acts. They are not good vs. evil:
each extreme has strengths, unlocks and costs.

| Axis | + pole | − pole | Typical + acts | Typical − acts |
|---|---|---|---|---|
| **Honor** (Oath) | Oathkeeper | Oathbreaker | Keep your word, fight openly, spare the yielded | Break oaths, kill guests, frame innocents |
| **Cunning** (Shadow) | Night-Fox | Open Blade | Misdirection, unseen kills, forged letters | Announce yourself, brute force |
| **Piety** (Rune) | God-Touched | Godless | Honour the gods (Old Way or Christ), heed omens | Desecrate, mock seers, ignore omens |
| **Ambition** (Crown) | Ring-Giver | Wanderer | Take power, titles, land, silver | Refuse rewards, give power away |

**Effects.**
- **Dialogue gates.** Options locked behind thresholds are shown greyed with their requirement ("[Shadow 40]"), so
  players see the road not taken.
- **Perks.** Each pole unlocks a perk line: Oath (allies rally, shield-wall bonuses), Shadow (longer Raven Sight,
  pickpocket and assassination bonuses), Rune (omens: weather foresight, seiðr abilities), Crown (settlement income,
  larger warbands).
- **World reaction.** Titles appear in NPC greetings ("the Night-Fox comes"), guards profile you, and skalds compose
  verses about your highest axis.
- **Endings.** The two dominant axes plus key flags select the major ending (Section 9).

Diminishing returns near the extremes keep players from maxing an axis by grinding. Hidden acts only shift alignment
if witnessed by a companion, a god-sign event (Piety), or discovered later through the social simulation.

## 8. Quest structure and key branch points

**Quest types.** Main saga (≈30 quests), companion loyalty (6), Ring contracts (5 multi-path assassinations), regional
stories (≈60), settlement and raid events, world events (≈120, emergent from social simulation and weather), and skald
sagas (collectible lore told back to you differently based on your deeds).

**Branch philosophy.**
- Every quest has at least three resolution styles (Oath, Shadow, plus Rune or Crown), and at least one consequence
  that appears outside the quest (a flag read by another quest, an NPC reaction, a slide).
- Failure is a branch, not a game over: if the target escapes, the story continues with consequences.
- Points of no return are telegraphed with a raven-feather icon on the choice.

**Main saga branch points.**

| # | Quest | Branch point | Lasting consequence (examples) |
|---|---|---|---|
| 1 | *Ash and Feather* (prologue) | Hide or try to save your "sister" | Flashback variant; Piety +/− seed |
| 2 | *The Drowned Oath* | Expose, poison-swap, assassinate, exploit or read the omens (see [sample quest](05-Sample-Quest-The-Drowned-Oath.md)) | Clan peace or feud; Thorvald alive as double agent or dead; fleet size; Hild's fate |
| 3 | *Who Holds the Fjord* | Back Eirik, back his rival, or take the clan yourself | Ruler of Hrafnsson; Act I ending; companions Kári and Astrid approval |
| 4 | *Jórvík's Mint* | Steal the dies, ruin the Circle's coinage, or mint for yourself | Army reputation; Snorri recruitable; economy modifier |
| 5 | *The Relics of Lindisfarne* | Return, ransom, burn | Church reputation; Aelfric loyalty; Piety; ending slide |
| 6 | *The Grey-Hood* | Ingvar: kill, spare, exile, double agent | Warden survival; Act III intel; ending variant |
| 7 | *Tamworth's Empty Throne* | Crown Eadgyth, the Circle's stooge, or nobody | Mercia's fate in 6 slides; Eadgyth's path |
| 8 | *Winter at Chippenham* | Warn Alfred, aid the raid, or rob both | Wessex survives or falls; treaty availability |
| 9 | *Silfrhandr* | Your father's ring: take, destroy, or wear it falsely | Selects Circle endings; Ulfhild's vision path |
| 10 | *Edington* | Battle outcome: rout, treaty, massacre, or vanish before battle | Final ending selection |

## 9. Endings

The ending selector reads the two dominant alignment axes, the state of the Wardens and the Circle, and 12 key world
flags. Each major ending is followed by 10–20 slides (regions, companions, settlement, notable NPCs), giving hundreds of
combinations.

| # | Ending | Main conditions | Summary |
|---|---|---|---|
| 1 | **The Saga-Bearer** | Honor + Piety dominant; Wardens survive; Circle broken | Bjorn returns to Skaldby, rebuilds the hall; the Wardens step into the light as a law-assembly; skalds sing him as a hero |
| 2 | **The Shadow King** | Cunning + Ambition; Circle's network captured, not destroyed | Bjorn rules Jórvík from behind a puppet; the North prospers under fear; Astrid leaves |
| 3 | **The Hanged One's Chosen** | Piety dominant; Ulfhild's *Nine Nights* completed; storm ritual chosen | Bjorn gives himself to the storm to end the Wolf-Winter; companions carry his legend; aurora slide |
| 4 | **The Iron Crown** | Honor + Ambition; won Edington openly | Bjorn becomes king of a Danelaw kingdom by open war; just but feared |
| 5 | **The Last Warden** | Cunning + Honor; Wardens destroyed but Circle broken | Bjorn vanishes into legend, a single raven over every throne; the order survives in one man |
| 6 | **The Gilded Chain** | Joined the Circle; wore the ring truly | Bjorn becomes master of the Circle; England and the North bound in debt; companions dead or gone |
| 7 | **Peace of the Two Shores** | Alfred alive; treaty path; Mercia not a puppet; Army reputation > 0 | A border by agreement, not blood; Hrafnsstead becomes a market town of both peoples |
| 8 | **Ragnarök of Silver** | Betrayed both orders; burned the Circle's hoard; low Honor | Silver burns, kings starve, war without end; Bjorn sails west alone into the storm |

**Variations.** Each companion has 3–5 slide states (alive and loyal, alive and estranged, dead, betrayed, romanced).
Regions have 3–4 states (Mercia, Northumbria, Wessex, the fjords). The settlement has 4 tiers. Notable NPCs whose fate the
player changed get a line each. Ending music and the final skald verse are assembled from the dominant axis.

## 10. Core gameplay systems

### 10.1 Traversal and parkour
- Free-climbing on rock, timber walls and ship rigging; ledge shimmy, corner wrap, back-eject, jump-to-handhold.
- Vault, mantle, slide, short wall-run, beam balance, rope traversal (zip down mooring ropes).
- **Raven's Plunge:** a dive from synchronisation points into water, hay or snowdrifts.
- **Weather:** wet rock lowers grip (slip events at low stamina), ice requires an axe-hook, wind pushes on high ledges,
  snow muffles landings.
- **Stamina** drains while climbing; resting points (ledges) restore it.
- Implementation: `URCParkourComponent` plus motion warping (see [architecture](02-Systems-Architecture.md)).

### 10.2 Stealth
- Social stealth: blend with crowds, sit on benches, carry goods, hood up. Disguise via borrowed clothing.
- Light, sound and weather: rain and wind mask footsteps; fog and blizzards shorten guard vision; snow leaves
  footprints guards can follow; wet torches gutter.
- Detection is per NPC, with three stages (curious, searching, combat), shared through the social simulation as rumours
  and alarms.
- **Raven Sight:** a pulse that marks targets (gold), threats (red), allies (blue), loot (white); reveals heat and
  footprints; pierces fog partially; Rune perks show NPC intentions and the next weather shift.
- Assassinations: ground, ledge, air, from hiding, chained double kills; non-lethal takedowns; Hidden Fang has a
  quiet "silent drown" variant in water.

### 10.3 Combat
- Weighty, readable melee: light and heavy chains, parry (perfect-parry window), shield block and shield bash, dodge
  with i-frames, stamina and poise (stagger when broken), finishers.
- Weapon families: Dane axe (two-handed, reach and shield-breaking), seax (fast, bleed), dual axes, spear (reach, sweep),
  sword (rare, prestige), bow (draw strength, fire arrows unless raining), throwing axes. Shields splinter.
- Group AI: enemies coordinate (surround, shield-wall, archers on high ground, flankers). Utility AI decides when to
  rout, call for help or surrender (morale reacts to leader deaths, Bjorn's reputation, weather and fire).
- Weather: rain extinguishes fire arrows and burning oil; mud slows heavy fighters; slippery ground lengthens dodges and
  risks falls; lightning strikes can scatter shield-walls.

### 10.4 Sailing, boarding and raids
- Longship sailing with true wind: sail trim, oars for calm, storms that break formations; crew morale and fatigue.
- Boarding: grapples, leap between ships, fight on wet, pitching decks.
- Raids on monasteries, Circle warehouses and enemy halls, with choices about burning, sparing, taking thralls (reputation
  and Piety costs) or freeing captives (recruits).

### 10.5 Settlement: Hrafnsstead
- Build and upgrade 18 buildings (longhouse, smithy, seer's hut, docks, mead hall, scriptorium, stables, watchtowers).
- Residents arrive from quest outcomes (spared NPCs, recruited companions, freed thralls) and carry their memories with
  them. A smith whose brother you killed may still come, and still hate you.
- Feasts and the *thing*: settle disputes among residents (mini dialogue cases with alignment shifts).

### 10.6 Large-scale battles
- Set-piece battles (Valdrheim cliffs, Chippenham, Edington) using Mass AI for crowds plus hero-level AI for ~40 nearby
  combatants; objectives inside battles (assassinate a commander, fire the supply carts, hold a ford).

## 11. Open world

| Region | Size (km²) | Signature locations |
|---|---|---|
| **The Western Fjords** (Norway) | 22 | Skaldby ruins; Valdrheim stave hall on its sea-cliff; Hrafnfell cliff-fortress with timber stairways; Ylfing longhouses |
| **The North Sea** | Sailing layer | Storm banks, skerries, Orkney waypoint, ghost-ship encounters |
| **Northumbria** | 18 | Jórvík (dense town), Lindisfarne, Bamburgh coast, the Wolds |
| **Mercia** | 14 | Tamworth hall, Repton winter camp, river forts |
| **Wessex** | 16 | Winchester, Chippenham, Athelney marshes, Edington down |
| **Hrafnsstead** | 2 | Player settlement on a Northumbrian river |

Streaming uses World Partition with data layers per world state (a burned village is a data layer swap, not a separate
map), HLODs for vistas, and Nanite for rock and architecture. Settlements are dense (Jórvík: ~300 simulated NPCs, of
which ~60 fully animated near the player).

## 12. Social simulation (summary)

Every named NPC has: identity, faction, family and friendship bonds, personality traits (bravery, greed, morality,
gossip), needs, a daily schedule, opinion/trust/fear of Bjorn, and a memory list of events they witnessed or heard.
Events (murder, theft, kindness, broken oaths) spread through bonds as rumours with decay. Deaths leave holes that
schedules, shops and quests adapt to. Full design: [04-Social-Simulation.md](04-Social-Simulation.md).

## 13. Weather as gameplay (summary)

A procedural weather state machine per region and season drives volumetric clouds, precipitation, fog, wind, lightning
and aurora, plus surface wetness and snow accumulation shared with every material. Gameplay reads the same state:
grip, visibility, noise masking, cold exposure, sailing wind, fire behaviour and NPC routines. Full design:
[03-Weather-System.md](03-Weather-System.md).

## 14. Progression and economy

- **Skill trees:** three trees aligned with play styles (Raven: stealth and traversal; Wolf: combat; Bear: survival and
  leadership) plus alignment perks (Section 7). No level gates on story; regions have power recommendations.
- **Gear:** armour sets with weather traits (wool: warmth; waxed leather: rain; furs: cold; mail: noisy), and weapon
  runes. Visual wear and wetness on gear.
- **Economy:** hacksilver by weight; regional prices react to raids, Circle coin manipulation (*Jórvík's Mint*) and
  faction reputation.

## 15. UI, camera and photo mode

- Minimal diegetic HUD: health and stamina as a rune-ring, objectives through Raven Sight markers, compass optional.
- Dialogue wheel by tone (Oath, Shadow, Rune, Crown) plus specific text; locked options shown with requirements.
- Cinematic camera: spring-arm third person with collision, context framing in tight spaces, dynamic framing in
  conversations (shot/reverse-shot with over-the-shoulder), Sequencer for authored moments.
- **Photo mode:** free camera within a radius, focal length, aperture and focus distance, exposure, filters, time of day
  and weather override (clouds, rain intensity, aurora), character poses, hide HUD.

## 16. Audio

- Adaptive score: tagelharpa, frame drums and throat singing; layers by tension, region and weather.
- Weather audio: rain on different surfaces (thatch, stone, water, sail), wind howl by exposure, thunder delayed by
  distance (speed of sound), blizzard ducking.
- Voice: ~40,000 lines; Old Norse and Old English phrases with subtitles; dialogue nodes carry voice-line IDs.

## 17. Accessibility

Subtitles with speaker names and size options; colour-blind-safe Raven Sight palettes; aim and parry assist; QTE-free
assassinations; motion-sickness options (camera shake, head bob, FOV); full remapping; a "storm intensity" slider for
players sensitive to flashes (lightning flashes are capped by default at three per second).

## 18. Business model, scope and risks

- **Model:** premium game; cosmetic-free base; later story expansions (Iceland, Paris siege).
- **Biggest risks and mitigations:**

| Risk | Mitigation |
|---|---|
| Combinatorial explosion of branches | World-flag ledger with a consequence matrix tool; each branch must converge into a defined world state; automated playthrough tests on flag graphs |
| Social simulation cost | Level-of-detail simulation (full near the player, abstract hourly ticks elsewhere); Mass AI for crowds |
| Weather breaking readability | Accessibility sliders; gameplay caps (minimum visibility), designer weather locks for critical missions |
| Voice cost of reactivity | Systemic barks keyed by memory kind and disposition; narrative designers write templates, not every permutation |
| Scope | Vertical slice first (see [roadmap](07-Roadmap.md)): one region, one hall, one full branching quest, all four pillars proven |
