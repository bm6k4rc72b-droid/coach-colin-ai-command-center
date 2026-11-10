/**
 * RANCH COMMAND — the studio voice.
 *
 * Every scripted English line Coach Colin has, recorded in the owner's custom
 * Coach-Colin voice (Higgsfield, Seed Audio, MP3) — the same voice as the
 * peptide showcase — and served from the Higgsfield CDN, which allows
 * cross-origin playback. A line that changes in rafa.js simply falls back
 * to the device voice until it is re-recorded.
 *
 * @module ranch-command/voicebank
 */

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/';

/** [line, recording] pairs, as captioned (Spanish markup removed). */
export const LINES = [
  ["Sentry's on. I'm watching, jefe.", 'hf_20261110_224855_e8ce4f15-3c53-4815-b5b6-0d8e347bd770'],
  ["Sentry off. Eyes closed.", 'hf_20261110_224855_8a4fbbcc-7687-46ef-a678-51eac15e144a'],
  ["Mission drafted. Load it in QGroundControl, look it over, and fly safe, jefe.", 'hf_20261110_224855_f0e6debb-eb84-4d99-8a99-91867d4c7db2'],
  ["Found it. Boxes are on the picture. ¡Ahí está!", 'hf_20261110_224856_e130ab7c-12b7-441d-ae8c-c417202d2e23'],
  ["Nothing matching in this frame, jefe.", 'hf_20261110_224855_2ec040f4-8d75-484e-afde-6d2cefad7f68'],
  ["¡Bienvenidos! I'm Coach Colin, your ranch foreman. Well, the AI kind. I don't sleep, I don't take lunch, and I never borrow the good truck. Swipe sideways, or wave your hand at the camera, and I'll show you around.", 'hf_20261110_224714_5ee2db09-fbcb-4d81-83f2-9bb581dea79d'],
  ["Every piece under the hood, where it runs, and its licence. Take your time with this list and get to know each one. Every name opens its own source, ¿eh?", 'hf_20261110_224715_694afd78-1c97-4349-a6c0-1510cbbbae97'],
  ["On the sentry slide, every object gets a number and a trail. Draw a tripwire across a gate and I count what goes through, in and out. Draw a zone and I time how long anything stays in it. I can count cows all night. It does not put me to sleep.", 'hf_20261110_224714_64b406fe-bacf-4ef5-9f51-7145b0e7c6c9'],
  ["Every project in the build, and its licence, is on the stack slide. Have a read through the list and get to know each one.", 'hf_20261110_224714_3119f96e-c4c1-426f-8c89-aaca9569d245'],
  ["Atmospheric intelligence. Your own weather station, fused with the national forecast models, so you see the wind shift before the cattle do. And the cattle are annoyingly good at that.", 'hf_20261108_183923_7e72119b-89f3-4878-aa1d-a295a13ca6d1'],
  ["The Pyro-Sentinel grid. Ridge cameras look for smoke, air sensors smell it, and satellites confirm the heat. Three witnesses before I wake you up. I'm thorough, not dramatic.", 'hf_20261108_183923_5ec1ff34-9383-4e4e-b6bd-7cbc13b10da0'],
  ["Fuel-moisture intelligence. Sensors measure how dry the grass and brush really are, which tells us how ready this land is to burn. The short version: crunchy is bad.", 'hf_20261108_183923_d043bf9e-48b6-4733-83ec-255fdf7521ff'],
  ["Strike intelligence. Every lightning strike within forty kilometres, logged and mapped. Some strikes smoulder for days, so I keep watching those spots. Lightning doesn't forget, and neither do I.", 'hf_20261108_183924_b8d4d4c1-9940-493b-85ba-4c11df7b12db'],
  ["Every camera on the ranch, in one place. Your iPhone, the gate cams, even the drone. Back in the day we had one camera, and it was my tío on the porch with binoculars.", 'hf_20261108_183923_95d1fa1a-e071-4cac-b537-2b0c54551118'],
  ["This AI runs right here on your phone. No internet, no server. It knows a cow from a pickup truck, which is more than I can say for my cousin Beto.", 'hf_20261108_183923_4fe25ed4-b8f1-4f74-a0c3-0f1e440e145b'],
  ["This is NanoOWL. Type what you're looking for: open gate, coyote, a downed fence. My reading glasses? No, eso no. That one I can't promise.", 'hf_20261108_183923_f64d0f43-efe4-4131-8114-d9c482a4a36a'],
  ["NanoSAM. Tap anything and it cuts it out clean, like a tortilla cutter, but for pixels. Great for measuring a fence break or counting hay bales.", 'hf_20261108_183923_ce822b72-23b8-41e9-88c2-afe6fc22ad2c'],
  ["Here's where alerts land. A cow at the gate goes to livestock. A stranger at two in the morning goes to security. I don't panic about cows. Cows are family.", 'hf_20261108_183923_74c3e7ed-4538-4bbf-ad4e-95fb6d19ac50'],
  ["Calving watch. When a cow starts calving at three in the morning, I'll wake you up. Nobody else is going to. Trust me, I asked.", 'hf_20261108_184147_ade9380f-d0e0-4b7a-af6f-fb2c5e315578'],
  ["Drone ops. I watch every drone's battery, GPS and altitude. But I don't fly anything myself. A human approves every flight. I'm a foreman, not a pilot. My license is from the internet.", 'hf_20261108_183924_282ed839-8587-4837-ab36-045aa18f1a28'],
  ["Your whole ranch in 3D. Fly the drone, feed the photos to OpenDroneMap, and it builds the land for you. Prettier than a postcard and way more accurate.", 'hf_20261108_184724_a8f7c501-f0d6-40f6-8b1d-be34d2b5d076'],
  ["Out past the last bar of signal, Meshtastic radios keep talking. Tiny, solar powered, and stubborn. Like my abuela.", 'hf_20261108_184724_4b65c112-1902-46af-8e6c-60d6738f860f'],
  ["Connect your edge box, then teach me your swipe. Three swipes left, three right, and hold still. Easier than teaching my tío to text.", 'hf_20261108_184724_ef8b96e8-eaf7-4996-9541-e5c75f190efe'],
  ["Evening. This facility is restricted to principals, owners, and anyone who brought snacks. Place your finger on the scanner, please.", 'hf_20261108_184148_df9e1251-27e3-4bc9-963c-6b025734794f'],
  ["Fingerprint confirmed. Lovely ridges. Now look into the facial sensor, and try to look expensive.", 'hf_20261108_184148_47118e4f-1200-480a-919c-aaee188adaac'],
  ["Facial geometry verified. Last step: sign in. Your real signature, not the one you use for parking tickets.", 'hf_20261108_184147_6e3a487a-6ae2-4e10-b15d-2f8cbd2b74d8'],
  ["That's more of a doodle. Give me a proper signature.", 'hf_20261108_184148_8a0a3a5c-0541-49fb-b6f3-7ba6e3dec2d7'],
  ["Clearance granted. Executive level. Welcome to Ranch Command. Mind the doors, they are heavier than they look.", 'hf_20261108_184147_af2f986d-1bdf-4198-886e-4465aea40d3f'],
  ["¡Vámonos!", 'hf_20261108_184724_2618d555-e8b0-46cb-95c5-dd47e894d7ef'],
  ["Next stop.", 'hf_20261108_184724_e51a7b4c-9921-4496-89a5-1006eb15b6e5'],
  ["Ándale.", 'hf_20261108_184732_0b886004-3288-4a32-9422-623e4661a74a'],
  ["Follow me.", 'hf_20261108_184732_c3c72780-7ce2-45c1-92ad-8ebe46f81264'],
  ["Back we go.", 'hf_20261108_185258_c6a82668-9d4c-4a5a-9cf6-170d159fc086'],
  ["Pa’trás.", 'hf_20261108_185300_bccea8e6-551a-4f2b-b286-e605f4522afb'],
  ["Rewind.", 'hf_20261108_185257_a4d53137-c969-42c0-a949-20855cef23e5'],
  ["¡Perfecto! I know your swipe now. Better than I know my own cows.", 'hf_20261108_184732_6a08dc02-5d65-4d08-ac73-9d507d9d4c7b'],
  ["Heads up, jefe.", 'hf_20261108_185257_5aeef2d0-a628-4fcc-8f0d-75e9753844d7'],
  ["Ojo, something moved.", 'hf_20261108_185258_ac3a2b8e-3616-48f3-b6d8-54b535df7401'],
  ["Why don't cows ever use the drone? They prefer to keep their feet on the ground. Also, no thumbs.", 'hf_20261108_185337_cb163200-aa72-412f-9fa0-536f9e0fedc9'],
  ["My abuela asked if I'm a real foreman. I told her I'm more of a cloud foreman. She said, mijo, the cloud is where the rain comes from, go make it rain.", 'hf_20261108_185337_c705c035-3eaa-43cd-80e5-39a6402a0e78'],
  ["I told the bull about edge computing. Now he only stands near the fence. Very literal animal.", 'hf_20261108_185337_682a719c-971f-4b05-9243-3ab23c9e2976'],
  ["The drone and I have a deal. It does the flying, I do the worrying. Fair split.", 'hf_20261108_185337_70b3f778-1835-4c02-afa6-69f8a4193abe'],
  ["¡Claro! Follow me. I'll walk you through every station.", 'hf_20261108_185337_ea8e7563-7781-4b60-b9a7-879e9a3070a1'],
  ["¡Hola, jefe! Ask me about cameras, drones, alerts, or say \"tour\".", 'hf_20261108_185414_5d4d393a-e31f-407a-acf4-d3f43daa6f6e'],
  ["Your station reports every few seconds. I blend it with the National Weather Service and high-resolution forecast models, then compute fire-weather indices like the Hot-Dry-Windy Index. When a red flag is coming, you know first.", 'hf_20261108_185414_11fec3dd-bef0-4415-a037-ca61386d44c3'],
  ["Smoke cameras, particulate sensors and NASA satellite hotspots each cast a vote. When they agree, the confidence climbs and you get a verified alert. Always call nine one one first. I am a foreman, not a fire department.", 'hf_20261108_185414_c3d16f1c-b308-4df8-905e-0ed3f4d0f236'],
  ["Ten-hour fuel sticks and soil probes measure dryness in each zone. Below about eight percent, ignition gets very easy, so the zone turns red on the board.", 'hf_20261108_185414_19199f38-6ca6-405d-a104-66dcdf08a27e'],
  ["A local strike sensor estimates storm distance, and a licensed lightning network gives exact strike locations. I cross them with fuel moisture to flag holdover fires, the ones that wake up days later.", 'hf_20261108_185414_c1846f1f-2c0b-402b-8c75-8f386dad89ca'],
  ["Tap \"Add this device\" on the cameras slide. Your iPhone becomes a camera on the ranch, and the AI runs right on it.", 'hf_20261108_185431_598e8e5a-6412-41d0-ab6c-bb827ee891a5'],
  ["Two ways for DJI. Live stream RTMP from DJI Fly or Pilot 2 into MediaMTX on the edge box, then add its HLS or WebRTC URL. Or plug the remote's HDMI into a capture card and add it as a device camera.", 'hf_20261108_185431_f4f4d7a2-e39b-4d8f-a017-2cf9a6ecde4c'],
  ["Any ArduPilot or PX4 drone shows up through mavlink2rest on the edge box, or straight from a USB telemetry radio on a laptop. I read telemetry and draft missions. A human uploads and flies them. Always.", 'hf_20261108_185431_52b5bf3a-1a9a-47de-bc4f-3f0474e3615b'],
  ["Your IP cameras go into Frigate on the edge box. Frigate records, detects, and its go2rtc hands me a WebRTC stream. Browsers can't open RTSP directly, so the edge box does the translating.", 'hf_20261108_185431_9f93ae4b-6654-47cb-8444-3b4aaaafe03e'],
  ["NanoOWL finds things you describe in words. On a Jetson it runs on TensorRT in milliseconds. Without one, I run the same OWL-ViT model in your browser, slower but it works.", 'hf_20261108_185455_8a594308-1fe4-43de-8b24-26ac0d3d1247'],
  ["NanoSAM cuts out anything you tap. On the Jetson it's real time. In the browser I use SlimSAM, its cousin.", 'hf_20261108_185454_06e3301d-9621-4f89-be7a-823cf99276ad'],
  ["The edge stack is built for NVIDIA Jetson: Orin Nano or better. NanoOWL and NanoSAM come from NVIDIA's own AI-IOT team and run on TensorRT.", 'hf_20261108_185454_e3fdcae1-b092-499a-b7de-65aeeba5622a'],
  ["Turn on Air Swipe, then Calibrate. You do three swipes each way and hold still, and I set the thresholds from your own hand. Gloves? Switch to Motion mode.", 'hf_20261108_183959_d17d453e-c9e3-46ad-995c-662a456337d3'],
  ["Alerts come in from Frigate, the edge models and this phone, and I sort them: security, livestock, wildlife. A person confirms or dismisses each one.", 'hf_20261108_183959_94bd2cf5-322b-4e7a-928c-41ac2abc5cf1'],
  ["Cowcatcher and Calvingcatcher run on the edge box and spot a cow in labour. I bump that straight to critical. Cows don't wait.", 'hf_20261108_183959_b930bb6c-14f3-464c-a227-73fb1daef1d9'],
  ["Meshtastic radios and solar sensor stations talk over MQTT. Where there's no cell signal, the mesh still gets through.", 'hf_20261108_183959_eb2bbf0d-cbb2-47a2-93a2-1fcf0e5387f5'],
  ["The 3D map shows cameras, drones and radios on the land. Drop an OpenDroneMap orthophoto on it and it's your actual ranch.", 'hf_20261108_183959_bc31a015-7f1f-4fce-acff-f060c3695307'],
  ["Whatever runs on this phone stays on this phone. Your video goes from your cameras to your edge box. No cloud of mine is involved. I don't even have a cloud. I have a phone.", 'hf_20261108_183959_0a0ea945-3ee3-419f-b155-3ba2b129ff40'],
  ["¡De nada, jefe! That's what foremen are for.", 'hf_20261108_183959_6b56de93-b7f9-4cc9-bd66-745d4d6e13f9'],
  ["Híjole, that one's beyond me. Try cameras, drones, alerts, NanoOWL, or say tour.", 'hf_20261108_183959_b947f62b-57ae-4518-90d8-0d7f2bf1af20'],
  ["¡Listo! Your camera is on the wall.", 'hf_20261108_183959_cc6e5fac-2707-48f5-af69-f1d01bbf45cb'],
];

/** The form a line is matched in: straight quotes, single spaces, no case. */
export function lineKey(text) {
  return String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
}

const BANK = new Map(LINES.map(([text, file]) => [lineKey(text), `${CDN}${file}.wav`]));

/**
 * The recording of a line, if there is one.
 *
 * @param {string} text The line as captioned.
 * @returns {string|null} Its URL.
 */
export function studioClip(text) {
  return BANK.get(lineKey(text)) || null;
}
