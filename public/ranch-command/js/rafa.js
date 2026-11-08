/**
 * RANCH COMMAND — Rafa, the ranch foreman.
 *
 * A bilingual AI foreman who walks the reader through every feature. His
 * humour is about ranch life, cattle, drones and being an AI that never gets
 * a lunch break — never about who he is. He speaks with the device's own
 * voices, so nothing leaves the phone.
 *
 * Three ways to hear him:
 *
 * - **Bilingüe** (default): English in a male English voice, with his
 *   Spanish — "¡Órale!", "mi abuela" — spoken by a male Spanish voice, so
 *   both languages are pronounced properly.
 * - **Acento**: all of it in the Spanish voice, which gives English an
 *   accent. Charming on some devices, mangled on others; it is a choice.
 * - **Español**: every line in Spanish.
 *
 * Spanish fragments inside English lines are marked `[es:…]`.
 *
 * @module ranch-command/rafa
 */

/** One entry per slide: what Rafa says on arrival, in both languages. */
export const INTROS = {
  command: {
    en: "[es:¡Bienvenidos!] I'm Rafa, your ranch foreman. Well, the AI kind. I don't sleep, I don't take lunch, and I never borrow the good truck. Swipe sideways, or wave your hand at the camera, and I'll show you around.",
    es: '¡Bienvenidos! Soy Rafa, el capataz del rancho. Bueno, el capataz de inteligencia artificial. No duermo, no almuerzo y nunca me llevo la camioneta buena. Desliza de lado, o mueve la mano frente a la cámara, y te enseño todo.',
  },
  cameras: {
    en: "Every camera on the ranch, in one place. Your iPhone, the gate cams, even the drone. Back in the day we had one camera, and it was my [es:tío] on the porch with binoculars.",
    es: 'Todas las cámaras del rancho en un solo lugar. Tu iPhone, las cámaras del portón, hasta el dron. Antes teníamos una sola cámara, y era mi tío en el porche con binoculares.',
  },
  vision: {
    en: "This AI runs right here on your phone. No internet, no server. It knows a cow from a pickup truck, which is more than I can say for my cousin Beto.",
    es: 'Esta inteligencia corre aquí mismo, en tu teléfono. Sin internet, sin servidor. Distingue una vaca de una camioneta, que es más de lo que puedo decir de mi primo Beto.',
  },
  search: {
    en: "This is NanoOWL. Type what you're looking for: open gate, coyote, a downed fence. My reading glasses? [es:No, eso no.] That one I can't promise.",
    es: 'Este es NanoOWL. Escribe lo que buscas: portón abierto, coyote, cerca caída. ¿Mis lentes? No, eso no te lo prometo.',
  },
  segment: {
    en: "NanoSAM. Tap anything and it cuts it out clean, like a tortilla cutter, but for pixels. Great for measuring a fence break or counting hay bales.",
    es: 'NanoSAM. Toca cualquier cosa y la recorta limpiecita, como cortador de tortillas, pero de píxeles. Sirve para medir una cerca rota o contar pacas.',
  },
  events: {
    en: "Here's where alerts land. A cow at the gate goes to livestock. A stranger at two in the morning goes to security. I don't panic about cows. Cows are family.",
    es: 'Aquí llegan las alertas. Una vaca en el portón va a ganado. Un desconocido a las dos de la mañana va a seguridad. Yo no me asusto por las vacas. Las vacas son familia.',
  },
  livestock: {
    en: "Calving watch. When a cow starts calving at three in the morning, I'll wake you up. Nobody else is going to. Trust me, I asked.",
    es: 'Vigilancia de partos. Cuando una vaca empiece a parir a las tres de la mañana, yo te despierto. Nadie más lo va a hacer. Créeme, ya pregunté.',
  },
  drones: {
    en: "Drone ops. I watch every drone's battery, GPS and altitude. But I don't fly anything myself. A human approves every flight. I'm a foreman, not a pilot. My license is from the internet.",
    es: 'Operaciones de drones. Vigilo la batería, el GPS y la altura de cada dron. Pero yo no vuelo nada. Una persona aprueba cada vuelo. Soy capataz, no piloto. Mi licencia es de internet.',
  },
  map: {
    en: "Your whole ranch in 3D. Fly the drone, feed the photos to OpenDroneMap, and it builds the land for you. Prettier than a postcard and way more accurate.",
    es: 'Todo tu rancho en 3D. Vuelas el dron, le das las fotos a OpenDroneMap y te construye el terreno. Más bonito que una postal y mucho más exacto.',
  },
  mesh: {
    en: "Out past the last bar of signal, Meshtastic radios keep talking. Tiny, solar powered, and stubborn. Like my [es:abuela].",
    es: 'Más allá de la última rayita de señal, los radios Meshtastic siguen hablando. Chiquitos, solares y tercos. Como mi abuela.',
  },
  stack: {
    en: "Every piece under the hood, and where it runs. Some of it is free software with real licenses, so read those before you sell this, [es:¿eh?]",
    es: 'Cada pieza del motor y dónde corre. Parte es software libre con licencias de verdad, así que léelas antes de venderlo, ¿eh?',
  },
  setup: {
    en: "Connect your edge box, then teach me your swipe. Three swipes left, three right, and hold still. Easier than teaching my [es:tío] to text.",
    es: 'Conecta tu equipo de borde y luego enséñame tu gesto. Tres a la izquierda, tres a la derecha, y quieto. Más fácil que enseñarle a mi tío a mandar mensajes.',
  },
};

