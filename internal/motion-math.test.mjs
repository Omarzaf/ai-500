import assert from "node:assert/strict";
import test from "node:test";
import {
  spring,
  advanceSpring,
  advanceInertia,
  snapSpring,
  seed,
  sceneFrame,
  nearestVisiblePoint,
  contrast,
  readableInk,
} from "./motion-math.mjs";
const close = (a, b, tolerance = 1e-9) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function simulateSpring(hz, target = 300, seconds = 1) {
  const state = spring(12);
  state.velocity = 75;
  for (let i = 0; i < hz * seconds; i++)
    advanceSpring(state, target, 10, 1 / hz);
  return state;
}
test("spring trajectory agrees at 30, 60, 120 and 144 Hz", () => {
  const reference = simulateSpring(60);
  for (const hz of [30, 120, 144]) {
    const result = simulateSpring(hz);
    close(result.value, reference.value);
    close(result.velocity, reference.velocity);
  }
});
test("selection retarget preserves current position and velocity", () => {
  const state = simulateSpring(60, 300, 0.25);
  const position = state.value;
  const velocity = state.velocity;
  advanceSpring(state, -500, 10, 0);
  close(state.value, position);
  close(state.velocity, velocity);
  advanceSpring(state, -500, 10, 1e-6);
  assert.ok(Math.abs(state.value - position) < 0.01);
  assert.ok(Number.isFinite(state.velocity));
});
test("release coasts in its original direction and decays independently of refresh rate", () => {
  const states = [30, 60, 120].map((hz) => {
    const state = spring(0);
    state.velocity = 2;
    for (let i = 0; i < hz; i++) advanceInertia(state, 4, 1 / hz);
    assert.ok(state.value > 0.45 && state.value < 0.5);
    assert.ok(state.velocity > 0 && state.velocity < 0.04);
    return state;
  });
  close(states[0].value, states[2].value);
  close(states[0].velocity, states[2].velocity);
});
test("critically damped zoom converges without overshoot from rest", () => {
  const state = spring(0.6);
  let previous = state.value;
  for (let i = 0; i < 240; i++) {
    advanceSpring(state, 1.65, 12, 1 / 120);
    assert.ok(state.value >= previous && state.value <= 1.65);
    previous = state.value;
  }
  assert.ok(1.65 - state.value < 1e-8);
});
test("pause snap clears residual velocity and visual seeds are stable", () => {
  const state = spring(2);
  state.velocity = 9;
  snapSpring(state, 4);
  assert.deepEqual(state, { value: 4, velocity: 0 });
  close(seed("person-one", 1), seed("person-one", 1));
  assert.notEqual(seed("person-one", 1), seed("person-two", 1));
});

test("keyboard selection follows the desktop scene when a profile moves its center", () => {
  const frame = sceneFrame(1440, 900, 1);
  close(frame.cx, 460.8);
  close(frame.cy, 423);
  const selectedCenter = {
    id: "visible-center",
    px: 460.8,
    py: 423,
    pickable: true,
  };
  const oldViewportCenter = {
    id: "old-center",
    px: 720,
    py: 423,
    pickable: true,
  };
  assert.equal(
    nearestVisiblePoint([oldViewportCenter, selectedCenter], frame),
    selectedCenter
  );
  assert.equal(
    nearestVisiblePoint(
      [oldViewportCenter, selectedCenter],
      sceneFrame(1440, 900, 0)
    ),
    oldViewportCenter
  );
});

test("keyboard selection follows the mobile scene above the profile sheet", () => {
  const frame = sceneFrame(390, 844, 1);
  close(frame.cx, 195);
  close(frame.cy, 219.44);
  close(frame.bottom, 354.48);
  const selectedCenter = {
    id: "visible-center",
    px: 195,
    py: 219.44,
    pickable: true,
  };
  const oldCenterCandidate = {
    id: "old-center-candidate",
    px: 195,
    py: 320,
    pickable: true,
  };
  assert.equal(
    nearestVisiblePoint([oldCenterCandidate, selectedCenter], frame),
    selectedCenter
  );
});

test("a visible reprojected neighbor remains eligible despite its original negative depth", () => {
  const frame = sceneFrame(1440, 900, 1);
  const neighbor = {
    id: "rear-neighbor",
    px: frame.cx,
    py: frame.cy,
    z: -0.8,
    pickable: true,
  };
  const foreground = {
    id: "foreground",
    px: frame.cx + 30,
    py: frame.cy,
    z: 0.8,
    pickable: true,
  };
  assert.equal(nearestVisiblePoint([foreground, neighbor], frame), neighbor);
});

test("keyboard selection excludes filtered and obscured points on every viewport edge", () => {
  for (const frame of [sceneFrame(1440, 900, 1), sceneFrame(390, 844, 1)]) {
    const visible = { id: "visible", px: 2, py: 2, pickable: true };
    const excluded = [
      { id: "filtered", px: frame.cx, py: frame.cy, pickable: false },
      { id: "left-offscreen", px: -1, py: frame.cy, pickable: true },
      {
        id: "right-obscured",
        px: frame.right + 1,
        py: frame.cy,
        pickable: true,
      },
      { id: "above-viewport", px: frame.cx, py: -1, pickable: true },
      {
        id: "below-visible-scene",
        px: frame.cx,
        py: frame.bottom + 1,
        pickable: true,
      },
    ];
    for (const candidate of excluded) {
      assert.equal(
        nearestVisiblePoint([candidate, visible], frame),
        visible,
        candidate.id
      );
      assert.equal(nearestVisiblePoint([candidate], frame), null, candidate.id);
    }
  }
});

test("an empty filtered view has no keyboard candidate", () => {
  assert.equal(nearestVisiblePoint([], sceneFrame(390, 844, 0)), null);
});

test("all eight category palettes maintain 4.5:1 scene and panel contrast throughout transitions", () => {
  const rgb = (hex) =>
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const palettes = [
    ["overview", "#b5d4a9", "#173f32"],
    ["research", "#303bc8", "#e5e9ff"],
    ["industry", "#a94022", "#fff0dd"],
    ["infrastructure", "#674580", "#f0e3ff"],
    ["open-source", "#17685d", "#e1f6d9"],
    ["safety", "#5b477d", "#f0e8ff"],
    ["governance", "#235b89", "#e2f2ff"],
    ["society", "#8b3a51", "#ffe9e7"],
    ["applications", "#45632f", "#edf7db"],
  ].map(([name, paper, ink]) => ({ name, paper: rgb(paper), ink: rgb(ink) }));
  for (const from of palettes) {
    for (const to of palettes) {
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const interpolate = (start, end) =>
          start.map((value, index) =>
            Math.round(value + (end[index] - value) * t)
          );
        const paper = interpolate(from.paper, to.paper);
        const preferred = interpolate(from.ink, to.ink);
        const panel = paper.map((value) => value * 0.93 + 255 * 0.07);
        const context = `${from.name} → ${to.name} at ${i / 2}%`;
        assert.ok(
          contrast(paper, readableInk(paper, preferred)) >= 4.5,
          `scene: ${context}`
        );
        assert.ok(
          contrast(panel, readableInk(panel, preferred)) >= 4.5,
          `panel: ${context}`
        );
      }
    }
  }
});
