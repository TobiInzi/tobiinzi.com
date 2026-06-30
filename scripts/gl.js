// Shared WebGL helpers for the two full-screen-shader canvases (nebula + orb).

// Both effects are a single fragment shader drawn over one big triangle, so they
// share this trivial vertex shader (attribute `a` = clip-space position).
export const VERT = `
  attribute vec2 a;
  void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

// Compile + link a program; logs and returns null on failure so callers can
// degrade gracefully (CSS fallback) instead of rendering a broken canvas.
export function makeProgram(gl, vertSrc, fragSrc) {
  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// Bind a single clip-space triangle that covers the viewport, wired to the `a`
// attribute. One draw of 3 verts (gl.TRIANGLES, 0, 3) then fills every pixel.
export function setupFullscreenTriangle(gl, prog) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
}
