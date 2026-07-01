// Entry point: boots the background nebula, the floating icon field, the ignite
// orb, and the section tabs, then wires the cross-cutting bits (ignite, boot
// reveal, a throttled resize, and the hidden-tab animation freeze).
import { initNebula } from "./nebula.js";
import { initOrb } from "./orb.js";
import { initField } from "./field.js";
import { initTabs } from "./tabs.js";
import { initJourneyPath } from "./journey.js";
import { initCursor } from "./cursor.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const igniter = document.querySelector(".igniter");
const content = document.querySelector(".content");
const contentInner = document.querySelector(".content-inner");

// The field fires its shockwaves through the nebula, so build the nebula first.
const nebula = initNebula(reducedMotion);
const field = initField({ nebula, reducedMotion });
const journey = initJourneyPath(reducedMotion);
initCursor(reducedMotion); // pointer trail + click ripples, tinted by --accent

let orb = null; // the WebGL vortex on the igniter; set once its canvas has layout
let lenis = null; // smooth-scroll instance; stays null under reduced motion / no CDN

// Smooth scrolling, site-wide. .content is the only scroll container on the page
// (the sidebar/rail are fixed pillars), so wrapping it with Lenis makes every
// section glide — the Me-section journey rides on it, and any future scrolling
// panel inherits it for free. Loaded lazily from a CDN; if it fails (offline,
// blocked) we silently keep native scroll, and journey.js reads the scroll
// position either way, so nothing breaks.
if (!reducedMotion && content && contentInner) {
  import("https://cdn.jsdelivr.net/npm/lenis@1/+esm")
    .then(({ default: Lenis }) => {
      lenis = new Lenis({
        wrapper: content,
        content: contentInner,
        lerp: 0.075, // lower = smoother, slower-settling glide
        wheelMultiplier: 0.9,
      });
      const raf = (time) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    })
    .catch(() => {}); // CDN unavailable → native scroll
}

// Carry the background's signature band with the scroll: on the short Home panel
// it barely moves, but scrolling the tall Me journey drifts it up and off screen.
if (content && nebula) {
  content.addEventListener(
    "scroll",
    () => nebula.setScroll(content.scrollTop / window.innerHeight),
    { passive: true }
  );
}

function positionIgniter() {
  const { x, y } = field.getTarget();
  igniter.style.left = `${x}px`;
  igniter.style.top = `${y}px`;
}

// One-time "ignite": pop + fade the orb out (then tear it down), and hand off to
// the field to reveal the icons and run the load intro.
function ignite() {
  if (field.isIgnited()) return;
  // Fire the rainbow shockwave from the orb's centre: it sweeps across the dark
  // page, but the signature lines stay hidden until a coloured orb is picked.
  if (nebula) {
    const r = igniter.getBoundingClientRect();
    nebula.igniteWave([
      (r.left + r.width / 2) / window.innerWidth,
      1 - (r.top + r.height / 2) / window.innerHeight,
    ]);
  }
  igniter.classList.add("is-firing"); // pops and fades the orb out
  window.setTimeout(() => {
    igniter.remove();
    if (orb) orb.stop(); // tear down the orb's WebGL loop + context
  }, 480);
  field.ignite();
}
igniter.addEventListener("click", ignite);

// Boot: place the icons (hidden), then once the logos have decoded settle the
// real layout and reveal the ignite orb. Everything else waits for the click.
field.measureField(); // initial geometry; icons are placed once their logos decode

const imgs = [...document.querySelectorAll(".field .type img")];

Promise.all(
  imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {})))
).then(() => {
  field.measureField();
  field.seedIcons(); // band "home" spots; icons stay hidden until the orb is clicked
  field.renderAll();
  positionIgniter();
  orb = initOrb(igniter, reducedMotion); // start the rainbow vortex (or null)
  if (!orb) igniter.classList.add("no-gl"); // CSS fallback if WebGL is unavailable
  igniter.classList.add("is-shown"); // the orb fades in, waiting to be clicked
});

// Tabs: the field only exists on the Home panel, so refresh its geometry when
// Home becomes visible again, keep the (pre-ignite) orb centred, and run the
// drift loop only while Home is showing.
initTabs((id) => {
  if (id === "1") {
    field.measureField();
    if (!field.isIgnited()) {
      positionIgniter();
      if (orb) orb.resize();
    }
    field.startField();
  } else {
    field.stopField();
    journey.refresh();
  }
  if (lenis) {
    lenis.resize(); // the active panel's height (the scroll length) just changed
    lenis.scrollTo(0, { immediate: true }); // start each panel from the top
  }
});

// Throttled resize: coalesce the burst of resize events to one update per frame
// so we don't re-allocate the WebGL canvases + re-measure layout dozens of times
// per second during a drag.
let resizeQueued = false;
window.addEventListener("resize", () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    field.onResize();
    journey.refresh();
    if (!field.isIgnited()) {
      positionIgniter(); // keep the orb centred until it's clicked
      if (orb) orb.resize();
    }
    if (nebula) nebula.resize(); // resize + repaint the background canvas
  });
});

// Freeze the page animations/transitions while the tab is hidden.
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("frozen", document.hidden);
});