/** Short reactions, so he is not silent between bigger lines. */
export const QUIPS = {
  next: { en: ['[es:¡Vámonos!]', 'Next stop.', '[es:Ándale.]', 'Follow me.'], es: ['¡Vámonos!', 'Siguiente.', 'Ándale.', 'Sígueme.'] },
  prev: { en: ['Back we go.', '[es:Pa’trás.]', 'Rewind.'], es: ['Pa’trás.', 'Regresamos.', 'Otra vez.'] },
  calibrated: { en: ["[es:¡Perfecto!] I know your swipe now. Better than I know my own cows."], es: ['¡Perfecto! Ya conozco tu gesto. Mejor que a mis vacas.'] },
  alert: { en: ['Heads up, [es:jefe].', '[es:Ojo,] something moved.'], es: ['Ojo, jefe.', 'Aguas, algo se movió.'] },
  joke: {
    en: [
      "Why don't cows ever use the drone? They prefer to keep their feet on the ground. Also, no thumbs.",
      "My [es:abuela] asked if I'm a real foreman. I told her I'm more of a cloud foreman. She said, [es:mijo], the cloud is where the rain comes from, go make it rain.",
      "I told the bull about edge computing. Now he only stands near the fence. Very literal animal.",
      "The drone and I have a deal. It does the flying, I do the worrying. Fair split.",
    ],
    es: [
      '¿Por qué las vacas no usan el dron? Prefieren tener las patas en la tierra. Además, no tienen pulgares.',
      'Mi abuela me preguntó si soy capataz de verdad. Le dije que soy capataz de la nube. Me dijo: mijo, de la nube viene la lluvia, ponte a trabajar.',
      'Le expliqué al toro la computación de borde. Ahora nomás se para junto a la cerca. Muy literal el animal.',
      'El dron y yo tenemos un trato. Él vuela, yo me preocupo. Partes iguales.',
    ],
  },
};

/**
 * Questions he can answer: keyword patterns, an answer in each language,
 * and an optional slide to take the reader to.
 */
