/** Exact, critically damped spring. Units are seconds; retargeting preserves velocity. */
export function spring(value = 0) {
  return { value, velocity: 0 };
}
export function advanceSpring(state, target, frequency, dt) {
  if (dt <= 0) return state.value;
  const offset = state.value - target;
  const impulse = state.velocity + frequency * offset;
  const decay = Math.exp(-frequency * dt);
  state.value = target + (offset + impulse * dt) * decay;
  state.velocity = (state.velocity - frequency * impulse * dt) * decay;
  return state.value;
}
/** Integrates exponentially decaying release velocity exactly over a frame. */
export function advanceInertia(state, drag, dt) {
  const decay = Math.exp(-drag * dt);
  state.value += (state.velocity * (1 - decay)) / drag;
  state.velocity *= decay;
  return state.value;
}
export function snapSpring(state, value) {
  state.value = value;
  state.velocity = 0;
  return value;
}
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
/** Stable unit interval seed; visual positions do not encode influence or similarity. */
export function seed(text, salt = 0) {
  let value = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 2246822507);
  value ^= value >>> 13;
  return (value >>> 0) / 4294967296;
}
/** WCAG sRGB luminance, used to keep animated palettes legible throughout a transition. */
export function luminance(rgb) {
  const linear = rgb.map((value) => {
    const channel = clamp(value, 0, 255) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function contrast(a, b) {
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export function readableInk(background, preferred) {
  if (contrast(background, preferred) >= 4.5) return preferred;
  return luminance(background) > 0.179 ? [0, 0, 0] : [255, 255, 255];
}

/** The rendered viewport frame shared by projection and keyboard targeting. */
export function sceneFrame(width, height, focus) {
  // A short landscape viewport needs the side panel to preserve a usable graph.
  const mobile = width <= 700 && (width < 600 || height > 500);
  const panelWidth = mobile
    ? 0
    : Math.min(
        600,
        Math.max(
          width * (width <= 1000 ? 0.42 : 0.36),
          width <= 1000 ? 350 : 380
        )
      );
  return {
    mobile,
    panelWidth,
    cx: width / 2 - (panelWidth / 2) * focus,
    cy: height * (mobile ? 0.43 - 0.17 * focus : 0.47),
    right: width - panelWidth * focus,
    bottom: mobile ? height * (1 - 0.58 * focus) : height,
  };
}

/** Pick from actually selectable screen points, including reprojected rear nodes. */
export function nearestVisiblePoint(points, frame) {
  let closest = null;
  let distance = Infinity;
  for (const point of points) {
    if (
      !point.pickable ||
      point.px < 0 ||
      point.px > frame.right ||
      point.py < 0 ||
      point.py > frame.bottom
    )
      continue;
    const next = Math.hypot(point.px - frame.cx, point.py - frame.cy);
    if (next < distance) {
      closest = point;
      distance = next;
    }
  }
  return closest;
}
