/**
 * Where every picture and clip lives.
 *
 * Stills are GPT Image renders and clips are Seedance 2.5 (1080p, 5s, no
 * audio) animations of those stills, all generated on Higgsfield for this page.
 * They are served from Higgsfield's CDN. `scripts/miami-keys-localize.mjs`
 * downloads them, re-encodes the clips for frame-accurate scrubbing, and points
 * this file at the local copies under `media/`.
 *
 * @module miami-keys/media
 */

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/';

export const MEDIA = {
  hero: {
    poster: `${CDN}hf_20261021_052947_3aab1d3e-6c5b-4c99-94be-6435a4d0d414.png`,
    video: `${CDN}hf_20261021_053111_268da254-1a3b-4552-8329-c97634ff8ec7.mp4`,
    alt: 'Lime-green Lamborghini Aventador S on a wet, neon-lit Miami street at night',
  },
  'aventador-cockpit': {
    poster: `${CDN}hf_20261021_052946_a9410ffc-175b-4ebd-8fd2-1da6a4c2cf75.png`,
    video: `${CDN}hf_20261021_053112_fb5427dc-d29a-4ed3-94fc-778f05df7624.mp4`,
    alt: 'Aventador cockpit at night, digital dash glowing, neon street through the windshield',
  },
  'aventador-spin': {
    poster: `${CDN}hf_20261021_052945_5c202476-9f62-4b74-a8cf-bb7d401ae066.png`,
    video: `${CDN}hf_20261021_053111_022d0ea4-e4d2-48b6-8d60-fb3c8cbac737.mp4`,
    alt: 'Aventador S on a glowing pink-to-cyan turntable against black',
  },
  gtb: {
    poster: `${CDN}hf_20261021_052944_aa982815-fd0e-42e6-b5dc-dc38eca93c21.png`,
    video: `${CDN}hf_20261021_053111_e2548031-c9c4-4656-8062-498687ed3d1e.mp4`,
    alt: 'Red Ferrari 296 GTB with its door open, Miami skyline at golden hour behind',
  },
  'gtb-cockpit': {
    poster: `${CDN}hf_20261021_052946_8b903e08-0ab3-43d0-84ae-289a1d25272c.png`,
    video: `${CDN}hf_20261021_053112_91cadc1d-3c93-4469-8310-24ee8f0888fa.mp4`,
    alt: 'Ferrari cockpit looking out over the causeway at sunset',
  },
  'gtb-spin': {
    poster: `${CDN}hf_20261021_052944_4ac360fe-223f-4b0e-b5e7-3dd3e4eb44d6.png`,
    video: `${CDN}hf_20261021_053111_b3a2549d-e4e1-4f0b-bce7-f5e6f2dfab7e.mp4`,
    alt: 'Ferrari 296 GTB on a glowing turntable against black',
  },
  cullinan: {
    poster: `${CDN}hf_20261021_052947_c7d90a18-8254-4dc7-9ca4-0c52edac9814.png`,
    video: `${CDN}hf_20261021_053111_e9e53ed7-c15d-4cd0-b5df-985152b702cc.mp4`,
    alt: 'White Rolls-Royce Cullinan on a palm-lined driveway, Miami skyline at dusk',
  },
  'cullinan-side': {
    poster: `${CDN}hf_20261021_052944_1ad187f7-b250-48e4-b41c-dd5c83257c61.png`,
    video: `${CDN}hf_20261021_053112_307b0db9-fda9-4c39-9695-70e0cef5fd85.mp4`,
    alt: 'Cullinan in profile with all four doors open and a cream interior',
  },
  lambswool: {
    poster: `${CDN}hf_20261021_052946_8485fa71-6757-4870-a464-4b33a8e6a217.png`,
    video: `${CDN}hf_20261021_053120_e263c92b-b8b1-4ec4-afa8-0104101a10b2.mp4`,
    alt: 'Cream leather rear seats and lambswool rugs',
  },
  starlight: {
    poster: `${CDN}hf_20261021_052945_b12c0f1c-e7be-441d-88f1-d7fb5b2f4d6b.png`,
    video: `${CDN}hf_20261021_053111_82e8e15e-b3a7-412a-83bc-a0204ba59084.mp4`,
    alt: 'Starlight headliner with the Miami skyline through the rear window',
  },
  'cullinan-spin': {
    poster: `${CDN}hf_20261021_052946_a353609a-c15d-438e-a562-4b706b4e89ec.png`,
    video: `${CDN}hf_20261021_053111_17dad6eb-6abf-4a70-acf0-7e4b7801a362.mp4`,
    alt: 'White Cullinan on a glowing turntable against black',
  },
  final: {
    poster: `${CDN}hf_20261021_052945_c58a3542-251a-43e2-9f18-d8d3a2b899f5.png`,
    video: `${CDN}hf_20261021_053120_511694ac-5523-4617-9ce6-34695c99cebf.mp4`,
    alt: 'Four car keys on a mirrored tray, neon Miami skyline behind',
  },
  'key-aventador': {
    poster: `${CDN}hf_20261021_052949_9d0aac20-f9ce-46ac-88a1-a1e000cdd807.png`,
    alt: 'Lamborghini key fob',
  },
  'key-gtb': {
    poster: `${CDN}hf_20261021_052948_e58fe812-df17-4f94-bec7-e171f04d9598.png`,
    alt: 'Ferrari key fob',
  },
  'key-cullinan': {
    poster: `${CDN}hf_20261021_052949_9c975871-dc86-4b24-bb08-424ea53572f7.png`,
    alt: 'Rolls-Royce key',
  },
  'key-g63': {
    poster: `${CDN}hf_20261021_052949_d7b8ba5b-e492-4a35-a1ae-c636fdba253f.png`,
    alt: 'Mercedes-AMG key fob',
  },
};
