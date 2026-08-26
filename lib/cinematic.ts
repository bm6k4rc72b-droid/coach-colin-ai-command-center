/**
 * The cinematic vocabulary the Studio composes prompts from.
 * Each preset contributes a clause; the composer joins them in the order
 * a cinematographer would actually call them on set.
 */
export type Preset = { id: string; label: string; clause: string; note?: string };

export const SHOT_SIZES: Preset[] = [
  { id: "ecu", label: "Extreme close-up", clause: "extreme close-up", note: "Eyes, hands, texture" },
  { id: "cu", label: "Close-up", clause: "close-up shot", note: "Face fills frame" },
  { id: "mcu", label: "Medium close-up", clause: "medium close-up", note: "Chest up — interview default" },
  { id: "ms", label: "Medium", clause: "medium shot", note: "Waist up" },
  { id: "cowboy", label: "Cowboy", clause: "cowboy shot framed mid-thigh", note: "Mid-thigh up" },
  { id: "ws", label: "Wide", clause: "wide shot", note: "Full body in context" },
  { id: "ews", label: "Extreme wide", clause: "extreme wide establishing shot", note: "Landscape dominates" },
];

export const CAMERA_MOVES: Preset[] = [
  { id: "static", label: "Locked off", clause: "locked-off static camera on a tripod" },
  { id: "push", label: "Slow push in", clause: "slow dolly push in toward the subject" },
  { id: "pull", label: "Slow pull out", clause: "slow dolly pull back away from the subject" },
  { id: "track", label: "Tracking", clause: "smooth lateral tracking shot following the subject" },
  { id: "orbit", label: "Orbit", clause: "camera orbiting the subject in a slow arc" },
  { id: "crane", label: "Crane up", clause: "crane shot rising above the scene" },
  { id: "handheld", label: "Handheld", clause: "handheld camera with subtle organic sway" },
  { id: "steadicam", label: "Steadicam follow", clause: "steadicam following behind the subject" },
  { id: "whip", label: "Whip pan", clause: "fast whip pan with motion blur" },
];

export const LENSES: Preset[] = [
  { id: "14", label: "14mm ultra-wide", clause: "shot on a 14mm ultra-wide lens with pronounced perspective" },
  { id: "24", label: "24mm wide", clause: "shot on a 24mm wide lens" },
  { id: "35", label: "35mm documentary", clause: "shot on a 35mm lens, documentary feel" },
  { id: "50", label: "50mm natural", clause: "shot on a 50mm lens at f/1.8, natural perspective" },
  { id: "85", label: "85mm portrait", clause: "shot on an 85mm portrait lens at f/1.4, creamy bokeh" },
  { id: "135", label: "135mm compressed", clause: "shot on a 135mm telephoto, heavily compressed background" },
  { id: "macro", label: "Macro", clause: "macro lens, razor-thin depth of field" },
  { id: "anamorphic", label: "Anamorphic", clause: "anamorphic lens with horizontal flares and oval bokeh" },
];

export const LIGHTING: Preset[] = [
  { id: "golden", label: "Golden hour", clause: "warm golden hour sunlight, long soft shadows" },
  { id: "blue", label: "Blue hour", clause: "cool blue hour ambience just after sunset" },
  { id: "rembrandt", label: "Rembrandt key", clause: "dramatic Rembrandt lighting, single soft key, deep falloff" },
  { id: "softbox", label: "Soft studio", clause: "large soft studio key with gentle fill, clean commercial lighting" },
  { id: "neon", label: "Neon practicals", clause: "moody neon practical lighting, magenta and cyan spill" },
  { id: "window", label: "North window", clause: "soft north-facing window light, natural and diffuse" },
  { id: "chiaroscuro", label: "Chiaroscuro", clause: "high-contrast chiaroscuro, most of frame in shadow" },
  { id: "overcast", label: "Overcast", clause: "flat overcast daylight, no hard shadows" },
  { id: "firelight", label: "Firelight", clause: "flickering warm firelight as the only source" },
];

export const GRADES: Preset[] = [
  { id: "teal-orange", label: "Teal & orange", clause: "teal and orange blockbuster color grade" },
  { id: "bleach", label: "Bleach bypass", clause: "bleach bypass grade, desaturated with crushed blacks" },
  { id: "kodak", label: "Kodak film", clause: "Kodak Portra film emulation, warm skin tones, fine grain" },
  { id: "mono", label: "Monochrome", clause: "high-contrast black and white, rich silver tones" },
  { id: "pastel", label: "Pastel", clause: "soft pastel grade, lifted blacks, low contrast" },
  { id: "noir", label: "Noir", clause: "film noir grade, hard shadows and specular highlights" },
  { id: "clean", label: "Clean digital", clause: "clean neutral digital grade, accurate color" },
];

export const MOODS: Preset[] = [
  { id: "triumphant", label: "Triumphant", clause: "triumphant and expansive" },
  { id: "intimate", label: "Intimate", clause: "intimate and quiet" },
  { id: "tense", label: "Tense", clause: "tense and coiled" },
  { id: "serene", label: "Serene", clause: "serene and unhurried" },
  { id: "gritty", label: "Gritty", clause: "gritty and raw" },
  { id: "luxurious", label: "Luxurious", clause: "luxurious and composed" },
];

export const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 — Landscape", w: 1280, h: 720 },
  { id: "9:16", label: "9:16 — Vertical", w: 720, h: 1280 },
  { id: "1:1", label: "1:1 — Square", w: 960, h: 960 },
  { id: "21:9", label: "21:9 — Scope", w: 1584, h: 672 },
] as const;

export type AspectRatioId = (typeof ASPECT_RATIOS)[number]["id"];

export type ShotSpec = {
  id: string;
  /** What happens in the shot, in the director's own words. */
  subject: string;
  shotSize?: string;
  cameraMove?: string;
  lens?: string;
  lighting?: string;
  grade?: string;
  mood?: string;
  /** Seconds. Providers clamp this to what they support. */
  duration: number;
};

function clauseOf(list: Preset[], id?: string): string | null {
  if (!id) return null;
  return list.find((p) => p.id === id)?.clause ?? null;
}

/**
 * Compose a shot into a single provider-ready prompt string.
 * Order matters: subject first (models weight early tokens most heavily),
 * then framing, movement, optics, light, grade, mood.
 */
export function composePrompt(shot: ShotSpec): string {
  const parts = [
    shot.subject.trim(),
    clauseOf(SHOT_SIZES, shot.shotSize),
    clauseOf(CAMERA_MOVES, shot.cameraMove),
    clauseOf(LENSES, shot.lens),
    clauseOf(LIGHTING, shot.lighting),
    clauseOf(GRADES, shot.grade),
    clauseOf(MOODS, shot.mood),
  ].filter((p): p is string => Boolean(p && p.length));

  return parts.join(", ");
}

export function emptyShot(): ShotSpec {
  return {
    id: crypto.randomUUID(),
    subject: "",
    shotSize: "mcu",
    cameraMove: "push",
    lens: "85",
    lighting: "golden",
    grade: "kodak",
    mood: "luxurious",
    duration: 5,
  };
}
