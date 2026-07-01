// Me-section "Index" scroller. A sticky stage holds a stack of scenes (date /
// title / paragraph + a ghost numeral); scroll drives a continuous cursor across
// them and journey.js cross-dissolves one into the next, each with its own bold
// move (rise, slide, zoom, tilt, 3D flip). The cursor has a flat "hold" band at
// every scene — a buffer, so stopping anywhere on a scene leaves it fully formed
// rather than stranded mid-transition. Lenis (main.js) smooths the scroll itself.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// Decelerates into and accelerates out of each scene during a transition.
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const HOLD_BAND = 1.4; // scroll weight a scene stays put (the buffer)
const MOVE_BAND = 1.0; //  ...and the weight of each transition
const FADE_IN = 0.16; // cursor distance a scene is fully opaque within
const FADE_OUT = 0.85; //  ...and is fully gone beyond
const BLUR = 6; // max blur (px) on an off-centre scene

export function initJourneyPath(reducedMotion = false) {
  const content = document.querySelector(".content");
  const panel = document.querySelector(".me-panel");
  const journey = document.querySelector(".journey");
  const stage = journey && journey.querySelector(".journey-stage");
  const rail = journey && journey.querySelector(".journey-rail");
  const railFill = journey && journey.querySelector(".journey-rail-fill");
  const railDot = journey && journey.querySelector(".journey-rail-dot");
  const scenes = journey
    ? [...journey.querySelectorAll(".scene")].map((el) => ({
        el,
        num: el.querySelector(".scene-num"),
        anim: el.dataset.anim || "rise",
      }))
    : [];

  if (!content || !panel || !stage || !scenes.length) {
    return { refresh() {} };
  }

  const n = scenes.length;
  let queued = false;

  // Raw scroll of the sticky stage through the tall track, 0..1.
  function scrollProgress() {
    const contentTop = content.getBoundingClientRect().top;
    const journeyRect = journey.getBoundingClientRect();
    const travel = Math.max(1, journeyRect.height - stage.getBoundingClientRect().height);
    return clamp((contentTop - journeyRect.top) / travel, 0, 1);
  }

  // Map raw scroll to a scene cursor (0..n-1) made of flat HOLD bands (the scene
  // sits still — the buffer) joined by eased MOVE bands (the transition).
  function cursor(t) {
    if (n === 1) return 0;
    const total = n * HOLD_BAND + (n - 1) * MOVE_BAND;
    let x = t * total;
    for (let i = 0; i < n; i++) {
      if (x <= HOLD_BAND) return i; // resting on scene i
      x -= HOLD_BAND;
      if (i < n - 1) {
        if (x <= MOVE_BAND) return i + easeInOut(x / MOVE_BAND); // i -> i+1
        x -= MOVE_BAND;
      }
    }
    return n - 1;
  }

  // Per-scene transform as a function of signed cursor distance d (0 = centred,
  // <0 = upcoming, >0 = passed). Each animation reads distinct but resolves to
  // identity at d = 0, so the active scene is always crisp and square.
  function transformFor(anim, d, w, h) {
    const dd = clamp(d, -1.3, 1.3);
    const ad = Math.abs(dd);
    switch (anim) {
      case "left":
        return `translate3d(${dd * w * 0.6}px, ${-dd * h * 0.04}px, 0) scale(${1 - ad * 0.04})`;
      case "right":
        return `translate3d(${-dd * w * 0.6}px, ${-dd * h * 0.04}px, 0) scale(${1 - ad * 0.04})`;
      case "zoom":
        return `translate3d(0, ${-dd * h * 0.05}px, 0) scale(${1 - ad * 0.5})`;
      case "rotate":
        return `translate3d(0, ${-dd * h * 0.16}px, 0) rotate(${dd * 7}deg) scale(${1 - ad * 0.04})`;
      case "flip":
        return `translate3d(0, ${-dd * h * 0.06}px, 0) rotateX(${dd * 60}deg) scale(${1 - ad * 0.04})`;
      case "rise":
      default:
        return `translate3d(0, ${-dd * h * 0.22}px, 0) scale(${1 - ad * 0.05})`;
    }
  }

  function update() {
    queued = false;
    if (panel.hidden) return;

    const c = cursor(scrollProgress());
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    const active = Math.round(c);

    for (let i = 0; i < n; i++) {
      const s = scenes[i];
      const d = c - i;
      const ad = Math.abs(d);

      s.el.style.opacity = String(1 - smoothstep(FADE_IN, FADE_OUT, ad));
      s.el.classList.toggle("is-active", i === active);
      s.el.setAttribute("aria-hidden", ad > 0.5 ? "true" : "false");

      if (!reducedMotion) {
        s.el.style.transform = transformFor(s.anim, d, w, h);
        s.el.style.filter = ad > 0.02 ? `blur(${Math.min(ad * BLUR, BLUR)}px)` : "";
        // ghost numeral drifts a touch further for parallax depth
        if (s.num) s.num.style.transform = `translate3d(0, ${-d * h * 0.06}px, 0)`;
      }
    }

    // Progress spine: fill + dot ride the cursor (and rest during hold bands).
    const f = n > 1 ? clamp(c / (n - 1), 0, 1) : 0;
    if (railFill) railFill.style.transform = `scaleY(${f})`;
    if (railDot && rail) {
      railDot.style.transform = `translate(-50%, ${f * rail.clientHeight - 4.5}px)`;
    }
  }

  function refresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  // Lenis drives the real scrollTop, so the native scroll event still fires each
  // frame while it eases — we just re-render off it (and on resize).
  content.addEventListener("scroll", refresh, { passive: true });
  window.addEventListener("resize", refresh);
  refresh();

  return { refresh };
}
