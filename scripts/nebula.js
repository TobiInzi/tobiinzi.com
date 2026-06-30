// Background nebula (WebGL): a full-screen fragment shader paints slow, drifting
// gradient blobs tinted by the selected type color (nothing selected = no blobs,
// just dark space). Switching color isn't instant: a SHOCKWAVE expands from the
// page centre (where the picked icon lands) and repaints the field behind it.
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

  // soft round blob (gaussian falloff), aspect-corrected so it stays circular
  float blob(vec2 uv, vec2 c, float r, float aspect){
    vec2 d = uv - c;
    d.x *= aspect;
    return exp(-dot(d, d) / (r * r));
  }

  // Per-nebula jitter: a seed nudges every blob to its own resting position and
  // size, so each type owns a distinct arrangement instead of a shared layout
  // that only recolours. Both are deterministic in the seed, so a given type
  // always renders the same nebula.
  vec2  nOff(float s, float i){ return vec2(sin(s*12.3 + i*4.7), cos(s*7.9 + i*2.3)); }
  float nRad(float s, float i){ return 0.8 + 0.45*fract(sin(s*45.2 + i*9.1) * 43758.5453); }

  // The drifting blob field for a given seed: same animated character either way
  // (blobs gently orbit and breathe their radius), but their home positions and
  // base sizes are offset by the seed. One large soft coverage blob, several
  // mediums carrying the character, a couple of small detail ones, over a faint
  // ambient floor so the voids aren't harsh.
  float field(vec2 uv, float t, float s, float aspect){
    float f = 0.035;
    f += 0.26 * blob(uv, vec2(0.40,0.45) + 0.15*nOff(s,0.0) + vec2(0.08*sin(t*0.41+s),     0.07*cos(t*0.37+s)),     nRad(s,0.0)*0.37 + 0.05*sin(t*0.24),     aspect);
    f += 0.50 * blob(uv, vec2(0.22,0.30) + 0.15*nOff(s,1.0) + vec2(0.10*sin(t*0.70+s),     0.08*cos(t*0.62+s)),     nRad(s,1.0)*0.25 + 0.04*sin(t*0.40),     aspect);
    f += 0.48 * blob(uv, vec2(0.80,0.27) + 0.15*nOff(s,2.0) + vec2(0.11*sin(t*0.53+1.7+s), 0.09*cos(t*0.81+0.5+s)), nRad(s,2.0)*0.24 + 0.05*sin(t*0.33+2.0), aspect);
    f += 0.50 * blob(uv, vec2(0.63,0.72) + 0.15*nOff(s,3.0) + vec2(0.12*sin(t*0.46+3.1+s), 0.08*cos(t*0.58+2.0+s)), nRad(s,3.0)*0.26 + 0.04*sin(t*0.37+1.0), aspect);
    f += 0.46 * blob(uv, vec2(0.85,0.62) + 0.15*nOff(s,4.0) + vec2(0.09*sin(t*0.69+2.3+s), 0.08*cos(t*0.74+3.4+s)), nRad(s,4.0)*0.23 + 0.04*sin(t*0.31+0.7), aspect);
    f += 0.44 * blob(uv, vec2(0.30,0.66) + 0.15*nOff(s,5.0) + vec2(0.11*sin(t*0.58+0.9+s), 0.09*cos(t*0.66+2.6+s)), nRad(s,5.0)*0.22 + 0.05*sin(t*0.35+1.5), aspect);
    f += 0.42 * blob(uv, vec2(0.12,0.52) + 0.15*nOff(s,6.0) + vec2(0.10*sin(t*0.60+5.0+s), 0.08*cos(t*0.49+0.2+s)), nRad(s,6.0)*0.16 + 0.04*sin(t*0.27+2.4), aspect);
    f += 0.42 * blob(uv, vec2(0.55,0.42) + 0.15*nOff(s,7.0) + vec2(0.10*sin(t*0.51+2.8+s), 0.10*cos(t*0.72+4.1+s)), nRad(s,7.0)*0.17 + 0.04*sin(t*0.39+0.3), aspect);
    return f;
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / u_res;
    float aspect = u_res.x / u_res.y;
    float t = u_time * 0.16; // slow ambient flow

    // shockwave: distance from the wave origin (aspect-corrected so it's round).
    // Expanding (invert 0): the new nebula has taken over inside the front.
    // Collapsing (invert 1): the new nebula takes over OUTSIDE the front, so a
    // shrinking ring sweeps the page back to the new (dark) state from the edges.
    // A bright rim rides the front itself either way.
    vec2 wd = uv - u_waveOrigin;
    wd.x *= aspect;
    float wdist = length(wd);
    float expand = 1.0 - smoothstep(u_waveRadius - 0.07, u_waveRadius, wdist);
    float collapse = smoothstep(u_waveRadius, u_waveRadius + 0.07, wdist);
    float passed = mix(expand, collapse, u_waveInvert);

    // each side of the front samples its own nebula; the front blends layout AND
    // tint, so the wave actually reshapes the field, not just its colour.
    float fOld = field(uv, t, u_seedOld, aspect);
    float fNew = field(uv, t, u_seedNew, aspect);
    float f = mix(fOld, fNew, passed);

    // soft saturating response (Reinhard): however many blobs overlap, the
    // colour rolls off toward a ceiling instead of clamping to a flat vivid
    // wash -> dense pile-ups stay tame, gaps keep a faint glow.
    float v = f / (f + 0.9);
    vec3 tint = mix(u_colorOld, u_colorNew, passed);

    // dark space: a dark charcoal base (matches the favicon #0a0a0d, not black),
    // the tint pools softly where the blobs gather. Mild pow(v,1.1) keeps the
    // lows down without crushing them; the Reinhard ceiling above caps the highs.
    vec3 base = vec3(0.039, 0.039, 0.051);
    vec3 col = base + tint * pow(v, 1.1) * 0.46;

    // the shockwave rim — glows in the colour the wave is bringing in when
    // expanding, and in the leaving colour when collapsing (so it stays visible
    // as the page returns to dark).
    float ring = exp(-pow((wdist - u_waveRadius) / 0.05, 2.0));
    vec3 rimColor = mix(u_colorNew, u_colorOld, u_waveInvert);
    col += rimColor * ring * (0.12 + v * 0.5);

    // gentle vignette + dither to kill banding
    vec2 g = uv - 0.5;
    col *= 1.0 - 0.55 * dot(g, g);
    col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.01;

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

  const SCALE = 0.6; // render below CSS resolution; the soft field hides it
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
  let wave = null; // { origin, old, next, oldSeed, nextSeed, start } while crossing

  const draw = (time) => {
    let oldC = displayed;
    let newC = displayed;
    let oldS = displayedSeed;
    let newS = displayedSeed;
    let origin = [0.5, 0.5];
    let radius = 100.0; // huge -> "wave already everywhere", no rim
    let invert = 0.0;
    let done = null; // wave.onDone, fired after the completed wave is torn down
    if (wave) {
      const progress = (time - wave.start) / WAVE_DURATION;
      if (progress >= 1) {
        displayed = wave.next; // wave finished: new nebula is now everywhere
        displayedSeed = wave.nextSeed;
        done = wave.onDone;
        wave = null;
        // Paint the settled state THIS frame too: oldC/newC were captured from
        // the previous `displayed` above, so without this the completion frame
        // would flash the OLD nebula across the whole screen for one frame.
        oldC = displayed;
        newC = displayed;
        oldS = displayedSeed;
        newS = displayedSeed;
      } else {
        oldC = wave.old;
        newC = wave.next;
        oldS = wave.oldSeed;
        newS = wave.nextSeed;
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
    // Launch a shockwave from `origin` (uv) that repaints the field to `next`
    // and reshapes it to `nextSeed`'s nebula. Pass `nextSeed = null` to keep the
    // current layout (e.g. clearing: only the tint needs to wash away).
    // `opts.reverse` collapses the front inward instead of expanding it;
    // `opts.onDone` fires once the wave completes. Under reduced motion there's
    // no loop, so just swap state, redraw, and run onDone immediately.
    startWave(origin, next, nextSeed, opts) {
      const reverse = !!(opts && opts.reverse);
      const onDone = (opts && opts.onDone) || null;
      const curSeed = wave ? wave.nextSeed : displayedSeed;
      const seed = nextSeed == null ? curSeed : nextSeed;
      if (reducedMotion) {
        displayed = next.slice();
        displayedSeed = seed;
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
        start: now(),
        reverse,
        maxR: reverse ? edgeR : WAVE_MAX_R,
        onDone,
      };
    },
  };
}