export const ANSWERS = [
  { re: /\b(tour|show me around|recorrido|enséñame)\b/i, tour: true, en: "[es:¡Claro!] Follow me. I'll walk you through every station.", es: '¡Claro! Sígueme, te enseño cada estación.' },
  { re: /\b(joke|funny|chiste|broma)\b/i, joke: true },
  { re: /\b(hola|hello|hi|hey|buenas)\b/i, en: '[es:¡Hola, jefe!] Ask me about cameras, drones, alerts, or say "tour".', es: '¡Hola, jefe! Pregúntame de cámaras, drones o alertas, o di "recorrido".' },
  { re: /\b(iphone|phone camera|teléfono|celular)\b/i, go: 'cameras', en: 'Tap "Add this device" on the cameras slide. Your iPhone becomes a camera on the ranch, and the AI runs right on it.', es: 'Toca "Agregar este dispositivo" en cámaras. Tu iPhone se vuelve una cámara del rancho y la inteligencia corre ahí mismo.' },
  { re: /\b(dji|mavic|matrice|mini \d|air \d)\b/i, go: 'drones', en: 'Two ways for DJI. Live stream RTMP from DJI Fly or Pilot 2 into MediaMTX on the edge box, then add its HLS or WebRTC URL. Or plug the remote\'s HDMI into a capture card and add it as a device camera.', es: 'Con DJI hay dos maneras. Transmite RTMP desde DJI Fly o Pilot 2 a MediaMTX en el equipo de borde y agrega su URL. O conecta el HDMI del control a una capturadora y agrégala como cámara.' },
  { re: /\b(drone|dron|ardupilot|px4|mavlink|fly|volar)\b/i, go: 'drones', en: 'Any ArduPilot or PX4 drone shows up through mavlink2rest on the edge box, or straight from a USB telemetry radio on a laptop. I read telemetry and draft missions. A human uploads and flies them. Always.', es: 'Cualquier dron ArduPilot o PX4 aparece por mavlink2rest, o directo de un radio de telemetría USB en una laptop. Yo leo la telemetría y preparo misiones. Una persona las sube y las vuela. Siempre.' },
  { re: /\b(surveillance|security cam|ip cam|rtsp|cctv|frigate|nvr)\b/i, go: 'cameras', en: 'Your IP cameras go into Frigate on the edge box. Frigate records, detects, and its go2rtc hands me a WebRTC stream. Browsers can\'t open RTSP directly, so the edge box does the translating.', es: 'Tus cámaras IP entran a Frigate en el equipo de borde. Frigate graba, detecta, y su go2rtc me pasa video WebRTC. El navegador no abre RTSP directo, así que el equipo traduce.' },
  { re: /\b(nanoowl|owl|open.?vocab|find|search|busca)\b/i, go: 'search', en: 'NanoOWL finds things you describe in words. On a Jetson it runs on TensorRT in milliseconds. Without one, I run the same OWL-ViT model in your browser, slower but it works.', es: 'NanoOWL encuentra lo que describes con palabras. En un Jetson corre con TensorRT en milisegundos. Sin él, corro el mismo modelo OWL-ViT en tu navegador, más lento pero funciona.' },
  { re: /\b(nanosam|sam|segment|recorta)\b/i, go: 'segment', en: 'NanoSAM cuts out anything you tap. On the Jetson it\'s real time. In the browser I use SlimSAM, its cousin.', es: 'NanoSAM recorta lo que toques. En el Jetson es en tiempo real. En el navegador uso SlimSAM, su primo.' },
  { re: /\b(nvidia|jetson|gpu|tensorrt)\b/i, go: 'stack', en: 'The edge stack is built for NVIDIA Jetson: Orin Nano or better. NanoOWL and NanoSAM come from NVIDIA\'s own AI-IOT team and run on TensorRT.', es: 'El equipo de borde está hecho para NVIDIA Jetson, Orin Nano o mejor. NanoOWL y NanoSAM son del equipo AI-IOT de NVIDIA y corren con TensorRT.' },
  { re: /\b(swipe|gesture|wave|calibrat|gesto|calibra)\b/i, go: 'setup', en: 'Turn on Air Swipe, then Calibrate. You do three swipes each way and hold still, and I set the thresholds from your own hand. Gloves? Switch to Motion mode.', es: 'Activa el gesto y luego Calibrar. Haces tres deslizamientos por lado y te quedas quieto, y yo ajusto todo a tu mano. ¿Con guantes? Usa el modo Movimiento.' },
  { re: /\b(alert|alarm|alerta|event)\b/i, go: 'events', en: 'Alerts come in from Frigate, the edge models and this phone, and I sort them: security, livestock, wildlife. A person confirms or dismisses each one.', es: 'Las alertas llegan de Frigate, del equipo de borde y del teléfono, y las ordeno: seguridad, ganado, fauna. Una persona confirma o descarta cada una.' },
  { re: /\b(calv|cow|cattle|vaca|ganado|parto|livestock)\b/i, go: 'livestock', en: 'Cowcatcher and Calvingcatcher run on the edge box and spot a cow in labour. I bump that straight to critical. Cows don\'t wait.', es: 'Cowcatcher y Calvingcatcher corren en el equipo de borde y detectan un parto. Eso lo subo directo a crítico. Las vacas no esperan.' },
  { re: /\b(mesh|meshtastic|lora|signal|señal|sensor|sparrow)\b/i, go: 'mesh', en: 'Meshtastic radios and solar sensor stations talk over MQTT. Where there\'s no cell signal, the mesh still gets through.', es: 'Los radios Meshtastic y las estaciones solares hablan por MQTT. Donde no hay señal, la malla sí llega.' },
  { re: /\b(map|3d|opendronemap|odm|mapa)\b/i, go: 'map', en: 'The 3D map shows cameras, drones and radios on the land. Drop an OpenDroneMap orthophoto on it and it\'s your actual ranch.', es: 'El mapa 3D muestra cámaras, drones y radios en el terreno. Ponle un ortomosaico de OpenDroneMap y es tu rancho de verdad.' },
  { re: /\b(privacy|private|cloud|upload|privacidad)\b/i, en: 'Whatever runs on this phone stays on this phone. Your video goes from your cameras to your edge box. No cloud of mine is involved. I don\'t even have a cloud. I have a phone.', es: 'Lo que corre en este teléfono se queda aquí. El video va de tus cámaras a tu equipo. Ninguna nube mía. Ni tengo nube. Tengo un teléfono.' },
  { re: /\b(license|licence|sell|price|business|licencia|vender)\b/i, go: 'stack', en: 'Before you sell it: Frigate and the NVIDIA pieces are permissive, but Ultralytics, OpenDroneMap and anything AGPL need care in a paid service. It\'s all listed on the stack slide.', es: 'Antes de venderlo: Frigate y lo de NVIDIA son permisivos, pero Ultralytics, OpenDroneMap y lo AGPL requieren cuidado en un servicio pagado. Todo está en la lámina del motor.' },
  { re: /\b(thank|thanks|gracias)\b/i, en: '[es:¡De nada, jefe!] That\'s what foremen are for.', es: '¡De nada, jefe! Para eso está el capataz.' },
];

