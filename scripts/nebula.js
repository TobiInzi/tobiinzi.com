// Background (WebGL): the page stays DARK; the only thing the shader draws is one
// crisp signature element — a set of flowing lines confined to a horizontal band
// (everything outside the band is pure dark, so it never crowds the text). The
// lines are neutral grey by default and take on the selected type's colour. Three
// line variants (flow / ribbons / wave) are tied to the type icons for live
// comparison; see variantOf. Picking a type fires a SHOCKWAVE from the page centre
// that cross-dissolves the old element+colour into the new one behind its front,
// and the band rides u_scroll so it drifts up and off as a long page scrolls.
import { VERT, makeProgram, setupFullscreenTriangle } from "./gl.js";

export const NONE_COLOR = [0.0, 0.0, 0.0]; // no selection -> blobs vanish, dark space
const WAVE_DURATION = 1.1; // seconds for the shockwave to cross the screen
const WAVE_MAX_R = 1.7; // front radius (aspect-corrected uv) that covers the page

const FRAG = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec2  u_res;
  uniform float u_time;
  uniform vec3  u_colorOld;   // tint outside the shockwave front
  uniform vec3  u_colorNew;   // tint inside (already passed by) the front
  uniform float u_seedOld;    // nebula identity outside the front
  uniform float u_seedNew;    // nebula identity inside the front
  uniform vec2  u_waveOrigin; // wave centre, uv (y-up)
  uniform float u_waveRadius; // current front radius; huge = no active wave
  uniform float u_waveInvert; // 0 = expand (new inside), 1 = collapse (new outside)
  uniform float u_scroll;     // page scroll in uv units; carries the band off-screen
  uniform float u_revealOld;  // line visibility outside the front (0 = pure dark)
  uniform float u_revealNew;  // line visibility inside (already passed by) the front
  uniform float u_rainbow;    // 1 = the ignite reveal wave, whose front is a rainbow

  // Hash for the dither only; the line styles below are pure sin(), no noise.
  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  // HSV -> RGB, for the rainbow front of the ignite wave (hue from the angle).
  vec3 hsv2rgb(vec3 c){
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  const vec3 BASE = vec3(0.039, 0.039, 0.051); // charcoal floor (favicon #0a0a0d)

  // The signature element: a crisp set of flowing lines confined to a horizontal
  // band (see main), dark everywhere else so it never crowds the text. Three
  // variants are tied to the type icons for live comparison. Each takes an aspect-
  // corrected x and a band-local y (by; 0 = band centre line) and returns a line-
  // coverage mask; smoothstep(w, 0.0, dist) makes an anti-aliased, crisp edge.

  // Variant 0 -- FLOW: a stack of thin, evenly spaced lines, each gently flowing.
  float vFlow(float x, float by, float t){
    float L = 0.0;
    for (int k = 0; k < 7; k++){
      float fk = float(k);
      float base = (fk - 3.0) * 0.045;
      float warp = 0.020 * sin(x * 3.0 + t * 0.5 + fk)
                 + 0.014 * sin(x * 1.7 - t * 0.3 + fk * 2.0);
      L += smoothstep(0.006, 0.0, abs(by - base - warp));
    }
    return L;
  }

  // Variant 1 -- RIBBONS: a few bold flowing lines, each wrapped in a soft glow.
  float vRibbon(float x, float by, float t){
    float L = 0.0;
    for (int k = 0; k < 4; k++){
      float fk = float(k);
      float base = (fk - 1.5) * 0.085;
      float warp = 0.050 * sin(x * 1.5 + t * 0.4 + fk * 1.7)
                 + 0.028 * sin(x * 0.8 - t * 0.25 + fk);
      float d = abs(by - base - warp);
      L += smoothstep(0.015, 0.0, d) * 0.9;   // bold core
      L += smoothstep(0.050, 0.0, d) * 0.14;  // soft glow
    }
    return L;
  }

  // Variant 2 -- WAVE: a single crisp oscilloscope line (a sum of sines) with a
  // soft glow and a faint echo below it, for a minimal one-line hero.
  float vWave(float x, float by, float t){
    float w = 0.060 * sin(x * 2.0 + t * 0.8)
            + 0.028 * sin(x * 5.0 - t * 1.1)
            + 0.014 * sin(x * 9.0 + t * 0.6);
    float d = abs(by - w);
    float L = smoothstep(0.009, 0.0, d);
    L += smoothstep(0.040, 0.0, d) * 0.18;                 // glow
    L += smoothstep(0.006, 0.0, abs(by + w * 0.5)) * 0.35; // faint echo
    return L;
  }

  float variantL(int v, float x, float by, float t){
    if (v == 0) return vFlow(x, by, t);
    else if (v == 1) return vRibbon(x, by, t);
    return vWave(x, by, t);
  }

  // Map a type index (the seed) to a variant. -1 (no selection) -> 0, so idle
  // Home shows the flow lines in neutral grey.
  int variantOf(float s){
    int i = int(s + 0.5);
    if (i == 1 || i == 5 || i == 9 || i == 8) return 1; // Fire, Fighting, Fairy, Dragon
    if (i == 3 || i == 4 || i == 6) return 2;           // Lightning, Psychic, Darkness
    return 0;                                           // Water, Grass, Metal, Colorless
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / u_res;
    float aspect = u_res.x / u_res.y;
    float t = u_time;
    float x = uv.x * aspect;

    // The element lives in one horizontal band. It rides u_scroll, so scrolling a
    // long page (the Me journey) carries it up and off-screen, while the short
    // Home panel keeps it in place. Outside the band env -> 0, i.e. pure dark.
    float by = uv.y - (0.46 + u_scroll);
    float env = 1.0 - smoothstep(0.18, 0.31, abs(by));

    // shockwave (unchanged): a radial front that cross-dissolves the old element
    // and colour into the new ones as it expands (or collapses back on release).
    vec2 wd = uv - u_waveOrigin;
    wd.x *= aspect;
    float wdist = length(wd);
    float expand = 1.0 - smoothstep(u_waveRadius - 0.07, u_waveRadius, wdist);
    float collapse = smoothstep(u_waveRadius, u_waveRadius + 0.07, wdist);
    float passed = mix(expand, collapse, u_waveInvert);

    // Line visibility cross-dissolves across the front too, so the page starts
    // DARK (reveal 0) and the ignite wave paints the lines in behind its front.
    float reveal = mix(u_revealOld, u_revealNew, passed);
    float Lold = variantL(variantOf(u_seedOld), x, by, t);
    float Lnew = variantL(variantOf(u_seedNew), x, by, t);
    float L = mix(Lold, Lnew, passed) * env * reveal;

    // Colour: crisp neutral-grey lines by default; the picked type's colour washes
    // in across the front (sel ~ 0 when nothing is selected, so the lines stay grey).
    vec3 tint = mix(u_colorOld, u_colorNew, passed);
    float sel = smoothstep(0.02, 0.22, max(max(tint.r, tint.g), tint.b));
    vec3 lineCol = mix(vec3(0.60, 0.62, 0.68), clamp(tint * 1.3, 0.0, 1.0), sel);

    vec3 col = BASE + L * lineCol;

    // the wave front flares the lines it crosses — a travelling highlight. The
    // ignite wave is special: its front is a rainbow (hue from the angle) and it
    // flashes across the whole band, not just the lines, so it reads as a rainbow
    // shockwave sweeping out and leaving the (grey) lines behind it.
    float ring = exp(-pow((wdist - u_waveRadius) / 0.05, 2.0));
    vec3 rimColor = mix(u_colorNew, u_colorOld, u_waveInvert);
    if (u_rainbow > 0.5){
      float ang = atan(wd.y, wd.x);
      rimColor = hsv2rgb(vec3(ang / 6.2831853 + u_time * 0.06, 0.85, 1.0));
    }
    col += rimColor * ring * L * 0.9;
    col += rimColor * ring * env * u_rainbow * 0.22;

    // a whisper of dither to keep the dark from banding
    col += (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.006;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

// Compile the shader, paint one frame immediately, then animate it (unless
// reduced motion). The browser pauses rAF while the tab is hidden, so the loop
// idles on its own. Returns { resize, startWave } or null if WebGL is missing.
export function initNebula(reducedMotion) {
  const canvas = document.getElementById("bg");
  const gl =
    canvas &&
    canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
  if (!gl) return null; // graceful: the body's --bg color shows through

  // If the shaders fail to compile/link (e.g. a GPU without highp support), bail
  // so the body's --bg colour shows through instead of a black canvas.
  const prog = makeProgram(gl, VERT, FRAG);
  if (!prog) return null;
  gl.useProgram(prog);
  setupFullscreenTriangle(gl, prog);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uColorOld = gl.getUniformLocation(prog, "u_colorOld");
  const uColorNew = gl.getUniformLocation(prog, "u_colorNew");
  const uSeedOld = gl.getUniformLocation(prog, "u_seedOld");
  const uSeedNew = gl.getUniformLocation(prog, "u_seedNew");
  const uWaveOrigin = gl.getUniformLocation(prog, "u_waveOrigin");
  const uWaveRadius = gl.getUniformLocation(prog, "u_waveRadius");
  const uWaveInvert = gl.getUniformLocation(prog, "u_waveInvert");
  const uScroll = gl.getUniformLocation(prog, "u_scroll");
  const uRevealOld = gl.getUniformLocation(prog, "u_revealOld");
  const uRevealNew = gl.getUniformLocation(prog, "u_revealNew");
  const uRainbow = gl.getUniformLocation(prog, "u_rainbow");

  const SCALE = 0.8; // render below CSS resolution; high enough to keep the
  // constellation's points and the grid's dots crisp (the soft styles forgive it)
  let w = 0;
  let h = 0;
  const resizeBuffer = () => {
    w = Math.max(1, Math.round(window.innerWidth * SCALE));
    h = Math.max(1, Math.round(window.innerHeight * SCALE));
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  };
  resizeBuffer(); // the page-level resize handler drives subsequent resizes

  let displayed = [...NONE_COLOR]; // steady-state tint (everything, post-wave)
  // Steady-state nebula identity. Starts at -1, a seed no type uses (they're
  // icon indices 0..n), so the very first selection — including the index-0
  // type — always reshapes the field rather than only fading colour in.
  let displayedSeed = -1;
  // Steady-state line visibility. Starts at 0 so the page is pure dark until the
  // ignite wave reveals the lines; every wave after that keeps it at 1.
  let displayedReveal = 0;
  let wave = null; // { origin, old, next, oldSeed, nextSeed, start } while crossing
  let scrollUv = 0; // page scroll in uv units; shifts the band up as you scroll

  const draw = (time) => {
    let oldC = displayed;
    let newC = displayed;
    let oldS = displayedSeed;
    let newS = displayedSeed;
    let oldR = displayedReveal;
    let newR = displayedReveal;
    let rainbow = 0.0;
    let origin = [0.5, 0.5];
    let radius = 100.0; // huge -> "wave already everywhere", no rim
    let invert = 0.0;
    let done = null; // wave.onDone, fired after the completed wave is torn down
    if (wave) {
      const progress = (time - wave.start) / WAVE_DURATION;
      if (progress >= 1) {
        displayed = wave.next; // wave finished: new nebula is now everywhere
        displayedSeed = wave.nextSeed;
        displayedReveal = wave.nextReveal;
        done = wave.onDone;
        wave = null;
        // Paint the settled state THIS frame too: oldC/newC were captured from
        // the previous `displayed` above, so without this the completion frame
        // would flash the OLD nebula across the whole screen for one frame.
        oldC = displayed;
        newC = displayed;
        oldS = displayedSeed;
        newS = displayedSeed;
        oldR = displayedReveal;
        newR = displayedReveal;
      } else {
        oldC = wave.old;
        newC = wave.next;
        oldS = wave.oldSeed;
        newS = wave.nextSeed;
        oldR = wave.oldReveal;
        newR = wave.nextReveal;
        rainbow = wave.rainbow ? 1.0 : 0.0;
        origin = wave.origin;
        // expand grows the front 0 -> max; collapse shrinks it max -> 0
        radius = (wave.reverse ? 1 - progress : progress) * wave.maxR;
        invert = wave.reverse ? 1.0 : 0.0;
      }
    }
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, time);
    gl.uniform3f(uColorOld, oldC[0], oldC[1], oldC[2]);
    gl.uniform3f(uColorNew, newC[0], newC[1], newC[2]);
    gl.uniform1f(uSeedOld, oldS);
    gl.uniform1f(uSeedNew, newS);
    gl.uniform2f(uWaveOrigin, origin[0], origin[1]);
    gl.uniform1f(uWaveRadius, radius);
    gl.uniform1f(uWaveInvert, invert);
    gl.uniform1f(uScroll, scrollUv);
    gl.uniform1f(uRevealOld, oldR);
    gl.uniform1f(uRevealNew, newR);
    gl.uniform1f(uRainbow, rainbow);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Notify AFTER drawing the settled frame (and after `wave` is cleared, so a
    // callback that starts a new wave isn't immediately overwritten).
    if (done) done();
  };

  const now = () => performance.now() / 1000;
  draw(now()); // one frame up front (covers first paint + reduced motion)

  if (!reducedMotion) {
    const frame = () => {
      draw(now());
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  return {
    // Repaint after a canvas resize (called by the page-level resize handler).
    // Resizing clears the canvas buffer, so redraw immediately — important under
    // reduced motion where there's no rAF loop to repaint the next frame.
    resize() {
      resizeBuffer();
      draw(now());
    },
    // Feed the page scroll (in uv units, y-up) so the band drifts up and off as a
    // long page scrolls. Under reduced motion there's no loop, so repaint here.
    setScroll(uvY) {
      scrollUv = uvY;
      if (reducedMotion) draw(now());
    },
    // A one-off RAINBOW shockwave from `origin` (uv), fired when the main orb is
    // ignited. It sweeps across the dark page for drama but does NOT reveal the
    // lines — those stay hidden until a coloured type orb is picked.
    igniteWave(origin) {
      this.startWave(origin, NONE_COLOR, null, { rainbow: true });
    },
    // Launch a shockwave from `origin` (uv) that repaints the field to `next`
    // and reshapes it to `nextSeed`'s nebula. Pass `nextSeed = null` to keep the
    // current layout (e.g. clearing: only the tint needs to wash away).
    // `opts.reverse` collapses the front inward instead of expanding it;
    // `opts.reveal` (0/1) sets line visibility behind the front (defaults to the
    // current value); `opts.rainbow` makes the front a rainbow; `opts.onDone`
    // fires once the wave completes. Under reduced motion there's no loop, so
    // just swap state, redraw, and run onDone immediately.
    startWave(origin, next, nextSeed, opts) {
      const reverse = !!(opts && opts.reverse);
      const onDone = (opts && opts.onDone) || null;
      const rainbow = !!(opts && opts.rainbow);
      const curSeed = wave ? wave.nextSeed : displayedSeed;
      const seed = nextSeed == null ? curSeed : nextSeed;
      const curReveal = wave ? wave.nextReveal : displayedReveal;
      const targetReveal = opts && opts.reveal != null ? opts.reveal : curReveal;
      if (reducedMotion) {
        displayed = next.slice();
        displayedSeed = seed;
        displayedReveal = targetReveal;
        wave = null;
        draw(now());
        if (onDone) onDone();
        return;
      }
      // Expanding waves run to WAVE_MAX_R so they always cover the page; a
      // collapsing wave instead STARTS at the screen edge (the farthest corner
      // from the origin) so its ring is visible from the first frame instead of
      // travelling in from off-screen first.
      const aspect = w / h;
      const edgeR =
        Math.hypot(
          Math.max(origin[0], 1 - origin[0]) * aspect,
          Math.max(origin[1], 1 - origin[1])
        ) * 1.05;
      const current = wave ? wave.next : displayed;
      wave = {
        origin,
        old: current.slice(),
        next: next.slice(),
        oldSeed: curSeed,
        nextSeed: seed,
        oldReveal: curReveal,
        nextReveal: targetReveal,
        rainbow,
        start: now(),
        reverse,
        maxR: reverse ? edgeR : WAVE_MAX_R,
        onDone,
      };
    },
  };
}
