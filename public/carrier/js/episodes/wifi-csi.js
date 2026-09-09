/**
 * "Your walls are not opaque to your Wi-Fi" — the flagship episode.
 *
 * This is the engine's reference script and its worked example: seven scenes,
 * every panel type, and a full set of citations. It is written to be *the
 * accurate version* of a story that circulates in a badly overclaimed form.
 * Three corrections are load-bearing and each has its own scene:
 *
 * 1. The through-wall skeleton footage everyone reposts is MIT's RF-Pose, which
 *    used a **custom FMCW radio**, not a Wi-Fi sniffer. Attributing it to a
 *    five-dollar board is the single most common error in this genre.
 * 2. The Wi-Fi result that *is* real — CMU's DensePose-from-WiFi — used three
 *    commodity routers as transmitters and three as receivers, and its own
 *    paper reports that accuracy falls away on layouts it was not trained in.
 * 3. What passive sensing yields is occupancy, posture and timing. Not
 *    identity, and not the contents of anything encrypted.
 *
 * The defensive half is the payload: the last scene is the one an author is
 * meant to act on, and it is about transmit power and facade attenuation, both
 * of which a facilities team can change this quarter.
 *
 * @module carrier/episodes/wifi-csi
 */

/** The reference episode. */
export const WIFI_CSI = {
  id: 'wifi-csi',
  title: 'Your walls are not opaque to your Wi-Fi',
  handle: 'nightowl_sec.sh',
  speaker: 'NIGHTOWL',
  theme: 'nightowl',
  size: { w: 1080, h: 1920 },
  safeArea: { top: 300, bottom: 470 },
  avatarSlot: 'avatar',
  scenes: [
    {
      id: 'hook',
      kicker: '01 · threat advisory',
      title: 'They Don\'t Need A Camera !To See The Room!',
      seconds: 7,
      caption: 'Published research reconstructs human posture through a wall using radio alone. No lens. No light.',
      claim: true,
      source: 'Zhao et al., CVPR 2018 (RF-Pose)',
      note: 'RF-Pose used a purpose-built FMCW radio at 5.4–7.2 GHz — not a Wi-Fi card. Say so, or the whole episode is arguable.',
      stats: [
        { label: 'optical sensors', value: 'none', tone: 'alert' },
        { label: 'carrier', value: 'radio frequency', tone: 'accent' },
        { label: 'published', value: 'MIT CSAIL 2018', tone: 'dim' },
      ],
      panel: {
        type: 'grid',
        cols: 2,
        rows: 1,
        cells: [
          {
            type: 'media',
            slot: 'rfpose-clip',
            status: 'research footage',
            statusTone: 'alert',
            hint: 'drop the RF-Pose demo clip here',
            footerLeft: 'source clip',
            footerRight: 'CUSTOM FMCW RADIO',
          },
          { type: 'pose', mode: 'skeleton', people: 2, status: 'reconstruction', legend: '14 keypoints' },
        ],
      },
    },
    {
      id: 'csi',
      kicker: '02 · what actually leaks',
      title: 'The Leak Is [Channel State], Not Content',
      seconds: 8,
      caption: 'Every Wi-Fi frame is measured across dozens of subcarriers. A body moving through the room changes those measurements.',
      claim: true,
      source: 'IEEE 802.11 CSI · Halperin et al. 2011',
      note: 'CSI is a physical-layer artefact. Capturing it does not decrypt anything and does not require the network key.',
      stats: [
        { label: 'layer', value: 'phy', tone: 'accent' },
        { label: 'payload', value: 'still encrypted', tone: 'good' },
        { label: 'what leaks', value: 'channel state', tone: 'alert' },
      ],
      panel: {
        type: 'sniffer',
        packetsPerSec: 1420,
        status: 'passive observation',
        legend: 'amplitude + phase per subcarrier',
      },
    },
    {
      id: 'translate',
      kicker: '03 · signal to silhouette',
      title: 'Phase Shifts → [Body Surface]',
      seconds: 8,
      caption: 'A network trained against camera footage maps those phase shifts onto a body. Three commodity routers were enough.',
      claim: true,
      source: 'Geng, Huang, De la Torre — CMU, 2022 (DensePose from WiFi)',
      note: 'Three TP-Link AC1750 transmitters and three receivers on 2.4 GHz. Camera-supervised training. Real result, ordinary hardware.',
      stats: [
        { label: 'input hardware', value: '3 tx · 3 rx', tone: 'accent' },
        { label: 'supervision', value: 'camera-labelled', tone: 'warn' },
        { label: 'output', value: 'uv surface map', tone: 'accent' },
      ],
      panel: {
        type: 'grid',
        cols: 2,
        rows: 1,
        cells: [
          { type: 'pose', mode: 'blob', people: 3, status: 'confidence maps', legend: 'what the radio knows' },
          { type: 'pose', mode: 'skeleton', people: 3, status: 'fitted pose', legend: 'what gets posted' },
        ],
      },
    },
    {
      id: 'output',
      kicker: '04 · the actual deliverable',
      title: 'Not A Photograph. !A Floor Plan!',
      seconds: 9,
      caption: 'The realistic output is a floor plan: which rooms are occupied, how many people, and how predictable their movement is.',
      claim: false,
      source: 'Wang et al., ICCV 2019 (Person-in-WiFi)',
      stats: [
        { label: 'resolves', value: 'occupancy · posture', tone: 'alert' },
        { label: 'does not resolve', value: 'identity · faces', tone: 'good' },
        { label: 'value to attacker', value: 'timing', tone: 'warn' },
      ],
      panel: {
        type: 'floorplan',
        secPerLeg: 2.2,
        status: 'reconstructed occupancy',
        legend: 'room-level, not person-level',
      },
    },
    {
      id: 'limits',
      kicker: '05 · where the hype breaks',
      title: 'What The Demos {Do Not} Show You',
      seconds: 10,
      caption: 'These models are trained in the room they are tested in. Change the building and accuracy collapses. That famous clip is not Wi-Fi.',
      claim: true,
      source: 'DensePose from WiFi §5, limitations',
      note: 'Domain shift is the honest limit. The paper reports the drop itself; quoting it costs nothing and buys the whole argument credibility.',
      stats: [
        { label: 'training data', value: 'same room', tone: 'warn' },
        { label: 'unseen layout', value: 'accuracy drops', tone: 'good' },
        { label: 'now standardised', value: '802.11bf sensing', tone: 'alert' },
      ],
      panel: {
        type: 'pose',
        mode: 'blob',
        people: 2,
        status: 'raw model output',
        legend: 'this is the honest picture',
        footerRight: 'NO IDENTITY · NO FACES',
      },
    },
    {
      id: 'harden',
      kicker: '06 · wireless hardening',
      title: 'Contain Your [RF Boundary]',
      seconds: 10,
      caption: 'Sensing needs signal. Turn transmit power down to what your floor needs, move access points off exterior walls, film the glass.',
      claim: false,
      source: 'Illustrative model — verify with a site survey',
      stats: [
        { label: 'default install', value: '+20 dBm', tone: 'alert' },
        { label: 'tuned', value: '+12 dBm', tone: 'good' },
        { label: 'perimeter glass', value: 'attenuating film', tone: 'accent' },
      ],
      panel: {
        type: 'heatmap',
        spanM: 46,
        facadeY: 0.62,
        status: 'rf site survey',
        legend: 'the number that matters is at the kerb',
      },
    },
    {
      id: 'close',
      kicker: '07 · what to do monday',
      title: 'Survey It. {Then Turn It Down.}',
      seconds: 8,
      caption: 'Walk your own perimeter and log the strongest reading from the public pavement. Loud outside is your finding.',
      claim: false,
      source: '',
      stats: [
        { label: 'step one', value: 'walk the kerb', tone: 'accent' },
        { label: 'step two', value: 'log every dBm', tone: 'accent' },
        { label: 'step three', value: 'tune and retest', tone: 'good' },
      ],
      panel: {
        type: 'media',
        slot: 'closing-shot',
        status: 'closing shot',
        statusTone: 'good',
        hint: 'drop your own footage or leave the slot empty',
        footerLeft: 'your survey, your building',
        footerRight: 'MEASURE, DO NOT ASSUME',
      },
    },
  ],
};

/** Every episode shipped with the app. */
export const EPISODES = [WIFI_CSI];
