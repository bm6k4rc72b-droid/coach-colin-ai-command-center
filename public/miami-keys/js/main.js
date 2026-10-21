/**
 * The film: one pinned stage, thirteen scenes, one scroll timeline.
 *
 * Every scene is a layer on the same stage. A single ScrollTrigger pins the
 * stage for the whole film and scrubs one GSAP timeline whose unit is a
 * viewport height, so `layout()` in scenes.js is the only place pacing lives.
 * The Seedance clips are not played — their playhead follows the scroll, so the
 * doors open, the cars turn and the camera moves exactly as fast as the reader
 * scrolls. On phones the clips loop instead (scrubbing video on iOS stutters),
 * and the holds are shorter.
 *
 * @module miami-keys/main
 */

import {
  SCENES, FLEET, FADE, COPY, layout, sceneAt, clipProgress, copyWindow, price,
} from './scenes.js';
import { MEDIA } from './media.js';

const { gsap, ScrollTrigger, Lenis } = window;
const root = document.documentElement;
const mobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('stage');
const sceneEls = SCENES.map((s) => stage.querySelector(`[data-scene="${s.id}"]`));

/* ---------- media ---------------------------------------------------------- */

/** Per-scene runtime state: the clip and where its playhead should be. */
const clips = SCENES.map(() => ({ video: null, target: 0, ready: false }));

sceneEls.forEach((el, i) => {
  const holder = el.querySelector('.media');
  const entry = holder && MEDIA[holder.dataset.media];
  if (!entry) return;
  const img = new Image();
  img.src = entry.poster;
  img.alt = entry.alt || '';
  img.decoding = 'async';
  if (i > 1) img.loading = 'lazy';
  holder.append(img);
  if (reduced || !entry.video) return;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.preload = 'none';
  video.poster = entry.poster;
  if (mobile) video.loop = true;
  holder.append(video);
  clips[i].video = video;
});

function once(target, event, ms) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); target.removeEventListener(event, done); resolve(); };
    const timer = setTimeout(done, ms);
    target.addEventListener(event, done, { once: true });
  });
}

/**
 * Load one clip. On desktop the file is pulled into memory first when the CDN
 * allows it, because seeking a blob is instant while seeking over HTTP waits
 * on a range request every frame. If CORS refuses, stream it directly.
 */
async function loadClip(i) {
  const clip = clips[i];
  const { video } = clip;
  if (!video) return;
  const url = MEDIA[sceneEls[i].querySelector('.media').dataset.media].video;
  if (!mobile) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));
      video.src = URL.createObjectURL(await res.blob());
    } catch {
      video.src = url;
    }
  } else {
    video.src = url;
  }
  video.preload = 'auto';
  await once(video, 'loadeddata', 15000);
  if (video.readyState >= 2) {
    clip.ready = true;
    video.parentElement.classList.add('has-video');
  }
}

/* ---------- key tray ------------------------------------------------------- */

const grid = document.getElementById('keyGrid');
grid.innerHTML = FLEET.map((car) => `
  <li class="key" style="--c:${car.accent}">
    <div class="key__img"><img src="${MEDIA[car.key].poster}" alt="${MEDIA[car.key].alt}" loading="lazy" decoding="async"></div>
    <h3>${car.short}</h3>
    <p class="key__specs">${car.specs.join(' · ')}</p>
    <div class="key__foot">
      <span class="key__price">${price(car.price)}<small> /day</small></span>
      <button class="btn" type="button" data-book="${car.id}">Take this key</button>
    </div>
  </li>`).join('');

/* ---------- booking -------------------------------------------------------- */

const dialog = document.getElementById('book');
const form = document.getElementById('bookForm');
const totalEl = document.getElementById('bookTotal');
const noteEl = document.getElementById('bookNote');
let chosen = FLEET[0];

