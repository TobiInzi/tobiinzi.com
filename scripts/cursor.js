// Minimal cursor follower: a thin ring that eases toward the pointer, shrinks
// when it's over something clickable, and pulses on click. Each click plays ONE
// choreographed effect on a light canvas overlay: a ring IMPLODES to the point,
// and on impact it RELEASES a burst + ripple + halo together (gather, then bloom).
// Everything reads the live --accent through CSS, so it recolours with the
// selected type. Pointer-events off; skipped under reduced motion / touch.

// Anything that should make the ring contract (i.e. reads as interactive).
const CLICKABLE = "a, button, [role=button], input, label, select, summary, .type, .igniter";

const easeOut = (t) => 1 - (1 - t) ** 3;
const TAU = Math.PI * 2;
const RING_R = 19; // ring radius at scale 1 (matches the 38px .cursor-ring)

// "#009e59" -> "0, 158, 89" (for the click effect's rgba strings); null if unparsable.
function hexToRgbStr(hex) {
  const v = (hex || "").replace("#", "").trim();
  if (v.length < 6) return null;
  const n = parseInt(v.slice(0, 6), 16);
  return Number.isNaN(n) ? null : `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// Click choreography timing (seconds).
const IMPLODE_DUR = 0.4; // ring collapsing inward to the point
const RELEASE_DUR = 0.55; // burst + ripple + halo blooming outward
const CLICK_DUR = IMPLODE_DUR + RELEASE_DUR;

export function initCursor(reducedMotion = false) {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (reducedMotion || !fine) return;

  // --- the follower ring (DOM) ----------------------------------------------
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  document.body.appendChild(ring);

  let x = -100;
  let y = -100; // pointer target
  let rx = -100;
  let ry = -100; // eased ring position
  let scale = 1;
  let targetScale = 1; // 1 idle, <1 over a clickable
  let shown = false;
  let lastHit = -1; // throttle for the "what's under the pointer" recheck

  // --- click effects (canvas) -----------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:99;pointer-events:none;color:var(--accent)";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let cssW = 0;
  let cssH = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  let accent = [231, 231, 231];
  let lastAccent = -1;
  function refreshAccent(now) {
    if (now - lastAccent < 0.15) return;
    lastAccent = now;
    const m = getComputedStyle(canvas).color.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) accent = [+m[0], +m[1], +m[2]];
  }

  const clicks = []; // active click choreographies
  let clickToken = 0; // guards the ring fade-in against overlapping clicks

  // After clicking an orb, hold the ring on that orb's colour until the selected
  // --accent catches up (the orb flies to centre before the accent updates), so
  // the ring doesn't flash the previous accent when it reappears.
  let lockColor = null;
  let lockUntil = 0;

  // React to whatever is under the pointer: contract over any clickable, and take
  // on a hovered type orb's own colour (overriding the selected accent) — cleared
  // back to the accent when the pointer leaves it (unless a click lock is active).
  function applyHover(el) {
    const near = el && el.closest;
    targetScale = near && el.closest(CLICKABLE) ? 0.55 : 1;
    const orb = near && el.closest(".type");
    let color = orb ? getComputedStyle(orb).getPropertyValue("--type-color").trim() : "";
    if (!color && lockColor && performance.now() < lockUntil) color = lockColor;
    ring.style.borderColor = color || "";
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!shown) {
        rx = x;
        ry = y; // don't glide in from the corner on first sight
        shown = true;
        ring.classList.add("is-visible");
      }
      applyHover(e.target);
    },
    { passive: true }
  );
  window.addEventListener(
    "pointerdown",
    (e) => {
      // The effect stands in for the ring itself: it implodes from where the
      // ring currently sits (and at its current SIZE — smaller when it's already
      // contracted over a clickable), so hide the DOM ring and fade it back after.
      // Over a colour orb, use ITS colour (the selected accent hasn't caught up
      // yet at click time); otherwise fall back to the live accent in the loop.
      const orb = e.target && e.target.closest && e.target.closest(".type");
      const orbColor = orb ? getComputedStyle(orb).getPropertyValue("--type-color").trim() : "";
      const orbRgb = orb ? hexToRgbStr(orbColor) : null;
      if (orbColor) {
        // hold the ring on this colour across the reappear until --accent updates
        lockColor = orbColor;
        lockUntil = performance.now() + 1000;
      }
      clicks.push({
        x: shown ? rx : e.clientX,
        y: shown ? ry : e.clientY,
        start: performance.now() / 1000,
        spin: Math.random() * TAU,
        startR: RING_R * scale, // the ring's current visible radius
        rgb: orbRgb, // per-click colour override (null = use accent)
      });
      if (clicks.length > 6) clicks.shift();
      ring.classList.add("is-imploding"); // instant hide (see CSS)
      const token = ++clickToken;
      window.setTimeout(() => {
        if (token === clickToken) ring.classList.remove("is-imploding"); // fades back in
      }, 600);
    },
    { passive: true }
  );
  document.addEventListener("mouseleave", () => ring.classList.remove("is-visible"));
  document.addEventListener("mouseenter", () => shown && ring.classList.add("is-visible"));

  // --- the choreographed click, drawn at absolute time `t` (s) since it fired --
  function drawClick(c, t, rgb) {
    ctx.save();
    ctx.translate(c.x, c.y);

    if (t < IMPLODE_DUR) {
      // Phase 1 — a wide ring collapses inward to the point.
      const a = t / IMPLODE_DUR;
      const eo = easeOut(a);
      const fade = 1 - a;
      ctx.beginPath();
      ctx.arc(0, 0, (1 - eo) * Math.max(0, c.startR - 3) + 3, 0, TAU);
      ctx.lineWidth = 1.6 * fade + 0.5;
      ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, a * 2.2) * fade * 0.85})`;
      ctx.stroke();
    } else {
      // Phase 2 — impact: a bright flash, then ripple + halo + burst bloom out.
      const a = (t - IMPLODE_DUR) / RELEASE_DUR;
      const eo = easeOut(a);
      const fade = 1 - a;

      // impact flash (brief, right at the hand-off)
      if (a < 0.35) {
        const fa = 1 - a / 0.35;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 11);
        g.addColorStop(0, `rgba(${rgb}, ${fa * 0.75})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, TAU);
        ctx.fill();
      }

      // burst — dots flung radially outward
      const n = 8;
      const dist = eo * 24;
      ctx.fillStyle = `rgba(${rgb}, ${fade * 0.85})`;
      for (let i = 0; i < n; i++) {
        const ang = c.spin + (i / n) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * dist, Math.sin(ang) * dist, 2 * fade + 0.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function frame() {
    const now = performance.now() / 1000;
    refreshAccent(now);
    const rgb = `${accent[0]}, ${accent[1]}, ${accent[2]}`;

    // Re-check what's under the pointer even when it's still: a clicked orb flies
    // away, a tab switches — the hover target can change with no pointermove.
    if (shown && now - lastHit > 0.1) {
      lastHit = now;
      applyHover(document.elementFromPoint(x, y));
    }

    // ring
    rx += (x - rx) * 0.25;
    ry += (y - ry) * 0.25;
    scale += (targetScale - scale) * 0.2;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%) scale(${scale})`;

    // click choreographies
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.globalCompositeOperation = "lighter";
    for (let i = clicks.length - 1; i >= 0; i--) {
      const t = now - clicks[i].start;
      if (t >= CLICK_DUR) {
        clicks.splice(i, 1);
        continue;
      }
      drawClick(clicks[i], t, clicks[i].rgb || rgb);
    }
    ctx.globalCompositeOperation = "source-over";

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
