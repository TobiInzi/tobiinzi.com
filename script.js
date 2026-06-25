const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function moveInverseCursor(event) {
  if (reduceMotion.matches) return;

  const offsetX = (window.innerWidth / 2 - event.clientX) * 0.16;
  const offsetY = (window.innerHeight / 2 - event.clientY) * 0.16;

  root.style.setProperty("--cursor-x", `${offsetX}px`);
  root.style.setProperty("--cursor-y", `${offsetY}px`);
}

window.addEventListener("pointermove", moveInverseCursor);
