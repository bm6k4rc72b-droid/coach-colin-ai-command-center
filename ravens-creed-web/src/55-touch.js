// ===== Touch controls for phones: floating joystick, swipe-to-look, action buttons =====
(function setupTouch() {
  const layer = $('touchLayer'), base = $('joyBase'), knob = $('joyKnob'), R = 56;
  let joyId = null, lookId = null, jx = 0, jy = 0, lx = 0, ly = 0, pinch = null;
  const touches = new Map();
  const resetJoy = () => { joyId = null; TOUCHIN.x = TOUCHIN.y = TOUCHIN.mag = 0; base.classList.remove('active'); base.style.left = ''; base.style.top = ''; knob.style.transform = ''; };
  layer.addEventListener('pointerdown', (e) => {
    e.preventDefault(); touches.set(e.pointerId, [e.clientX, e.clientY]);
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (touches.size === 2 && lookId !== null && joyId === null) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: cam.dist }; return; }
    if (e.clientX < innerWidth * 0.45 && joyId === null) {
      joyId = e.pointerId; jx = e.clientX; jy = e.clientY;
      base.classList.add('active'); base.style.left = `${jx}px`; base.style.top = `${jy}px`;
    } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
  });
  layer.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return; e.preventDefault(); touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); cam.dist = clamp(pinch.dist * (pinch.d / Math.max(20, d)), 1.6, 14); return; }
    if (e.pointerId === joyId) {
      let dx = e.clientX - jx, dy = e.clientY - jy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      TOUCHIN.x = dx / R; TOUCHIN.y = dy / R; TOUCHIN.mag = Math.min(1, l / R);
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === lookId && !UI_STATE.map) {
      cam.yaw -= (e.clientX - lx) * 0.0075; cam.pitch = clamp(cam.pitch + (e.clientY - ly) * 0.0055, -0.55, 1.25);
      lx = e.clientX; ly = e.clientY;
    }
  });
  const end = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (e.pointerId === joyId) resetJoy(); if (e.pointerId === lookId) lookId = null; };
  layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end); layer.addEventListener('lostpointercapture', end);
  // buttons
  const press = (code) => { onKey({ code, preventDefault() {}, repeat: false }, true); onKey({ code, preventDefault() {}, repeat: false }, false); };
  const btn = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* ignore */ } });
  btn('tbJump', () => press('Space'));
  btn('tbAct', () => press('KeyE'));
  btn('tbAtk', () => attack('light'));
  btn('tbHeavy', () => attack('heavy'));
  btn('tbDodge', () => dodge());
  btn('tbMap', () => press('Tab'));
  btn('tbCrouch', () => press('KeyC'));
  btn('tbRun', () => { TOUCHIN.run = !TOUCHIN.run; $('tbRun').setAttribute('aria-pressed', TOUCHIN.run); });
  // tapping the prompt or the dialogue box acts too (works with a mouse as well)
  $('prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); press('KeyE'); });
  $('dialog').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); press('KeyE'); });
  $('mapOverlay').addEventListener('pointerdown', (e) => { if (IS_TOUCH && e.target.id !== 'mapClose') { e.preventDefault(); toggleMap(); } });
  // stop iOS page zoom / bounce
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (UI_STATE.started) e.preventDefault(); }, { passive: false });
  if (IS_TOUCH) document.body.classList.add('touch-ready');
})();
function updateTouchHud() {
  if (!IS_TOUCH) return;
  const b = $('tbAct'); b.classList.toggle('ready', !!PROMPT_TARGET || !!UI_STATE.dialog || player.mode === 'sit'); $('tbCrouch').setAttribute('aria-pressed', player.mode === 'crouch');

}