/**
 * Split an English line into language runs.
 *
 * @param {string} text A line with `[es:…]` fragments.
 * @returns {Array<{ lang: 'en'|'es', text: string }>} Runs.
 */
export function runs(text) {
  const out = [];
  const re = /\[es:([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ lang: 'en', text: text.slice(last, m.index) });
    out.push({ lang: 'es', text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ lang: 'en', text: text.slice(last) });
  return out.map((r) => ({ ...r, text: r.text.replace(/\s+/g, ' ').trim() })).filter((r) => r.text);
}

/** A line with the markup removed, for captions. */
export const plain = (text) => text.replace(/\[es:([^\]]+)\]/g, '$1');

/**
 * Match a question.
 *
 * @param {string} question What the reader asked.
 * @returns {object|null} The answer entry.
 */
export function answer(question) {
  return ANSWERS.find((entry) => entry.re.test(question)) || null;
}

const MALE = /\b(juan|jorge|diego|carlos|enrique|pablo|andrés|andres|alvaro|álvaro|miguel|raúl|raul|aaron|fred|alex|daniel|tom|evan|nathan|oliver|arthur|reed|rocko|grandpa|eddy|ralph|google español|male)\b/i;
const FEMALE = /\b(paulina|mónica|monica|marisol|angelica|angélica|soledad|helena|laura|lucia|lucía|samantha|karen|moira|tessa|victoria|allison|ava|susan|zoe|nicky|female|sabina|esperanza|paloma|francisca)\b/i;

/**
 * Rank voices for one language, male first.
 *
 * @param {SpeechSynthesisVoice[]} voices The device's voices.
 * @param {'en'|'es'} lang The language.
 * @returns {SpeechSynthesisVoice[]} Ranked voices.
 */
