// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Trent Slade / QSOL-IMC.
(function (global, factory) {
  const core =
    global.E8Core ||
    (typeof require === "function" ? require("./e8-core.js") : null);
  const api = factory(core);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.E8Audio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";

  if (!Core) {
    throw new Error("E8Core must load before E8Audio");
  }

  const VERSION = "1.0.0";
  const PROFILE_ID = "e8-geometry-auditory-display-v1";
  const SOURCE_MODEL = "ETQ-101@2.0.0";
  const MAPPING_ID = "centered-101-state-ternary-register-v1";
  const DEFAULT_SETTINGS = Object.freeze({
    traversal: "basis-order",
    tempo: 120,
    stepsPerBeat: 4,
    gate: 0.82,
    a4Hz: 432,
    masterGain: 0.72,
    sampleRate: 48000,
    includeGeometryTimbre: true,
    maxDurationSeconds: 90
  });

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function normalizeSettings(candidate = {}) {
    const source = candidate || {};
    const traversals = [
      "basis-order",
      "triality-orbits",
      "coxeter-rings",
      "graph-breadth-first",
      "etq303-support"
    ];
    return {
      traversal: traversals.includes(source.traversal)
        ? source.traversal
        : DEFAULT_SETTINGS.traversal,
      tempo: clamp(
        Number(source.tempo) || DEFAULT_SETTINGS.tempo,
        30,
        240
      ),
      stepsPerBeat: clamp(
        Math.round(Number(source.stepsPerBeat) || DEFAULT_SETTINGS.stepsPerBeat),
        1,
        16
      ),
      gate: clamp(
        Number.isFinite(Number(source.gate))
          ? Number(source.gate)
          : DEFAULT_SETTINGS.gate,
        0.15,
        1.5
      ),
      a4Hz: clamp(
        Number(source.a4Hz) || DEFAULT_SETTINGS.a4Hz,
        400,
        480
      ),
      masterGain: clamp(
        Number.isFinite(Number(source.masterGain))
          ? Number(source.masterGain)
          : DEFAULT_SETTINGS.masterGain,
        0.05,
        1
      ),
      sampleRate: clamp(
        Math.round(Number(source.sampleRate) || DEFAULT_SETTINGS.sampleRate),
        8000,
        96000
      ),
      includeGeometryTimbre: source.includeGeometryTimbre !== false,
      maxDurationSeconds: clamp(
        Number(source.maxDurationSeconds) ||
          DEFAULT_SETTINGS.maxDurationSeconds,
        5,
        180
      )
    };
  }

  function midiToFrequency(midiNote, a4Hz = DEFAULT_SETTINGS.a4Hz) {
    if (!Number.isFinite(midiNote)) {
      throw new TypeError("MIDI note must be finite");
    }
    if (!Number.isFinite(a4Hz) || a4Hz <= 0) {
      throw new RangeError("Receiver A4 must be a positive frequency");
    }
    return a4Hz * Math.pow(2, (midiNote - 69) / 12);
  }

  function selectedRecords(records = Core.buildRootRecords()) {
    return records
      .filter((record) => record.selected)
      .sort((left, right) => left.basisIndex - right.basisIndex);
  }

  function graphBreadthFirstOrder(records) {
    const selected = selectedRecords(records);
    const basis = selected.map((record) => record.root);
    const adjacency = Core.buildAdjacency(basis);
    const queue = [0];
    const seen = new Set([0]);
    const order = [];
    while (queue.length > 0) {
      const current = queue.shift();
      order.push(selected[current]);
      const neighbours = [];
      for (let index = 0; index < adjacency.length; index += 1) {
        if (adjacency[current][index] === 1 && !seen.has(index)) {
          neighbours.push(index);
        }
      }
      neighbours.sort((left, right) => {
        const degreeDifference =
          selected[right].selectedDegree - selected[left].selectedDegree;
        return degreeDifference || left - right;
      });
      for (const neighbour of neighbours) {
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
    return order;
  }

  function traversalRecords(records, traversal) {
    const selected = selectedRecords(records);
    if (traversal === "triality-orbits") {
      return [
        selected[0],
        ...selected.slice(2),
        selected[1]
      ];
    }
    if (traversal === "coxeter-rings") {
      const points = Core.projectRoots(
        records.map((record) => record.root),
        "coxeter-plane"
      );
      return [...selected].sort((left, right) => {
        const ringDifference = left.coxeterRing - right.coxeterRing;
        if (ringDifference !== 0) {
          return ringDifference;
        }
        const leftPoint = points[left.rootIndex];
        const rightPoint = points[right.rootIndex];
        return (
          Math.atan2(leftPoint.y, leftPoint.x) -
          Math.atan2(rightPoint.y, rightPoint.x)
        );
      });
    }
    if (traversal === "graph-breadth-first") {
      return graphBreadthFirstOrder(records);
    }
    return selected;
  }

  function phaseForRecord(record) {
    if (record.qutritLabel === null) {
      return 0;
    }
    return (
      Core.TAU * record.qutritLabel / 3 -
      Core.PHASE_THETA_RAD * Core.SCL_STENCIL[record.qutritLabel]
    );
  }

  function buildSchedule(candidate = {}, records = Core.buildRootRecords()) {
    const settings = normalizeSettings(candidate);
    const baseTraversal = traversalRecords(records, settings.traversal);
    const source =
      settings.traversal === "etq303-support"
        ? Array.from({ length: 303 }, (_, step) => ({
            record: baseTraversal[step % Core.ETQ_DIMENSION],
            fibre: step % 3,
            supportStep: step
          }))
        : baseTraversal.map((record, step) => ({
            record,
            fibre: null,
            supportStep: step
          }));
    const secondsPerStep = 60 / settings.tempo / settings.stepsPerBeat;
    const maximumEvents = Math.max(
      1,
      Math.floor(settings.maxDurationSeconds / secondsPerStep)
    );
    const truncated = source.length > maximumEvents;
    const steps = source.slice(0, maximumEvents);
    const degrees = selectedRecords(records).map(
      (record) => record.selectedDegree
    );
    const minimumDegree = Math.min(...degrees);
    const maximumDegree = Math.max(...degrees);
    const degreeSpan = Math.max(1, maximumDegree - minimumDegree);

    const events = steps.map((item, eventIndex) => {
      const record = item.record;
      const degreePosition =
        (record.selectedDegree - minimumDegree) / degreeSpan;
      const qutritPan =
        record.qutritLabel === null ? 0 : (record.qutritLabel - 1) * 0.58;
      const fibrePan =
        item.fibre === null ? 0 : (item.fibre - 1) * 0.18;
      const familyBrightness =
        record.family === "integer" ? 0.72 : 0.42;
      const ringPosition = record.coxeterRing / 7;
      return {
        eventIndex,
        supportStep: item.supportStep,
        basisIndex: record.basisIndex,
        rootIndex: record.rootIndex,
        root: [...record.root],
        stateType:
          record.qutritLabel === null
            ? "fixed-singlet"
            : "qutrit-orbit-state",
        fixedIndex: record.fixedIndex,
        orbitIndex: record.orbitIndex,
        qutritLabel: record.qutritLabel,
        externalFibre: item.fibre,
        lane: record.lane,
        sclCurvature: record.sclCurvature ?? 0,
        midiNote: record.midiNote,
        frequencyHz: midiToFrequency(record.midiNote, settings.a4Hz),
        startTime: eventIndex * secondsPerStep,
        duration: secondsPerStep * settings.gate,
        stepDuration: secondsPerStep,
        pan: clamp(qutritPan + fibrePan, -0.92, 0.92),
        phaseRad: phaseForRecord(record),
        amplitude:
          settings.masterGain * (0.14 + 0.09 * degreePosition),
        brightness: settings.includeGeometryTimbre
          ? clamp(
              0.2 +
                familyBrightness * 0.45 +
                degreePosition * 0.22 +
                ringPosition * 0.13,
              0,
              1
            )
          : 0.5,
        family: record.family,
        coxeterRing: record.coxeterRing,
        selectedDegree: record.selectedDegree,
        degreePosition
      };
    });

    return {
      profileId: PROFILE_ID,
      settings,
      events,
      sourceEventCount: source.length,
      truncated,
      duration:
        events.length === 0
          ? 0
          : events.at(-1).startTime +
            Math.max(events.at(-1).duration, secondsPerStep * 0.25)
    };
  }

  function partialsForEvent(event) {
    const brightness = clamp(event.brightness, 0, 1);
    if (event.family === "integer") {
      return [
        { multiple: 1, gain: 1 },
        { multiple: 2, gain: 0.16 + 0.23 * brightness },
        { multiple: 3, gain: 0.07 + 0.16 * brightness },
        { multiple: 5, gain: 0.03 + 0.09 * brightness }
      ];
    }
    return [
      { multiple: 1, gain: 1 },
      { multiple: 3, gain: 0.08 + 0.19 * brightness },
      { multiple: 5, gain: 0.03 + 0.1 * brightness },
      { multiple: 7, gain: 0.01 + 0.055 * brightness }
    ];
  }

  function envelope(time, duration) {
    if (time < 0 || time >= duration) {
      return 0;
    }
    const attack = Math.min(0.012, duration * 0.18);
    const release = Math.min(0.055, duration * 0.28);
    if (time < attack) {
      const position = time / Math.max(attack, 1e-9);
      return position * position;
    }
    if (time > duration - release) {
      const position =
        (duration - time) / Math.max(release, 1e-9);
      return position * position;
    }
    const body = (time - attack) /
      Math.max(duration - attack - release, 1e-9);
    return 0.88 + 0.12 * Math.sin(Math.PI * clamp(body, 0, 1));
  }

  function renderPcm(scheduleOrSettings = {}, records) {
    const schedule =
      Array.isArray(scheduleOrSettings.events)
        ? scheduleOrSettings
        : buildSchedule(scheduleOrSettings, records);
    const sampleRate = schedule.settings.sampleRate;
    const tailSeconds = 0.08;
    const frameCount = Math.max(
      1,
      Math.ceil((schedule.duration + tailSeconds) * sampleRate)
    );
    const left = new Float32Array(frameCount);
    const right = new Float32Array(frameCount);

    for (const event of schedule.events) {
      const startFrame = Math.max(
        0,
        Math.floor(event.startTime * sampleRate)
      );
      const endFrame = Math.min(
        frameCount,
        Math.ceil((event.startTime + event.duration) * sampleRate)
      );
      const partials = partialsForEvent(event);
      const panAngle = (event.pan + 1) * Math.PI / 4;
      const leftPan = Math.cos(panAngle);
      const rightPan = Math.sin(panAngle);
      const curvatureModulation =
        Math.abs(event.sclCurvature) * 0.035;

      for (let frame = startFrame; frame < endFrame; frame += 1) {
        const time = frame / sampleRate - event.startTime;
        const amplitude = envelope(time, event.duration) * event.amplitude;
        const basePhase =
          Core.TAU * event.frequencyHz * time + event.phaseRad;
        const modulation =
          curvatureModulation *
          Math.sin(Core.TAU * event.frequencyHz * 0.5 * time);
        let sample = 0;
        let partialWeight = 0;
        for (const partial of partials) {
          sample +=
            partial.gain *
            Math.sin(
              basePhase * partial.multiple +
              modulation * partial.multiple
            );
          partialWeight += partial.gain;
        }
        sample = sample / partialWeight * amplitude;
        left[frame] += sample * leftPan;
        right[frame] += sample * rightPan;
      }
    }

    let peak = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
    }
    const normalization = peak > 0.94 ? 0.94 / peak : 1;
    if (normalization !== 1) {
      for (let frame = 0; frame < frameCount; frame += 1) {
        left[frame] *= normalization;
        right[frame] *= normalization;
      }
    }

    return {
      schedule,
      sampleRate,
      channels: 2,
      frameCount,
      duration: frameCount / sampleRate,
      peakBeforeNormalization: peak,
      normalization,
      left,
      right
    };
  }

  function writeAscii(view, offset, text) {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  function encodeWav(rendered) {
    const channelCount = 2;
    const bytesPerSample = 2;
    const blockAlign = channelCount * bytesPerSample;
    const dataSize = rendered.frameCount * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, rendered.sampleRate, true);
    view.setUint32(
      28,
      rendered.sampleRate * blockAlign,
      true
    );
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let frame = 0; frame < rendered.frameCount; frame += 1) {
      const left = clamp(rendered.left[frame], -1, 1);
      const right = clamp(rendered.right[frame], -1, 1);
      view.setInt16(
        offset,
        left < 0 ? Math.round(left * 32768) : Math.round(left * 32767),
        true
      );
      view.setInt16(
        offset + 2,
        right < 0 ? Math.round(right * 32768) : Math.round(right * 32767),
        true
      );
      offset += 4;
    }
    return new Uint8Array(buffer);
  }

  function buildReceiverManifest(schedule, rendered = null) {
    const settings = schedule.settings;
    return {
      artifact: "E8 geometry auditory display",
      profile: PROFILE_ID,
      profileVersion: VERSION,
      sourceModel: SOURCE_MODEL,
      canonicalMapping: {
        mappingId: MAPPING_ID,
        basisStateCount: 101,
        midiOccupiedRange: [13, 113],
        qutritLaneRanges: {
          low: [14, 46],
          mid: [47, 79],
          high: [80, 112]
        },
        fixedSingletNotes: [13, 113],
        absoluteFrequencyHz: null,
        receiverTuning: "external-and-nonnormative"
      },
      receiver: {
        status: "authored-noncanonical-auditory-display",
        traversal: settings.traversal,
        tempoBpm: settings.tempo,
        stepsPerBeat: settings.stepsPerBeat,
        gate: settings.gate,
        a4Hz: settings.a4Hz,
        geometryTimbre: settings.includeGeometryTimbre,
        geometryFields: [
          "root family",
          "selected-graph degree",
          "Coxeter ring",
          "qutrit label",
          "SCL curvature",
          "optional ETQ-303 external fibre"
        ],
        eventCount: schedule.events.length,
        truncated: schedule.truncated,
        durationSeconds: schedule.duration
      },
      wav: rendered
        ? {
            sampleRate: rendered.sampleRate,
            channels: rendered.channels,
            format: "PCM signed 16-bit little-endian",
            frameCount: rendered.frameCount,
            normalization: rendered.normalization
          }
        : null,
      claimBoundary:
        "The ETQ note code is canonical symbolic data. Timing, A4, waveform, " +
        "pan, gain, geometry timbre, PCM, and WAV are declared receiver choices, " +
        "not frequencies or acoustic laws derived from E8."
    };
  }

  function scheduleReceipt(schedule) {
    return schedule.events.map((event) => [
      event.eventIndex,
      event.basisIndex,
      event.externalFibre,
      event.midiNote,
      Number(event.startTime.toFixed(9)),
      Number(event.duration.toFixed(9)),
      event.family,
      event.coxeterRing,
      event.selectedDegree
    ]);
  }

  return Object.freeze({
    VERSION,
    PROFILE_ID,
    SOURCE_MODEL,
    MAPPING_ID,
    DEFAULT_SETTINGS,
    normalizeSettings,
    midiToFrequency,
    selectedRecords,
    graphBreadthFirstOrder,
    traversalRecords,
    phaseForRecord,
    buildSchedule,
    partialsForEvent,
    envelope,
    renderPcm,
    encodeWav,
    buildReceiverManifest,
    scheduleReceipt
  });
});
