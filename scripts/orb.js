// Ignite orb (WebGL): a soft glossy rainbow "AI orb" on its own small transparent
// canvas — a flowing low-frequency hue field, spherical shading + a crisp rim and
// glossy highlight, fine film grain, and a faint pulsing halo. Hover/focus grows
// the orb (shader-side) and speeds up the colour drift.
import { VERT, makeProgram, setupFullscreenTriangle } from "./gl.js";

const FRAG = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec2  u_res;
  uniform float u_time;
  uniform float u_dpr;
  uniform float u_hover;
  uniform float u_ctime; // colour-field time; runs faster while hovered

  vec3 hsv2rgb(vec3 c){
    vec3 k = abs(fract(c.x + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(k - 1.0, 0.0, 1.0), c.y);
  }

  void main(){
    vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
    float r = length(p);
    float t = u_time;

    // gentle size breathing; hover grows the ORB only (the halo below is anchored
    // to baseR, so the hover doesn't scale the glow with it)
    float baseR = 0.48 + 0.01 * sin(t * 0.55);
    float orbR = baseR * (1.0 + 0.12 * u_hover);

    // colour-field time (accelerates on hover, integrated in JS so it never jumps)
    float ct = u_ctime;
    float rot = ct * 0.15;
    mat2 R = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    vec2 q = R * p;

    // Smooth, low-frequency flowing hue field: the hue varies gently across the
    // orb and drifts over time. Because it's built from smooth sines (no competing
    // colour lobes that can tie and flip), the colours ALWAYS stay soft and
    // diffused — they never snap into hard seams — while still shifting over time.
    float n1 = sin(q.x * 2.0 + ct * 0.30) + sin(q.y * 1.7 - ct * 0.24 + 1.3);
    float n2 = sin((q.x + q.y) * 1.5 - ct * 0.20) + sin((q.x - q.y) * 1.3 + ct * 0.27);
    float hue = 0.5 + ct * 0.05 + 0.10 * (n1 + n2);
    float sat = 0.48 + 0.10 * sin((q.x - q.y) * 1.1 + ct * 0.15); // gentle pastel
    vec3 col = hsv2rgb(vec3(hue, sat, 1.0));

    // Sphere: fake a hemisphere normal for shading + a soft highlight.
    float rr = min(r / orbR, 1.0);
    float z = sqrt(max(0.0, 1.0 - rr * rr));
    vec3 n = vec3(p / orbR, z);
    float edge = smoothstep(orbR + 0.002, orbR - 0.012, r); // hard, just AA-soft

    // spherical volume shading — rounder/brighter toward the centre
    col *= 0.66 + 0.34 * z;

    // tight, bright glossy highlight (upper-left light) — a crisp spec spot
    vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
    col += pow(max(dot(n, L), 0.0), 14.0) * 0.5;

    // a defined bright rim ring (like the logo's ring) — a thin glassy fresnel
    col += pow(1.0 - z, 4.0) * edge * 0.28;

    // fine film grain at display-pixel scale (floor by u_dpr so it survives the
    // supersample downscale), on the sphere body only so the halo stays smooth:
    // high-frequency texture so the surface reads crisp, not soft-focus
    float g = fract(sin(dot(floor(gl_FragCoord.xy / u_dpr), vec2(12.9898, 78.233))) * 43758.5453);
    col += (g - 0.5) * 0.055 * edge;

    // Soft outer halo: a faint, mostly-WHITE bloom fading from the rim, anchored
    // to baseR and PULSATING in size. Whitening it strongly removes the orb's
    // colour seams from the glow so it reads as diffuse light, not a colour shell.
    float haloSpread = 0.16 + 0.06 * sin(t * 1.1);
    float halo = exp(-pow(max(r - baseR, 0.0) / haloSpread, 2.0)) * (1.0 - edge);
    col = mix(col, mix(col, vec3(1.0), 0.72), 1.0 - edge);
    float alpha = clamp(edge + halo * 0.10, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

// Boot the orb on its `.orb-gl` canvas inside `igniter`. Returns a handle with
// resize()/stop(), or null if WebGL is unavailable (caller shows the CSS
// fallback). Self-animates; under reduced motion it paints a single still frame.
export function initOrb(igniter, reducedMotion) {
  const canvas = igniter.querySelector(".orb-gl");
  const gl =
    canvas &&
    canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
  if (!gl) return null;

  const prog = makeProgram(gl, VERT, FRAG);
  if (!prog) return null;
  gl.useProgram(prog);
  setupFullscreenTriangle(gl, prog);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uDpr = gl.getUniformLocation(prog, "u_dpr");
  const uHover = gl.getUniformLocation(prog, "u_hover");
  const uCtime = gl.getUniformLocation(prog, "u_ctime");

  // Hover/focus grows the orb (shader-side, so only the orb scales — not the
  // halo or the canvas). Eased toward the target each frame.
  let hover = 0;
  let hoverTarget = 0;
  const onEnter = () => (hoverTarget = 1);
  const onLeave = () => (hoverTarget = 0);
  igniter.addEventListener("pointerenter", onEnter);
  igniter.addEventListener("pointerleave", onLeave);
  igniter.addEventListener("focus", onEnter);
  igniter.addEventListener("blur", onLeave);

  // Render at >=2x the CSS size (capped at 3x) so the small orb is always super-
  // sampled — a crisp edge + smooth gradients instead of a soft, under-resolved
  // look — without ever upscaling on hi-DPI screens.
  const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const size = () => {
    const px = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.width = px;
    canvas.height = px;
    gl.viewport(0, 0, px, px);
  };

  const t0 = performance.now();
  let lastNow = t0;
  let ctime = 0; // colour-field time, integrated so a hover speed-up never jumps
  const draw = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    hover += (hoverTarget - hover) * 0.18; // ease toward hovered/un-hovered
    ctime += dt * (1.0 + hover * 3.0); // colour changes up to ~4x faster on hover
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.uniform1f(uDpr, dpr);
    gl.uniform1f(uHover, hover);
    gl.uniform1f(uCtime, ctime);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let raf = 0;
  let running = true;
  const loop = () => {
    if (!running) return;
    draw();
    raf = requestAnimationFrame(loop);
  };

  size();
  if (reducedMotion) draw(); // one still frame, no loop
  else loop();

  return {
    resize() {
      size();
      draw();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      igniter.removeEventListener("pointerenter", onEnter);
      igniter.removeEventListener("pointerleave", onLeave);
      igniter.removeEventListener("focus", onEnter);
      igniter.removeEventListener("blur", onLeave);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    },
  };
}