export function rankVoices(voices, lang) {
  // Mexican and US Spanish first: closest to a ranch in the American West.
  const prefer = lang === 'es' ? ['es-mx', 'es-us', 'es-419', 'es-es'] : ['en-us', 'en-gb', 'en-au'];
  const score = (v) => {
    const code = v.lang.replace('_', '-').toLowerCase();
    let s = 0;
    const idx = prefer.indexOf(code);
    if (idx >= 0) s += 40 - idx * 5;
    if (MALE.test(v.name)) s += 30;
    if (FEMALE.test(v.name)) s -= 40;
    if (/enhanced|premium|natural|neural/i.test(v.name)) s += 8;
    if (v.localService) s += 2;
    return s;
  };
  return voices.filter((v) => v.lang.toLowerCase().startsWith(lang)).sort((a, b) => score(b) - score(a));
}

/** The voice. */
export class Rafa {
  /**
   * @param {{ onCaption?: Function, onSpeaking?: Function }} [hooks] UI hooks.
   */
  constructor({ onCaption = () => {}, onSpeaking = () => {} } = {}) {
    this.synth = globalThis.speechSynthesis || null;
    this.mode = 'bilingual';
    this.enabled = true;
    this.onCaption = onCaption;
    this.onSpeaking = onSpeaking;
    this.voices = { en: [], es: [] };
    this.refresh();
    this.synth?.addEventListener?.('voiceschanged', () => this.refresh());
  }

  /** Re-read the device's voices. */
  refresh() {
    const all = this.synth?.getVoices?.() || [];
    this.voices = { en: rankVoices(all, 'en'), es: rankVoices(all, 'es') };
  }

  /** The language his whole lines are in. */
  get lang() {
    return this.mode === 'espanol' ? 'es' : 'en';
  }

  /**
   * Say a line object (`{ en, es }`) or a string.
   *
   * @param {string|{ en: string, es: string }} line The line.
   */
  say(line) {
    const text = typeof line === 'string' ? line : (line[this.lang] || line.en);
    this.onCaption(plain(text));
    if (!this.enabled || !this.synth) return;
    this.synth.cancel();
    const parts = this.mode === 'bilingual' ? runs(text)
      : [{ lang: this.mode === 'espanol' ? 'es' : 'es', text: plain(text) }];
    let pending = parts.length;
    for (const part of parts) {
      const u = new SpeechSynthesisUtterance(part.text);
      const voice = this.voices[part.lang][0] || null;
      if (voice) u.voice = voice;
      u.lang = voice?.lang || (part.lang === 'es' ? 'es-MX' : 'en-US');
      // If the device offers only a female voice, a slightly lower pitch is
      // the least-bad approximation; a male voice is left as it is.
      u.pitch = voice && MALE.test(voice.name) ? 1 : 0.85;
      u.rate = part.lang === 'es' ? 1.0 : 1.02;
      u.onstart = () => this.onSpeaking(true);
      u.onend = () => { pending -= 1; if (!pending) this.onSpeaking(false); };
      this.synth.speak(u);
    }
  }

  /**
   * One of a list of quips.
   *
   * @param {string} kind A {@link QUIPS} key.
   */
  quip(kind) {
    const list = QUIPS[kind]?.[this.lang] || QUIPS[kind]?.en || [];
    if (list.length) this.say(list[Math.floor(Math.random() * list.length)]);
  }

  /** Stop talking. */
  hush() {
    this.synth?.cancel();
    this.onSpeaking(false);
  }

  /**
   * Which voices he would use, for the settings panel.
   *
   * @returns {{ en: string, es: string }} Voice names.
   */
  describe() {
    return { en: this.voices.en[0]?.name || 'device default', es: this.voices.es[0]?.name || 'none installed' };
  }
}

/**
 * Speech recognition, where the browser has it (Safari and Chrome do).
 *
 * @param {'en'|'es'} lang Language.
 * @returns {object|null} A recogniser, or null.
 */
export function recogniser(lang) {
  const R = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!R) return null;
  const r = new R();
  r.lang = lang === 'es' ? 'es-MX' : 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  return r;
}