function days() {
  const from = new Date(form.from.value);
  const to = new Date(form.to.value);
  const n = Math.round((to - from) / 86400000);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function renderTotal() {
  const n = days();
  totalEl.textContent = n
    ? `${n} day${n > 1 ? 's' : ''} · ${price(n * chosen.price)}`
    : form.from.value && form.to.value ? 'Return after pick-up' : `${price(chosen.price)} per day`;
}

function openBooking(id) {
  chosen = FLEET.find((c) => c.id === id) || FLEET[0];
  document.getElementById('bookEyebrow').textContent = `Your key · ${price(chosen.price)}/day`;
  document.getElementById('bookTitle').textContent = chosen.name;
  dialog.style.setProperty('--accent', chosen.accent);
  const today = new Date().toISOString().slice(0, 10);
  form.from.min = today;
  form.to.min = today;
  noteEl.textContent = 'Concept site — nothing is sent or charged.';
  renderTotal();
  dialog.showModal();
}

grid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-book]');
  if (btn) openBooking(btn.dataset.book);
});
form.addEventListener('input', renderTotal);
form.addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  e.preventDefault();
  if (!days()) { renderTotal(); return; }
  noteEl.textContent = `Noted: the ${chosen.short} for ${days()} day${days() > 1 ? 's' : ''}. This is a concept site, so no request was sent.`;
});

/* ---------- static fallback ------------------------------------------------ */

function goStatic() {
  root.classList.add('static');
  clips.forEach((clip, i) => {
    if (!clip.video) return;
    clip.video.loop = true;
    clip.video.autoplay = true;
    loadClip(i).then(() => clip.video.play().catch(() => {}));
  });
  document.getElementById('loader').classList.add('is-done');
}

if (!gsap || !ScrollTrigger) {
  goStatic();
} else {
  runFilm();
}

/* ---------- the film ------------------------------------------------------- */

