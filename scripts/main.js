// Entry point: boots the background nebula, the floating icon field, the ignite
// orb, and the section tabs, then wires the cross-cutting bits (ignite, boot
// reveal, a throttled resize, and the hidden-tab animation freeze).
import { initNebula } from "./nebula.js";
import { initOrb } from "./orb.js";
import { initField } from "./field.js";
import { initTabs } from "./tabs.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const igniter = document.querySelector(".igniter");

// The field fires its shockwaves through the nebula, so build the nebula first.
const nebula = initNebula(reducedMotion);
const field = initField({ nebula, reducedMotion });

let orb = null; // the WebGL vortex on the igniter; set once its canvas has layout

function positionIgniter() {
  const { x, y } = field.getTarget();
  igniter.style.left = `${x}px`;
  igniter.style.top = `${y}px`;
}

// One-time "ignite": pop + fade the orb out (then tear it down), and hand off to
// the field to reveal the icons and run the load intro.
function ignite() {
  if (field.isIgnited()) return;
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
