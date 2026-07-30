// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Trent Slade / QSOL-IMC.
(function () {
  "use strict";

  const Core = globalThis.E8Core;
  const AudioModel = globalThis.E8Audio;
  if (!Core || !AudioModel) {
    throw new Error("E8Core and E8Audio must load before the application");
  }

  const byId = (id) => document.getElementById(id);
  const canvas = byId("e8Canvas");
  const stage = byId("canvasStage");
  const context = canvas.getContext("2d", { alpha: false });
  const sequenceCanvas = byId("sequenceCanvas");
  const sequenceContext = sequenceCanvas.getContext("2d", { alpha: false });
  const records = Core.buildRootRecords();
  const roots = records.map((record) => record.root);
  const recordByKey = new Map(records.map((record) => [record.key, record]));
  const recordByBasis = new Map(
    records
      .filter((record) => record.selected)
      .map((record) => [record.basisIndex, record])
  );
  const fullAdjacency = Core.buildAdjacency(roots);
  const allEdges = [];
  for (let left = 0; left < fullAdjacency.length; left += 1) {
    for (let right = left + 1; right < fullAdjacency.length; right += 1) {
      if (fullAdjacency[left][right] === 1) {
        allEdges.push([left, right]);
      }
    }
  }

  const RING_COLOURS = Object.freeze([
    "#718f88",
    "#829b72",
    "#a39d63",
    "#bc8d63",
    "#b9776d",
    "#9e7187",
    "#7f789c",
    "#657f9b"
  ]);
  const TRIALITY_COLOURS = Object.freeze([
    "#63b9aa",
    "#c69c58",
    "#a77994"
  ]);

  const state = {
    rootSelection: "all",
    projection: "coxeter-depth",
    palette: "triality",
    orbitIndex: 0,
    showEdges: true,
    showSelectedHalo: true,
    showAxes: true,
    edgeOpacity: 0.15,
    nodeSize: 1,
    rotationRunning: true,
    rotationSpeed: 0.24,
    depth: 0.72,
    depthPhase: 0,
    trialityPhase: 0,
    yaw: 0.42,
    pitch: -0.24,
    roll: 0,
    zoom: 1,
    width: 960,
    height: 720,
    dpr: 1,
    sequenceWidth: 960,
    sequenceHeight: 170,
    sequenceDpr: 1,
    basePoints: [],
    visibleIndices: [],
    visibleIndexSet: new Set(),
    visibleEdges: [],
    screenPoints: [],
    selectedRootIndex: records.find((record) => record.basisIndex === 0).rootIndex,
    hoverRootIndex: null,
    drag: null,
    lastTimestamp: 0,
    activeBasisIndex: null,
    audio: {
      context: null,
      source: null,
      startedAt: 0,
      schedule: null,
      token: 0
    },
    currentSchedule: null
  };

  function clamp(value, minimum, maximum) {
    return Core.clamp(value, minimum, maximum);
  }

  function rgba(hex, alpha) {
    const value = hex.replace("#", "");
    const integer = Number.parseInt(value, 16);
    return (
      "rgba(" +
      ((integer >> 16) & 255) +
      "," +
      ((integer >> 8) & 255) +
      "," +
      (integer & 255) +
      "," +
      alpha +
      ")"
    );
  }

  function mixHex(left, right, amount) {
    const parse = (hex) => {
      const value = Number.parseInt(hex.replace("#", ""), 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    };
    const a = parse(left);
    const b = parse(right);
    const channels = a.map((value, index) =>
      Math.round(value + (b[index] - value) * amount)
    );
    return (
      "#" +
      channels.map((value) => value.toString(16).padStart(2, "0")).join("")
    );
  }

  function visibleRecord(record) {
    switch (state.rootSelection) {
      case "etq101":
        return record.selected;
      case "integer":
        return record.family === "integer";
      case "half-integer":
        return record.family === "half-integer";
      case "fixed":
        return record.fixed;
      case "orbit":
        return !record.fixed && record.orbitIndex === state.orbitIndex;
      default:
        return true;
    }
  }

  function rebuildVisibleGeometry() {
    state.visibleIndices = records
      .filter(visibleRecord)
      .map((record) => record.rootIndex);
    state.visibleIndexSet = new Set(state.visibleIndices);
    state.visibleEdges = allEdges.filter(
      ([left, right]) =>
        state.visibleIndexSet.has(left) && state.visibleIndexSet.has(right)
    );
    if (!state.visibleIndexSet.has(state.selectedRootIndex)) {
      state.selectedRootIndex = state.visibleIndices[0] ?? null;
    }
    updateHeadings();
    updateInspector();
  }

  function rebuildProjection() {
    state.basePoints = Core.projectRoots(
      roots,
      state.projection,
      state.depthPhase
    );
    rebuildVisibleGeometry();
  }

  function rootColour(record) {
    if (state.palette === "rings") {
      return RING_COLOURS[record.coxeterRing];
    }
    if (state.palette === "family") {
      return record.family === "integer" ? "#70aa9f" : "#b78493";
    }
    if (state.palette === "degree") {
      if (!record.selected) {
        return "#69736e";
      }
      const amount = (record.selectedDegree - 22) / 33;
      return mixHex("#607e77", "#d0a45b", clamp(amount, 0, 1));
    }
    if (state.palette === "mono") {
      return record.selected ? "#d7ddd8" : "#78827d";
    }
    if (record.fixed) {
      return "#d8ddd8";
    }
    return TRIALITY_COLOURS[
      (record.qutritLabel + state.trialityPhase) % 3
    ];
  }

  function transformPoint(point) {
    const depthScale =
      state.projection === "coxeter-plane" ? 0 : state.depth / 0.72;
    const source = {
      x: point.x,
      y: point.y,
      z: point.z * depthScale
    };
    if (state.projection === "coxeter-plane") {
      const cosine = Math.cos(state.roll);
      const sine = Math.sin(state.roll);
      return {
        x: source.x * cosine - source.y * sine,
        y: source.x * sine + source.y * cosine,
        z: 0
      };
    }
    return Core.rotatePoint(source, state.yaw, state.pitch, state.roll);
  }

  function worldToScreen(point) {
    const perspective = 1 / (1.34 - point.z * 0.28);
    const scale = Math.min(state.width, state.height) * 0.54 * state.zoom;
    return {
      x: state.width / 2 + point.x * scale * perspective,
      y: state.height / 2 + point.y * scale * perspective,
      z: point.z,
      perspective
    };
  }

  function updateScreenPoints() {
    state.screenPoints = state.basePoints.map((point, index) => {
      const screen = worldToScreen(transformPoint(point));
      return {
        ...screen,
        rootIndex: index,
        visible: state.visibleIndexSet.has(index)
      };
    });
  }

  function drawLineBetweenWorldPoints(left, right, colour, width) {
    const a = worldToScreen(transformPoint(left));
    const b = worldToScreen(transformPoint(right));
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.stroke();
  }

  function drawAxesAndRings() {
    if (!state.showAxes) {
      return;
    }
    const axisColour = "rgba(201,211,205,0.12)";
    drawLineBetweenWorldPoints(
      { x: -1.12, y: 0, z: 0 },
      { x: 1.12, y: 0, z: 0 },
      axisColour,
      1
    );
    drawLineBetweenWorldPoints(
      { x: 0, y: -1.12, z: 0 },
      { x: 0, y: 1.12, z: 0 },
      axisColour,
      1
    );

    if (!state.projection.startsWith("coxeter")) {
      return;
    }
    const ringRadii = Array.from({ length: 8 }, (_, ring) => {
      const points = records
        .filter((record) => record.coxeterRing === ring)
        .map((record) => state.basePoints[record.rootIndex]);
      return (
        points.reduce(
          (sum, point) => sum + Math.hypot(point.x, point.y),
          0
        ) / points.length
      );
    });
    ringRadii.forEach((radius, ringIndex) => {
      context.beginPath();
      const segments = 120;
      for (let step = 0; step <= segments; step += 1) {
        const angle = Core.TAU * step / segments;
        const screen = worldToScreen(
          transformPoint({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            z: 0
          })
        );
        if (step === 0) {
          context.moveTo(screen.x, screen.y);
        } else {
          context.lineTo(screen.x, screen.y);
        }
      }
      context.strokeStyle = rgba(RING_COLOURS[ringIndex], 0.12);
      context.lineWidth = 0.75;
      context.stroke();
    });
  }

  function drawEdges() {
    if (!state.showEdges || state.edgeOpacity <= 0) {
      return;
    }
    context.lineWidth = state.rootSelection === "all" ? 0.62 : 0.82;
    for (const [leftIndex, rightIndex] of state.visibleEdges) {
      const left = state.screenPoints[leftIndex];
      const right = state.screenPoints[rightIndex];
      const depth = (left.z + right.z) / 2;
      const opacity =
        state.edgeOpacity * clamp(0.58 + (depth + 1) * 0.28, 0.35, 1);
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.strokeStyle = `rgba(153,170,161,${opacity})`;
      context.stroke();
    }
  }

  function drawRootNode(screenPoint, timestamp) {
    const record = records[screenPoint.rootIndex];
    const colour = rootColour(record);
    const selected = screenPoint.rootIndex === state.selectedRootIndex;
    const hovered = screenPoint.rootIndex === state.hoverRootIndex;
    const audioActive =
      record.selected && record.basisIndex === state.activeBasisIndex;
    const baseRadius =
      (2.25 + screenPoint.perspective * 1.5) * state.nodeSize;
    const depthAlpha = clamp(0.5 + (screenPoint.z + 1) * 0.28, 0.42, 1);

    if (state.showSelectedHalo && record.selected) {
      context.beginPath();
      context.arc(
        screenPoint.x,
        screenPoint.y,
        baseRadius + 2.6,
        0,
        Core.TAU
      );
      context.strokeStyle = rgba(colour, 0.24 * depthAlpha);
      context.lineWidth = 0.8;
      context.stroke();
    }

    if (audioActive) {
      const pulse = 4 + 4 * (0.5 + 0.5 * Math.sin(timestamp * 0.014));
      context.beginPath();
      context.arc(
        screenPoint.x,
        screenPoint.y,
        baseRadius + pulse,
        0,
        Core.TAU
      );
      context.strokeStyle = rgba("#f0ca7e", 0.82);
      context.lineWidth = 1.6;
      context.stroke();
    }

    if (selected || hovered) {
      context.beginPath();
      context.arc(
        screenPoint.x,
        screenPoint.y,
        baseRadius + (selected ? 6 : 4),
        0,
        Core.TAU
      );
      context.strokeStyle = selected
        ? rgba("#f0ca7e", 0.92)
        : rgba("#e4e9e5", 0.72);
      context.lineWidth = selected ? 1.8 : 1.1;
      context.stroke();
    }

    context.beginPath();
    context.arc(screenPoint.x, screenPoint.y, baseRadius, 0, Core.TAU);
    context.fillStyle = rgba(colour, depthAlpha);
    context.fill();
  }

  function updateAudioProgress() {
    const audio = state.audio;
    if (!audio.source || !audio.schedule || !audio.context) {
      byId("audioProgressBar").style.width = "0%";
      state.activeBasisIndex = null;
      return;
    }
    const elapsed = audio.context.currentTime - audio.startedAt;
    const progress = clamp(elapsed / audio.schedule.duration, 0, 1);
    byId("audioProgressBar").style.width = `${progress * 100}%`;
    let active = null;
    for (let index = audio.schedule.events.length - 1; index >= 0; index -= 1) {
      const event = audio.schedule.events[index];
      if (elapsed >= event.startTime) {
        active =
          elapsed <= event.startTime + Math.max(event.duration, event.stepDuration)
            ? event
            : null;
        break;
      }
    }
    state.activeBasisIndex = active?.basisIndex ?? null;
    if (active) {
      const record = recordByBasis.get(active.basisIndex);
      if (record) {
        state.selectedRootIndex = record.rootIndex;
      }
    }
    if (progress >= 1) {
      stopAudio(false);
    }
  }

  function render(timestamp) {
    const delta = state.lastTimestamp
      ? Math.min((timestamp - state.lastTimestamp) / 1000, 0.05)
      : 0;
    state.lastTimestamp = timestamp;
    if (state.rotationRunning) {
      if (state.projection === "coxeter-plane") {
        state.roll += delta * state.rotationSpeed * 0.35;
      } else {
        state.yaw += delta * state.rotationSpeed;
        state.roll += delta * state.rotationSpeed * 0.08;
      }
    }
    updateAudioProgress();
    updateScreenPoints();

    context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    context.fillStyle = "#040605";
    context.fillRect(0, 0, state.width, state.height);
    const glow = context.createRadialGradient(
      state.width / 2,
      state.height / 2,
      0,
      state.width / 2,
      state.height / 2,
      Math.min(state.width, state.height) * 0.52
    );
    glow.addColorStop(0, "rgba(198,156,88,0.055)");
    glow.addColorStop(0.45, "rgba(99,185,170,0.018)");
    glow.addColorStop(1, "rgba(4,6,5,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, state.width, state.height);

    drawAxesAndRings();
    drawEdges();
    state.screenPoints
      .filter((point) => point.visible)
      .sort((left, right) => left.z - right.z)
      .forEach((point) => drawRootNode(point, timestamp));

    if (state.audio.source) {
      drawSequence();
    }
    requestAnimationFrame(render);
  }

  function selectionTitle() {
    const titles = {
      all: "Complete E8 · 240 roots",
      etq101: "ETQ-101 triality-closed selector · 101 roots",
      integer: "Integer root family · 112 roots",
      "half-integer": "Half-integer root family · 128 roots",
      fixed: "D4-triality fixed sector · 12 roots",
      orbit: `Triality orbit ${state.orbitIndex} · 3 roots`
    };
    return titles[state.rootSelection];
  }

  function projectionSummary() {
    if (state.projection === "coxeter-plane") {
      return (
        "The exact exponent-1 Coxeter plane resolves eight radii with " +
        "30 roots per ring and a 30-fold Coxeter action."
      );
    }
    if (state.projection === "d4-blocks") {
      return (
        "A declared three-dimensional receiver contrasts the two four-coordinate " +
        "D4 blocks used by the embedded triality action."
      );
    }
    return (
      "The exact Coxeter plane supplies x/y while an exponent-7 invariant-plane " +
      "axis supplies optional, explicitly noncanonical display depth."
    );
  }

  function updateHeadings() {
    byId("fieldTitle").textContent = selectionTitle();
    byId("fieldSummary").textContent = projectionSummary();
    byId("visibleBadge").textContent =
      `${state.visibleIndices.length} roots`;
    byId("edgeBadge").textContent =
      `${state.visibleEdges.length.toLocaleString()} edges`;
    const projectionLabels = {
      "coxeter-depth": "COXETER + EXPONENT-7 DEPTH",
      "coxeter-plane": "EXACT COXETER PLANE",
      "d4-blocks": "D4 × D4 BLOCK RECEIVER"
    };
    byId("projectionEyebrow").textContent =
      projectionLabels[state.projection];
    byId("orbitControl").hidden = state.rootSelection !== "orbit";
  }

  function formatConventionalCoordinate(value) {
    if (value === 0) {
      return "0";
    }
    if (Math.abs(value) === 2) {
      return String(value / 2);
    }
    return value < 0 ? "−½" : "½";
  }

  function updateInspector() {
    const record =
      state.selectedRootIndex === null
        ? null
        : records[state.selectedRootIndex];
    if (!record) {
      byId("inspectorTitle").textContent = "No visible root";
      byId("inspectorCoordinates").textContent =
        "Change the receiver filter to inspect a root.";
      byId("inspectorTags").replaceChildren();
      byId("inspectorMidi").textContent = "—";
      byId("inspectorFrequency").textContent = "Receiver frequency: —";
      return;
    }

    byId("inspectorMark").textContent =
      record.qutritLabel === null ? "F" : String(record.qutritLabel);
    byId("inspectorTitle").textContent =
      `Root ${record.rootIndex} · Coxeter ring ${record.coxeterRing + 1}`;
    const conventional = record.root
      .map(formatConventionalCoordinate)
      .join(", ");
    byId("inspectorCoordinates").textContent =
      `2r = [${record.root.join(", ")}] · r = [${conventional}]`;
    const tags = [
      record.family,
      `norm² 2`,
      `full degree ${record.fullDegree}`,
      `ring ${record.coxeterRing + 1} / 8`
    ];
    if (record.fixed) {
      tags.push(`triality fixed ${record.fixedIndex}`);
    } else {
      tags.push(`orbit ${record.orbitIndex}`, `q = ${record.qutritLabel}`);
    }
    if (record.selected) {
      tags.push(
        `ETQ basis ${record.basisIndex}`,
        `selected degree ${record.selectedDegree}`,
        `SCL ${record.sclCurvature >= 0 ? "+" : ""}${record.sclCurvature}`
      );
    } else {
      tags.push("outside ETQ-101 selector");
    }
    const container = byId("inspectorTags");
    container.replaceChildren(
      ...tags.map((tag) => {
        const span = document.createElement("span");
        span.textContent = tag;
        return span;
      })
    );
    if (record.selected) {
      const a4 = Number(byId("a4Hz").value) / 10;
      const frequency = AudioModel.midiToFrequency(record.midiNote, a4);
      byId("inspectorMidi").textContent = String(record.midiNote);
      byId("inspectorFrequency").textContent =
        `Receiver frequency: ${frequency.toFixed(2)} Hz @ A4 ${a4.toFixed(1)}`;
    } else {
      byId("inspectorMidi").textContent = "outside";
      byId("inspectorFrequency").textContent =
        "No canonical ETQ note for this unselected root";
    }
  }

  function audioSettings(overrides = {}) {
    return AudioModel.normalizeSettings({
      traversal: byId("traversal").value,
      tempo: Number(byId("tempo").value),
      stepsPerBeat: Number(byId("stepsPerBeat").value),
      a4Hz: Number(byId("a4Hz").value) / 10,
      includeGeometryTimbre: byId("geometryTimbre").checked,
      sampleRate: 48000,
      maxDurationSeconds: 90,
      ...overrides
    });
  }

  function rebuildSchedule() {
    state.currentSchedule = AudioModel.buildSchedule(audioSettings(), records);
    updateSequenceCopy();
    drawSequence();
  }

  function laneY(event, height) {
    if (event.qutritLabel === null) {
      return event.fixedIndex === 0 ? height - 18 : 18;
    }
    return height - 36 - event.qutritLabel * ((height - 72) / 2);
  }

  function drawSequence() {
    const schedule = state.currentSchedule;
    if (!schedule) {
      return;
    }
    sequenceContext.setTransform(
      state.sequenceDpr,
      0,
      0,
      state.sequenceDpr,
      0,
      0
    );
    const width = state.sequenceWidth;
    const height = state.sequenceHeight;
    sequenceContext.fillStyle = "#050706";
    sequenceContext.fillRect(0, 0, width, height);
    const laneLabels = [
      { q: 2, label: "HIGH · q2", colour: TRIALITY_COLOURS[2] },
      { q: 1, label: "MID · q1", colour: TRIALITY_COLOURS[1] },
      { q: 0, label: "LOW · q0", colour: TRIALITY_COLOURS[0] }
    ];
    laneLabels.forEach(({ q, label, colour }) => {
      const y = laneY({ qutritLabel: q }, height);
      sequenceContext.beginPath();
      sequenceContext.moveTo(58, y);
      sequenceContext.lineTo(width - 8, y);
      sequenceContext.strokeStyle = rgba(colour, 0.18);
      sequenceContext.lineWidth = 1;
      sequenceContext.stroke();
      sequenceContext.fillStyle = rgba(colour, 0.7);
      sequenceContext.font = "9px monospace";
      sequenceContext.fillText(label, 8, y + 3);
    });

    const plotLeft = 60;
    const plotWidth = Math.max(1, width - plotLeft - 10);
    const count = Math.max(1, schedule.events.length);
    const barWidth = clamp(plotWidth / count * 0.72, 0.7, 5);
    schedule.events.forEach((event, index) => {
      const x = plotLeft + index / Math.max(1, count - 1) * plotWidth;
      const y = laneY(event, height);
      const colour =
        event.qutritLabel === null
          ? "#d8ddd8"
          : TRIALITY_COLOURS[event.qutritLabel];
      sequenceContext.fillStyle = rgba(colour, 0.82);
      sequenceContext.fillRect(x - barWidth / 2, y - 5, barWidth, 10);
    });

    if (state.audio.source && state.audio.context && state.audio.schedule) {
      const elapsed =
        state.audio.context.currentTime - state.audio.startedAt;
      const progress = clamp(
        elapsed / state.audio.schedule.duration,
        0,
        1
      );
      const x = plotLeft + progress * plotWidth;
      sequenceContext.beginPath();
      sequenceContext.moveTo(x, 6);
      sequenceContext.lineTo(x, height - 6);
      sequenceContext.strokeStyle = "#f0ca7e";
      sequenceContext.lineWidth = 1.5;
      sequenceContext.stroke();
    }
  }

  function updateSequenceCopy() {
    const schedule = state.currentSchedule;
    const titles = {
      "basis-order": "ETQ-101 basis traversal",
      "triality-orbits": "ETQ-101 grouped triality traversal",
      "coxeter-rings": "ETQ-101 Coxeter ring traversal",
      "graph-breadth-first": "ETQ-101 selected-graph traversal",
      "etq303-support": "ETQ-303 exact support traversal"
    };
    byId("sequenceTitle").textContent =
      titles[schedule.settings.traversal];
    byId("sequenceSummary").textContent =
      `${schedule.events.length} events · ${schedule.duration.toFixed(2)} s · ` +
      `${schedule.settings.tempo} BPM · A4 ${schedule.settings.a4Hz.toFixed(1)} Hz receiver`;
  }

  function resize() {
    const rectangle = stage.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rectangle.width));
    const height = Math.max(
      350,
      Math.floor(canvas.getBoundingClientRect().height)
    );
    const dpr = clamp(globalThis.devicePixelRatio || 1, 1, 2);
    state.width = width;
    state.height = height;
    state.dpr = dpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const sequenceRectangle = sequenceCanvas.getBoundingClientRect();
    state.sequenceWidth = Math.max(
      260,
      Math.floor(sequenceRectangle.width)
    );
    state.sequenceHeight = Math.max(
      120,
      Math.floor(sequenceRectangle.height)
    );
    state.sequenceDpr = dpr;
    sequenceCanvas.width = Math.round(state.sequenceWidth * dpr);
    sequenceCanvas.height = Math.round(state.sequenceHeight * dpr);
    drawSequence();
  }

  function nearestRoot(clientX, clientY) {
    const rectangle = canvas.getBoundingClientRect();
    const x = clientX - rectangle.left;
    const y = clientY - rectangle.top;
    let nearest = null;
    let nearestDistance = 15;
    for (const point of state.screenPoints) {
      if (!point.visible) {
        continue;
      }
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = point;
      }
    }
    return { point: nearest, x, y };
  }

  function updateHover(event) {
    if (state.drag?.moved) {
      return;
    }
    const { point, x, y } = nearestRoot(event.clientX, event.clientY);
    state.hoverRootIndex = point?.rootIndex ?? null;
    const label = byId("hoverLabel");
    if (!point) {
      label.hidden = true;
      return;
    }
    const record = records[point.rootIndex];
    label.textContent =
      `root ${record.rootIndex} · ring ${record.coxeterRing + 1} · ` +
      (record.fixed
        ? "triality fixed"
        : `orbit ${record.orbitIndex} / q${record.qutritLabel}`) +
      (record.selected ? ` · MIDI ${record.midiNote}` : "");
    label.style.left = `${clamp(x + 13, 8, state.width - 270)}px`;
    label.style.top = `${clamp(y + 13, 8, state.height - 54)}px`;
    label.hidden = false;
  }

  function resetView() {
    state.yaw = 0.42;
    state.pitch = -0.24;
    state.roll = 0;
    state.zoom = 1;
  }

  function bindCanvas() {
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      state.drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        yaw: state.yaw,
        pitch: state.pitch,
        roll: state.roll,
        moved: false
      };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        updateHover(event);
        return;
      }
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      if (Math.hypot(dx, dy) > 3) {
        state.drag.moved = true;
      }
      if (state.projection === "coxeter-plane") {
        state.roll = state.drag.roll + dx * 0.008;
      } else {
        state.yaw = state.drag.yaw + dx * 0.008;
        state.pitch = clamp(
          state.drag.pitch + dy * 0.008,
          -Math.PI / 2,
          Math.PI / 2
        );
      }
    });
    const release = (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }
      if (!state.drag.moved) {
        const { point } = nearestRoot(event.clientX, event.clientY);
        if (point) {
          state.selectedRootIndex = point.rootIndex;
          updateInspector();
        }
      }
      state.drag = null;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", () => {
      if (!state.drag) {
        state.hoverRootIndex = null;
        byId("hoverLabel").hidden = true;
      }
    });
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        state.zoom = clamp(
          state.zoom * Math.exp(-event.deltaY * 0.001),
          0.5,
          2.4
        );
      },
      { passive: false }
    );
    canvas.addEventListener("dblclick", resetView);
  }

  function updateControlReadouts() {
    byId("orbitIndexValue").textContent = `${state.orbitIndex} / 75`;
    byId("edgeOpacityValue").textContent =
      `${Math.round(state.edgeOpacity * 100)}%`;
    byId("nodeSizeValue").textContent =
      `${state.nodeSize.toFixed(2)}×`;
    byId("rotationSpeedValue").textContent =
      `${state.rotationSpeed.toFixed(2)}×`;
    byId("depthValue").textContent =
      `${Math.round(state.depth * 100)}%`;
    byId("depthPhaseValue").textContent =
      `${Math.round(state.depthPhase / Core.TAU * 360)}°`;
    const phaseLabels = ["q → q", "q → q + 1", "q → q + 2"];
    byId("trialityPhaseValue").textContent =
      phaseLabels[state.trialityPhase];
    byId("tempoValue").textContent = `${byId("tempo").value} BPM`;
    byId("a4HzValue").textContent =
      `${(Number(byId("a4Hz").value) / 10).toFixed(1)} Hz`;
    byId("rotationToggle").textContent = state.rotationRunning
      ? "Pause rotation"
      : "Resume rotation";
    byId("rotationToggle").setAttribute(
      "aria-pressed",
      String(state.rotationRunning)
    );
    document.body.dataset.palette = state.palette;
    document.querySelectorAll("[data-a4]").forEach((button) => {
      button.classList.toggle(
        "active",
        Number(button.dataset.a4) === Number(byId("a4Hz").value) / 10
      );
    });
  }

  function ensureAudioContext() {
    if (!state.audio.context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) {
        throw new Error("This browser does not expose the Web Audio API");
      }
      state.audio.context = new Context();
    }
    return state.audio.context.resume().then(() => state.audio.context);
  }

  function audioBufferFromRendered(audioContext, rendered) {
    const buffer = audioContext.createBuffer(
      2,
      rendered.frameCount,
      rendered.sampleRate
    );
    buffer.copyToChannel(rendered.left, 0);
    buffer.copyToChannel(rendered.right, 1);
    return buffer;
  }

  async function playRendered(rendered, schedule, statusText) {
    const audioContext = await ensureAudioContext();
    stopAudio(false);
    const source = audioContext.createBufferSource();
    source.buffer = audioBufferFromRendered(audioContext, rendered);
    source.connect(audioContext.destination);
    const token = state.audio.token + 1;
    state.audio.token = token;
    state.audio.source = source;
    state.audio.schedule = schedule;
    state.audio.startedAt = audioContext.currentTime;
    source.onended = () => {
      if (state.audio.token === token) {
        stopAudio(false);
      }
    };
    source.start();
    document.body.dataset.audio = "playing";
    byId("playAudio").disabled = true;
    byId("stopAudio").disabled = false;
    byId("audioBadge").textContent = "audio playing";
    byId("audioBadge").classList.add("active");
    byId("audioStatus").textContent = statusText;
  }

  async function playAudio() {
    try {
      const contextSampleRate =
        state.audio.context?.sampleRate || 48000;
      const schedule = AudioModel.buildSchedule(
        audioSettings({ sampleRate: contextSampleRate }),
        records
      );
      byId("audioStatus").textContent =
        `Preparing ${schedule.events.length} deterministic events…`;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const rendered = AudioModel.renderPcm(schedule);
      await playRendered(
        rendered,
        schedule,
        `Playing ${schedule.events.length} events · ` +
          `${schedule.settings.traversal} · receiver A4 ` +
          `${schedule.settings.a4Hz.toFixed(1)} Hz`
      );
    } catch (error) {
      byId("audioStatus").textContent = `Playback failed: ${error.message}`;
      stopAudio(false);
    }
  }

  function stopAudio(updateStatus = true) {
    const source = state.audio.source;
    state.audio.token += 1;
    state.audio.source = null;
    state.audio.schedule = null;
    state.activeBasisIndex = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
    delete document.body.dataset.audio;
    byId("playAudio").disabled = false;
    byId("stopAudio").disabled = true;
    byId("audioBadge").textContent = "audio idle";
    byId("audioBadge").classList.remove("active");
    byId("audioProgressBar").style.width = "0%";
    if (updateStatus) {
      byId("audioStatus").textContent =
        "Playback stopped. The canonical symbolic note map is unchanged.";
    }
    drawSequence();
  }

  async function auditionSelected() {
    const record = records[state.selectedRootIndex];
    if (!record?.selected) {
      byId("audioStatus").textContent =
        "That root lies outside the ETQ-101 selector and has no canonical ETQ note.";
      return;
    }
    try {
      const fullSchedule = AudioModel.buildSchedule(
        audioSettings({
          traversal: "basis-order",
          tempo: 72,
          stepsPerBeat: 1,
          gate: 0.58,
          sampleRate: state.audio.context?.sampleRate || 48000
        }),
        records
      );
      const sourceEvent = fullSchedule.events.find(
        (event) => event.basisIndex === record.basisIndex
      );
      const event = {
        ...sourceEvent,
        eventIndex: 0,
        supportStep: 0,
        startTime: 0,
        duration: 0.58,
        stepDuration: 0.64
      };
      const schedule = {
        ...fullSchedule,
        events: [event],
        duration: 0.64,
        sourceEventCount: 1
      };
      const rendered = AudioModel.renderPcm(schedule);
      await playRendered(
        rendered,
        schedule,
        `Auditioning basis ${record.basisIndex} · MIDI ${record.midiNote} · ` +
          `${event.frequencyHz.toFixed(2)} Hz in this receiver`
      );
    } catch (error) {
      byId("audioStatus").textContent = `Audition failed: ${error.message}`;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function renderWav() {
    const button = byId("renderWav");
    button.disabled = true;
    byId("renderStatus").textContent =
      "Rendering deterministic stereo PCM…";
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const schedule = AudioModel.buildSchedule(
        audioSettings({ sampleRate: 48000 }),
        records
      );
      const rendered = AudioModel.renderPcm(schedule);
      const wav = AudioModel.encodeWav(rendered);
      const filename =
        `e8-${schedule.settings.traversal}-a4-${schedule.settings.a4Hz}` +
        `-${schedule.events.length}events.wav`;
      downloadBlob(new Blob([wav], { type: "audio/wav" }), filename);
      byId("renderStatus").textContent =
        `Rendered ${filename} · ${rendered.duration.toFixed(2)} s · ` +
        `${(wav.byteLength / 1024 / 1024).toFixed(2)} MiB`;
    } catch (error) {
      byId("renderStatus").textContent =
        `WAV render failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function exportManifest() {
    const schedule = AudioModel.buildSchedule(audioSettings(), records);
    const manifest = AudioModel.buildReceiverManifest(schedule);
    manifest.eventReceipt = AudioModel.scheduleReceipt(schedule);
    downloadBlob(
      new Blob([JSON.stringify(manifest, null, 2) + "\n"], {
        type: "application/json"
      }),
      `e8-${schedule.settings.traversal}-receiver-manifest.json`
    );
    byId("renderStatus").textContent =
      "Exported receiver manifest with canonical/receiver boundary and event receipt.";
  }

  function snapshot() {
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, "e8-root-space.png");
        byId("renderStatus").textContent =
          "Saved the current projection as a local PNG.";
      }
    }, "image/png");
  }

  function stateDocument() {
    return {
      format: "qsol-e8-lab-state",
      version: Core.VERSION,
      visual: {
        rootSelection: state.rootSelection,
        projection: state.projection,
        palette: state.palette,
        orbitIndex: state.orbitIndex,
        showEdges: state.showEdges,
        showSelectedHalo: state.showSelectedHalo,
        showAxes: state.showAxes,
        edgeOpacity: state.edgeOpacity,
        nodeSize: state.nodeSize,
        rotationRunning: state.rotationRunning,
        rotationSpeed: state.rotationSpeed,
        depth: state.depth,
        depthPhase: state.depthPhase,
        trialityPhase: state.trialityPhase,
        yaw: state.yaw,
        pitch: state.pitch,
        roll: state.roll,
        zoom: state.zoom,
        selectedRootIndex: state.selectedRootIndex
      },
      receiver: audioSettings(),
      boundary:
        "Visual depth and all acoustic fields are receiver settings, not E8 constants."
    };
  }

  function exportState() {
    downloadBlob(
      new Blob([JSON.stringify(stateDocument(), null, 2) + "\n"], {
        type: "application/json"
      }),
      "e8-lab-settings.json"
    );
    byId("renderStatus").textContent = "Exported deterministic lab settings.";
  }

  function applyImportedState(documentValue) {
    if (
      !documentValue ||
      documentValue.format !== "qsol-e8-lab-state" ||
      typeof documentValue.visual !== "object"
    ) {
      throw new Error("Not a QSOL E8 lab settings document");
    }
    const visual = documentValue.visual;
    const selections = [
      "all",
      "etq101",
      "integer",
      "half-integer",
      "fixed",
      "orbit"
    ];
    const projections = ["coxeter-depth", "coxeter-plane", "d4-blocks"];
    const palettes = ["triality", "rings", "family", "degree", "mono"];
    state.rootSelection = selections.includes(visual.rootSelection)
      ? visual.rootSelection
      : state.rootSelection;
    state.projection = projections.includes(visual.projection)
      ? visual.projection
      : state.projection;
    state.palette = palettes.includes(visual.palette)
      ? visual.palette
      : state.palette;
    state.orbitIndex = clamp(Math.round(Number(visual.orbitIndex) || 0), 0, 75);
    state.showEdges = visual.showEdges !== false;
    state.showSelectedHalo = visual.showSelectedHalo !== false;
    state.showAxes = visual.showAxes !== false;
    state.edgeOpacity = clamp(Number(visual.edgeOpacity) || 0, 0, 0.6);
    state.nodeSize = clamp(Number(visual.nodeSize) || 1, 0.45, 2.2);
    state.rotationRunning = visual.rotationRunning !== false;
    state.rotationSpeed = clamp(
      Number(visual.rotationSpeed) || 0,
      -1,
      1
    );
    state.depth = clamp(Number(visual.depth) || 0, 0, 1.4);
    state.depthPhase = (
      (Number(visual.depthPhase) || 0) % Core.TAU + Core.TAU
    ) % Core.TAU;
    state.trialityPhase = clamp(
      Math.round(Number(visual.trialityPhase) || 0),
      0,
      2
    );
    state.yaw = Number(visual.yaw) || 0;
    state.pitch = Number(visual.pitch) || 0;
    state.roll = Number(visual.roll) || 0;
    state.zoom = clamp(Number(visual.zoom) || 1, 0.5, 2.4);
    state.selectedRootIndex = clamp(
      Math.round(Number(visual.selectedRootIndex) || 0),
      0,
      records.length - 1
    );

    const receiver = AudioModel.normalizeSettings(documentValue.receiver);
    byId("traversal").value = receiver.traversal;
    byId("tempo").value = String(receiver.tempo);
    byId("stepsPerBeat").value = String(receiver.stepsPerBeat);
    byId("a4Hz").value = String(Math.round(receiver.a4Hz * 10));
    byId("geometryTimbre").checked = receiver.includeGeometryTimbre;
    syncControlsFromState();
    rebuildProjection();
    rebuildSchedule();
    byId("renderStatus").textContent = "Loaded lab settings.";
  }

  async function importState(file) {
    if (!file) {
      return;
    }
    try {
      const documentValue = JSON.parse(await file.text());
      applyImportedState(documentValue);
    } catch (error) {
      byId("renderStatus").textContent =
        `Could not load settings: ${error.message}`;
    }
  }

  function syncControlsFromState() {
    byId("rootSelection").value = state.rootSelection;
    byId("projection").value = state.projection;
    byId("palette").value = state.palette;
    byId("orbitIndex").value = String(state.orbitIndex);
    byId("showEdges").checked = state.showEdges;
    byId("showSelectedHalo").checked = state.showSelectedHalo;
    byId("showAxes").checked = state.showAxes;
    byId("edgeOpacity").value = String(Math.round(state.edgeOpacity * 100));
    byId("nodeSize").value = String(Math.round(state.nodeSize * 100));
    byId("rotationSpeed").value = String(
      Math.round(state.rotationSpeed * 100)
    );
    byId("depth").value = String(Math.round(state.depth * 100));
    byId("depthPhase").value = String(
      Math.round(state.depthPhase / Core.TAU * 360) % 360
    );
    byId("trialityPhase").value = String(state.trialityPhase);
    updateControlReadouts();
  }

  function stepTriality() {
    state.trialityPhase = (state.trialityPhase + 1) % 3;
    const record = records[state.selectedRootIndex];
    if (record && !record.fixed) {
      const transformed = Core.applyTriality(record.root);
      const next = recordByKey.get(Core.vectorKey(transformed));
      if (next) {
        state.selectedRootIndex = next.rootIndex;
      }
    }
    byId("trialityPhase").value = String(state.trialityPhase);
    updateControlReadouts();
    updateInspector();
  }

  function bindControls() {
    byId("rootSelection").addEventListener("change", (event) => {
      state.rootSelection = event.target.value;
      rebuildVisibleGeometry();
    });
    byId("orbitIndex").addEventListener("input", (event) => {
      state.orbitIndex = Number(event.target.value);
      updateControlReadouts();
      rebuildVisibleGeometry();
    });
    byId("projection").addEventListener("change", (event) => {
      state.projection = event.target.value;
      resetView();
      rebuildProjection();
      updateControlReadouts();
    });
    byId("palette").addEventListener("change", (event) => {
      state.palette = event.target.value;
      updateControlReadouts();
    });
    byId("showEdges").addEventListener("change", (event) => {
      state.showEdges = event.target.checked;
    });
    byId("showSelectedHalo").addEventListener("change", (event) => {
      state.showSelectedHalo = event.target.checked;
    });
    byId("showAxes").addEventListener("change", (event) => {
      state.showAxes = event.target.checked;
    });
    byId("edgeOpacity").addEventListener("input", (event) => {
      state.edgeOpacity = Number(event.target.value) / 100;
      updateControlReadouts();
    });
    byId("nodeSize").addEventListener("input", (event) => {
      state.nodeSize = Number(event.target.value) / 100;
      updateControlReadouts();
    });
    byId("rotationToggle").addEventListener("click", () => {
      state.rotationRunning = !state.rotationRunning;
      updateControlReadouts();
    });
    byId("resetView").addEventListener("click", resetView);
    byId("rotationSpeed").addEventListener("input", (event) => {
      state.rotationSpeed = Number(event.target.value) / 100;
      updateControlReadouts();
    });
    byId("depth").addEventListener("input", (event) => {
      state.depth = Number(event.target.value) / 100;
      updateControlReadouts();
    });
    byId("depthPhase").addEventListener("input", (event) => {
      state.depthPhase = Number(event.target.value) / 360 * Core.TAU;
      updateControlReadouts();
      rebuildProjection();
    });
    byId("trialityPhase").addEventListener("input", (event) => {
      state.trialityPhase = Number(event.target.value);
      updateControlReadouts();
    });
    byId("stepTriality").addEventListener("click", stepTriality);
    byId("traversal").addEventListener("change", rebuildSchedule);
    byId("tempo").addEventListener("input", () => {
      updateControlReadouts();
      rebuildSchedule();
    });
    byId("stepsPerBeat").addEventListener("change", rebuildSchedule);
    byId("a4Hz").addEventListener("input", () => {
      updateControlReadouts();
      updateInspector();
      rebuildSchedule();
    });
    document.querySelectorAll("[data-a4]").forEach((button) => {
      button.addEventListener("click", () => {
        byId("a4Hz").value = String(Number(button.dataset.a4) * 10);
        updateControlReadouts();
        updateInspector();
        rebuildSchedule();
      });
    });
    byId("geometryTimbre").addEventListener("change", rebuildSchedule);
    byId("playAudio").addEventListener("click", playAudio);
    byId("stopAudio").addEventListener("click", () => stopAudio());
    byId("auditionRoot").addEventListener("click", auditionSelected);
    byId("renderWav").addEventListener("click", renderWav);
    byId("snapshot").addEventListener("click", snapshot);
    byId("exportManifest").addEventListener("click", exportManifest);
    byId("exportState").addEventListener("click", exportState);
    byId("importState").addEventListener("change", (event) => {
      importState(event.target.files[0]);
      event.target.value = "";
    });
    document.addEventListener("keydown", (event) => {
      const tagName = document.activeElement?.tagName || "";
      if (event.code === "Space" && !/INPUT|SELECT|BUTTON/.test(tagName)) {
        event.preventDefault();
        state.rotationRunning = !state.rotationRunning;
        updateControlReadouts();
      }
      if (event.key.toLowerCase() === "t" && !/INPUT|SELECT/.test(tagName)) {
        stepTriality();
      }
    });
  }

  function initialize() {
    bindCanvas();
    bindControls();
    const reducedMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) {
      state.rotationRunning = false;
    }
    syncControlsFromState();
    rebuildProjection();
    rebuildSchedule();
    resize();
    updateInspector();
    new ResizeObserver(resize).observe(stage);
    new ResizeObserver(resize).observe(sequenceCanvas);
    requestAnimationFrame(render);
  }

  initialize();
})();