function runFilm() {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const { total, slots } = layout(SCENES, { mobile });
  const last = SCENES.length - 1;
  const tl = gsap.timeline({ defaults: { ease: 'none' } });

  sceneEls.forEach((el, i) => {
    const slot = slots[i];
    const media = el.querySelector('.media');
    const frames = el.querySelectorAll('.media img, .media video');
    const copy = el.querySelectorAll('.copy > *, .keys__grid > li');
    const words = copyWindow(slot, i === 0);

    if (i > 0) {
      // cross-fade in over the previous scene, settling from a slight push
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: FADE }, slot.start);
      if (media) {
        tl.fromTo(media, { scale: 1.1, y: 30 }, { scale: 1, y: 0, duration: FADE + 0.8, ease: 'power2.out' }, slot.start);
      }
      tl.fromTo(copy,
        { autoAlpha: 0, y: 46, filter: 'blur(10px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: COPY.in, stagger: { amount: COPY.stagger }, ease: 'power3.out' },
        words.enter);
    }

    // slow drift for the moving shots; spins stay locked so the car turns in place
    if (frames.length && SCENES[i].kind !== 'spin') {
      tl.fromTo(frames, { scale: 1 }, { scale: 1.07, duration: slot.end - slot.start }, slot.start);
    }

    if (i < last) {
      tl.to(copy,
        { autoAlpha: 0, y: -34, filter: 'blur(8px)', duration: COPY.out * 0.85, stagger: { amount: COPY.out * 0.15 }, ease: 'power2.in' },
        words.leave);
      if (media) tl.to(media, { scale: 1.04, duration: FADE }, slot.end - FADE);
      tl.set(el, { autoAlpha: 0 }, slot.end); // fully covered by the next scene by now
    }
  });
  tl.set({}, {}, total);

  const hero = sceneEls[0];
  tl.to(hero.querySelector('.scroll-cue'), { autoAlpha: 0, duration: 0.3 }, 0.05);

  /* rail + nav */
  const rail = document.getElementById('rail');
  rail.innerHTML = SCENES.map(() => '<li></li>').join('');
  const ticks = [...rail.children];
  const navLinks = [...document.querySelectorAll('.nav__menu a')];
  const navOwner = (i) => {
    let owner = 0;
    SCENES.forEach((s, j) => { if (s.nav && j <= i) owner = j; });
    return SCENES[owner].id;
  };
  const dials = sceneEls.map((el) => el.querySelector('.dial'));

  let current = -1;
  function update(t) {
    const now = sceneAt(slots, t);
    if (now !== current) {
      current = now;
      ticks.forEach((li, j) => li.classList.toggle('is-on', j === now));
      const owner = navOwner(now);
      navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.jump === owner));
    }
    slots.forEach((slot, i) => {
      const live = t >= slot.start - 0.2 && t <= slot.end + 0.2;
      const p = clipProgress(slot, t, i === 0);
      const clip = clips[i];
      if (clip.video) {
        clip.target = p;
        if (mobile && clip.ready) {
          if (live && clip.video.paused) clip.video.play().catch(() => {});
          if (!live && !clip.video.paused) clip.video.pause();
        }
      }
      if (dials[i] && live) {
        const deg = Math.round(p * 360);
        dials[i].querySelector('.dial__deg').textContent = `${deg}°`;
        dials[i].querySelector('.dial__arc').style.strokeDashoffset = String(360 - deg);
      }
    });
  }

  const st = ScrollTrigger.create({
    trigger: '#film',
    start: 'top top',
    end: () => `+=${total * window.innerHeight}`,
    pin: stage,
    scrub: mobile ? true : 0.8,
    animation: tl,
    invalidateOnRefresh: true,
    onUpdate: (self) => update(self.progress * total),
  });
  update(0);

  /* playhead follows the scroll (desktop): ease toward the target each frame,
     never queue a seek while one is still in flight */
  if (!mobile) {
    gsap.ticker.add(() => {
      clips.forEach((clip) => {
        const v = clip.video;
        if (!clip.ready || v.seeking || !v.duration) return;
        const want = clip.target * (v.duration - 0.05);
        const diff = want - v.currentTime;
        if (Math.abs(diff) < 0.015) return;
        v.currentTime = v.currentTime + diff * 0.35;
      });
    });
  }

  /* smooth wheel scrolling on desktop */
  let lenis = null;
  if (Lenis && !mobile && !reduced) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    root.classList.add('lenis');
  }

  /* nav jumps land where the scene's copy has fully arrived */
  document.querySelectorAll('[data-jump]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.dataset.jump;
      const i = SCENES.findIndex((s) => s.id === id);
      const t = i <= 0 ? 0 : copyWindow(slots[i]).settled + 0.1;
      const y = st.start + t * window.innerHeight;
      if (lenis) lenis.scrollTo(y, { duration: 2.4, easing: (x) => 1 - Math.pow(1 - x, 4) });
      else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* loader: hero poster + hero clip, then the rest in running order */
  const bar = document.getElementById('loaderBar');
  const label = document.getElementById('loaderLabel');
  const heroImg = hero.querySelector('.media img');
  const firstLoads = [
    heroImg && !heroImg.complete ? once(heroImg, 'load', 8000) : Promise.resolve(),
    loadClip(0),
  ];
  let settled = 0;
  firstLoads.forEach((p) => p.then(() => { settled += 1; bar.style.width = `${(settled / firstLoads.length) * 100}%`; }));
  setTimeout(() => { label.textContent = 'Lighting up Ocean Drive'; }, 1400);

  const reveal = () => {
    document.getElementById('loader').classList.add('is-done');
    gsap.from(hero.querySelectorAll('.copy > *'), {
      autoAlpha: 0, y: 50, filter: 'blur(12px)', duration: 1.4, stagger: 0.14, ease: 'power3.out', delay: 0.3,
    });
    gsap.from(hero.querySelector('.media'), { scale: 1.12, duration: 2.6, ease: 'power2.out' });
    gsap.from('#nav', { autoAlpha: 0, y: -20, duration: 1.2, delay: 0.6, ease: 'power2.out' });
  };
  Promise.race([Promise.all(firstLoads), new Promise((r) => setTimeout(r, 6000))]).then(async () => {
    reveal();
    for (let i = 1; i < clips.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await loadClip(i);
    }
  });

  window.addEventListener('load', () => ScrollTrigger.refresh());
}
