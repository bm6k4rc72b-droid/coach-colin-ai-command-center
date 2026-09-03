/**
 * Lab — The Field Scanner.
 *
 * The phone camera pointed at a QR code, with the destination pulled apart
 * before anybody follows it. Quishing — QR codes on parking meters, on
 * posters, in emails as an image so link scanners cannot read them — works
 * precisely because the destination is invisible until you have arrived.
 *
 * Decoding uses the platform `BarcodeDetector` where it exists (Android
 * Chrome, recent Safari). Where it does not, the same analysis is available
 * by pasting or typing a link, so the lesson is never gated on hardware.
 *
 * @module nexus/labs/scanner
 */

import { el, fill } from '../dom.js';
import { Lens } from '../camera.js';
import { analyzeUrl } from '../security.js';

/**
 * Mount the scanner.
 *
 * @param {HTMLElement} root Container.
 * @param {object} ctx Console services, including a shared {@link Lens}.
 * @returns {{ destroy: () => void }} Lab handle.
 */
export function mount(root, ctx) {
  const video = el('video.scan-video', { playsinline: '', muted: '', autoplay: '' });
  const status = el('p.dim', { text: Lens.supported ? 'Camera idle.' : 'No camera API in this browser — use the manual field below.' });
  const report = el('div.scan-report');
  const manual = el('input.field', {
    type: 'text',
    placeholder: 'or paste a link to pull apart',
    'aria-label': 'Link to analyse',
  });

  const lens = ctx.lens || new Lens(video);
  lens.video = video;
  let scanning = false;
  let timer = null;

  /**
   * Render a URL risk report.
   *
   * @param {string} value The decoded or typed string.
   */
  const show = (value) => {
    const analysis = analyzeUrl(value);
    fill(report, [
      el('div.scan-head', { class: `lvl-${analysis.level}` }, [
        el('b', { text: analysis.level.toUpperCase() }),
        el('span', { text: `${analysis.score}/100 structural risk` }),
      ]),
      el('code.scan-url', { text: analysis.url }),
      analysis.host ? el('p', {}, [
        el('span.dim', { text: 'The only part that decides where you go: ' }),
        el('b', { text: analysis.host.split('.').slice(-2).join('.') }),
      ]) : null,
      ...analysis.signals.map((s) => el('div.signal', { class: s.weight >= 25 ? 'high' : s.weight >= 12 ? 'mid' : 'low' }, [
        el('span.signal-w', { text: s.weight ? `+${s.weight}` : '—' }),
        el('span', { text: s.text }),
      ])),
      el('p.dim.small', { text: 'This reads structure only. It does not fetch the page, and it cannot tell you a well-formed link is safe — a compromised legitimate site scores zero here.' }),
    ]);
    if (analysis.score >= 55) ctx.speak?.('That link is hostile. The domain is not who it claims to be.', { interrupt: true });
  };

  manual.addEventListener('input', () => {
    if (manual.value.trim().length > 3) show(manual.value.trim());
  });

  /** Poll the camera for codes. */
  const loop = async () => {
    if (!scanning) return;
    const codes = await lens.scanCodes();
    if (codes.length) {
      const first = codes[0];
      status.textContent = `Decoded ${first.format}: ${first.raw.slice(0, 80)}`;
      show(first.raw);
      ctx.progress?.unlock('field-agent');
      ctx.progress?.recordLab('scanner', 50);
      if (navigator.vibrate) navigator.vibrate(30);
    }
    timer = setTimeout(loop, 450);
  };

  /** Start the camera and the decode loop. */
  const start = async () => {
    const result = await lens.start('environment');
    if (!result.ok) {
      status.textContent = result.error;
      return;
    }
    scanning = true;
    status.textContent = Lens.canScanCodes
      ? 'Scanning. Point the camera at a QR code.'
      : 'Camera live, but this browser has no barcode decoder. Use the field below, or open the console in Chrome on Android.';
    loop();
  };

  /** Stop everything. */
  const stop = () => {
    scanning = false;
    clearTimeout(timer);
    lens.stop();
    status.textContent = 'Camera idle.';
  };

  fill(root, [
    el('div.lab-head', {}, [el('h3', { text: 'The Field Scanner' })]),
    el('p.dim', { text: 'A QR code is a link you cannot read. That is the entire attack: on a poster, on a parking meter, embedded in an email as an image so the link scanner sees only a picture. Decode it here first.' }),
    el('div.scan-frame', {}, [video, el('div.reticle')]),
    el('div.row', {}, [
      el('button.btn.primary', { type: 'button', onclick: start }, ['Start camera']),
      el('button.btn', { type: 'button', onclick: () => lens.flip() }, ['Flip']),
      el('button.btn', { type: 'button', onclick: () => lens.toggleTorch() }, ['Torch']),
      el('button.btn', { type: 'button', onclick: stop }, ['Stop']),
    ]),
    status,
    manual,
    report,
  ]);

  show('https://login.microsoftonline.com.session-verify.m365-security-alert.com/auth?next=%2Fmail');
  return {
    destroy: () => {
      stop();
      fill(root, []);
    },
  };
}
