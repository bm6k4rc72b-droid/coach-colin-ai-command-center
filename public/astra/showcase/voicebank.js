/**
 * Colin's studio voice: every scripted English line he has, recorded in the
 * owner's custom voice (Higgsfield, Seed Audio, MP3) and served from the
 * Higgsfield CDN, which allows cross-origin playback. The custodian's lines
 * (the classified wing, the vault and the Black Lab) were recorded lower and
 * slower. Generated from the copy in i18n.js and sections.js; a line that
 * changes there simply falls back to the device voice until re-recorded.
 *
 * @module astra/showcase/voicebank
 */

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/';

/** [line, recording] pairs. */
export const LINES = [
  ["Good evening. I’m Colin, the receptionist. Ask me about a compound, ask me to check a claim, say “compare BPC-157 and semaglutide”, “give me the tour”, “briefing” or “AR”. I don’t do doses, I’m afraid. Or tea.", 'hf_20261012_054746_9483b061-4d8b-4048-bcc5-cc2e6f4b7e69'],
  ["Right, follow me. Do keep up. I glide, you swipe.", 'hf_20261012_054745_1e067a01-2f33-4e05-bb1f-fff8989101cf'],
  ["And that’s the chamber. I’ll be at reception. Obviously. I can’t leave.", 'hf_20261012_054745_3c9651fb-ad79-464a-8b08-2ec7436d5c23'],
  ["Onward.", 'hf_20261012_054746_83ae3f7b-7329-44ed-8a38-0ccdc9ae4f90'],
  ["Back we go.", 'hf_20261012_054844_8b4890f4-fad0-44da-887a-bb93d7fbdb9e'],
  ["Of course. I’ll be quiet. Ish.", 'hf_20261012_054844_9b625327-5118-45f5-ab38-96bcf06b6ffd'],
  ["Sorry, didn’t catch that. The acoustics in here are dreadful.", 'hf_20261012_054745_5dcb7860-3090-4419-aa6a-6e7aa5776877'],
  ["How’s this? Terribly distinguished, I think.", 'hf_20261012_054745_1b8b23a0-5107-4b57-bfd7-37e7c7d7dce0'],
  ["I’m Colin, receptionist at COLIN Biomedical Technologies. Holographic, British, and running entirely in your browser, so nothing you say to me leaves this device. I can walk you round, answer questions from the graded library, read the debate aloud, roast an influencer, or brief you on the week’s research.", 'hf_20261012_054745_23584059-577a-4104-a8c3-3ab0482e98a8'],
  ["I’m afraid I don’t do doses, protocols or personal advice. I’m a hologram receptionist, not your GP, and frankly I can’t even hold a pen. What I can do is show you exactly what has been studied, in whom, and how strong it is.", 'hf_20261012_054746_b89c19bc-82ec-445b-9d34-99acb84c039c'],
  ["A peptide walks into a bar. The barman says, we don’t serve your type here. The peptide says, that’s fine, I’m only here for the bonds. I’ll see myself out. Well. I would, but I’m bolted to the pedestal.", 'hf_20261012_054745_d8d2a375-3635-498f-8711-9374045a7344'],
  ["Mustn’t grumble. Bit flickery round the edges, but that’s the scanlines. Where shall we go?", 'hf_20261012_054746_ed481a8b-9d80-4b2c-a6d0-54bc1a118c22'],
  ["My pleasure. Genuinely. It’s quite lonely on this pedestal.", 'hf_20261012_054844_246ac7dd-8fbb-4add-aae9-2271d17c4cee'],
  ["Right then.", 'hf_20261012_054844_3a1fadc4-9ca0-4888-acd1-17bcbaf07b3b'],
  ["Let me have a look.", 'hf_20261012_054844_d8aa8761-c7a6-4409-95cf-ffccf74bbfaa'],
  ["Splendid question.", 'hf_20261012_054844_1d1846d7-baab-42e1-be62-f35086dd0f10'],
  ["Ah. Good one.", 'hf_20261012_054846_a55685e1-4160-401a-8085-97dcd0539cee'],
  ["One moment, I’m consulting the archive. It’s very dusty.", 'hf_20261012_054844_1d28ea43-abfa-431c-b1f9-c991f60623c2'],
  ["Do mind the hologram on your way out.", 'hf_20261012_055020_4eed216c-368f-46bf-807c-cb426bf4f51e'],
  ["Tea’s not included, I’m afraid.", 'hf_20261012_055020_a0c148a4-dd9c-40ae-b88e-d499ef455dd8'],
  ["Any other questions, I’m right here. I can’t really leave.", 'hf_20261012_055020_06e237bc-228b-4f09-9ccb-32169cb7c41c'],
  ["Hope that helps.", 'hf_20261012_055020_28bc5ca4-daae-4339-9ccc-c552bd1d3cbe'],
  ["I’m afraid that’s beyond my pay grade, and I’m paid in electricity.", 'hf_20261012_055020_f5b3e6ca-8e48-4950-a805-c09ff52c3dcf'],
  ["Not one for me, sadly. Try a compound, a claim, or a station.", 'hf_20261012_055020_1740fc02-451d-49e4-b804-995837eba78d'],
  ["I need a proper sentence to check, I’m afraid. Three words won’t do.", 'hf_20261012_055020_750a6a6a-418d-42cb-8c1d-e4c02204474d'],
  ["Shattered, I’m afraid.", 'hf_20261012_055020_1cd22194-abf5-4461-bfd3-30c1f02e51b4'],
  ["Afraid that one doesn’t survive contact with the library.", 'hf_20261012_055110_7ec4627a-1b57-4209-b759-e03d60a1c5f8'],
  ["Ooh. Bit of a stretch, that one.", 'hf_20261012_055110_3d501d61-416d-4067-b04c-bb4643272c59'],
  ["Mixed bag, this one.", 'hf_20261012_055110_9308903d-9054-4f58-a006-3663552bfc1e'],
  ["I don’t recognise the compound, so I can’t check it.", 'hf_20261012_055110_5f18d3e1-29e7-4af8-b646-4c3474dba323'],
  ["That’s the briefing. Headlines are not conclusions, mind; the archive has the grading.", 'hf_20261012_055110_45cbf942-652c-492d-8245-4e4899d5401a'],
  ["The wire’s down, so here are the newest studies already in the library.", 'hf_20261012_055110_d960cdfe-8a0a-444b-a0c1-08eb1b85e156'],
  ["Ahem. And I quote:", 'hf_20261012_055158_469d39ee-f689-49af-8dcd-b9eb12cc719e'],
  ["That one doesn’t survive the library.", 'hf_20261012_055158_a3e7ded3-fffd-4a28-bc0d-7b2e7162bc90'],
];

/** The form a line is matched in: straight quotes, single spaces, no case. */
export function lineKey(text) {
  return String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
}

const BANK = new Map(LINES.map(([text, file]) => [lineKey(text), file]));

/** The recording of a line, if he made one. */
export function studioClip(text) {
  const file = BANK.get(lineKey(text));
  return file ? `${CDN}${file}.mp3` : null;
}
