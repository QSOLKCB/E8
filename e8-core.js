// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Trent Slade / QSOL-IMC.
(function (global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.E8Core = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0.0";
  const TAU = Math.PI * 2;
  const ROOT_COUNT = 240;
  const INTEGER_ROOT_COUNT = 112;
  const HALF_INTEGER_ROOT_COUNT = 128;
  const COXETER_NUMBER = 30;
  const QUTRIT_DIMENSION = 3;
  const SELECTED_FIXED_ROOTS = 2;
  const SELECTED_TRIALITY_ORBITS = 33;
  const ETQ_DIMENSION =
    SELECTED_FIXED_ROOTS + QUTRIT_DIMENSION * SELECTED_TRIALITY_ORBITS;
  const SCL_STENCIL = Object.freeze([1, -2, 1]);
  const PHASE_THETA_RAD = Math.PI / 2;

  // Twice a standard E8 simple-root basis. Reflections in these roots generate
  // a Coxeter element of order 30. The coordinate convention matches the
  // doubled-integer root realization used throughout this lab.
  const SIMPLE_ROOTS = Object.freeze([
    Object.freeze([1, -1, -1, -1, -1, -1, -1, 1]),
    Object.freeze([2, 2, 0, 0, 0, 0, 0, 0]),
    Object.freeze([-2, 2, 0, 0, 0, 0, 0, 0]),
    Object.freeze([0, -2, 2, 0, 0, 0, 0, 0]),
    Object.freeze([0, 0, -2, 2, 0, 0, 0, 0]),
    Object.freeze([0, 0, 0, -2, 2, 0, 0, 0]),
    Object.freeze([0, 0, 0, 0, -2, 2, 0, 0]),
    Object.freeze([0, 0, 0, 0, 0, -2, 2, 0])
  ]);

  // Twice the embedded D4 triality matrix. Applying one block divides the
  // matrix-vector product by two.
  const D4_TRIALITY_NUMERATOR = Object.freeze([
    Object.freeze([1, 1, 1, 1]),
    Object.freeze([1, 1, -1, -1]),
    Object.freeze([1, -1, 1, -1]),
    Object.freeze([-1, 1, 1, -1])
  ]);

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function lexicographicCompare(left, right) {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (left[index] !== right[index]) {
        return left[index] - right[index];
      }
    }
    return left.length - right.length;
  }

  function vectorKey(vector) {
    return vector.join(",");
  }

  function dot(left, right) {
    let total = 0;
    for (let index = 0; index < left.length; index += 1) {
      total += left[index] * right[index];
    }
    return total;
  }

  function norm(vector) {
    return Math.sqrt(dot(vector, vector));
  }

  function populationCount(integer) {
    let value = integer;
    let count = 0;
    while (value !== 0) {
      count += value & 1;
      value >>>= 1;
    }
    return count;
  }

  function rootFamily(root) {
    return root.some((coordinate) => coordinate === 0)
      ? "integer"
      : "half-integer";
  }

  function generateE8Roots() {
    const roots = [];

    // 112 roots (+/-2, +/-2, 0, ..., 0), representing (+/-1, +/-1, 0, ...).
    for (let first = 0; first < 8; first += 1) {
      for (let second = first + 1; second < 8; second += 1) {
        for (const firstSign of [-2, 2]) {
          for (const secondSign of [-2, 2]) {
            const root = Array(8).fill(0);
            root[first] = firstSign;
            root[second] = secondSign;
            roots.push(root);
          }
        }
      }
    }

    // 128 roots (+/-1, ..., +/-1) with an even number of negative entries.
    for (let mask = 0; mask < 256; mask += 1) {
      if (populationCount(mask) % 2 !== 0) {
        continue;
      }
      roots.push(
        Array.from({ length: 8 }, (_, coordinate) =>
          (mask & (1 << coordinate)) === 0 ? 1 : -1
        )
      );
    }

    roots.sort(lexicographicCompare);
    return roots;
  }

  function applyTrialityBlock(block) {
    return D4_TRIALITY_NUMERATOR.map((row) => {
      const numerator = dot(row, block);
      if (numerator % 2 !== 0) {
        throw new Error("Triality left the doubled-coordinate E8 lattice");
      }
      return numerator / 2;
    });
  }

  function applyTriality(root) {
    if (!Array.isArray(root) || root.length !== 8) {
      throw new TypeError("An E8 root must contain exactly eight coordinates");
    }
    return [
      ...applyTrialityBlock(root.slice(0, 4)),
      ...applyTrialityBlock(root.slice(4, 8))
    ];
  }

  function trialityOrbit(root) {
    const first = [...root];
    const second = applyTriality(first);
    const third = applyTriality(second);
    const closure = applyTriality(third);
    if (vectorKey(closure) !== vectorKey(first)) {
      throw new Error("Embedded triality did not close after three actions");
    }
    return vectorKey(first) === vectorKey(second)
      ? [first]
      : [first, second, third];
  }

  function classifyTrialityOrbits(roots = generateE8Roots()) {
    const rootKeys = new Set(roots.map(vectorKey));
    const seen = new Set();
    const fixed = [];
    const triples = [];

    for (const root of [...roots].sort(lexicographicCompare)) {
      const key = vectorKey(root);
      if (seen.has(key)) {
        continue;
      }
      const rawOrbit = trialityOrbit(root);
      for (const member of rawOrbit) {
        const memberKey = vectorKey(member);
        if (!rootKeys.has(memberKey)) {
          throw new Error("Embedded triality did not preserve the E8 root set");
        }
        seen.add(memberKey);
      }

      if (rawOrbit.length === 1) {
        fixed.push(rawOrbit[0]);
        continue;
      }

      const representative = [...rawOrbit].sort(lexicographicCompare)[0];
      triples.push([
        representative,
        applyTriality(representative),
        applyTriality(applyTriality(representative))
      ]);
    }

    fixed.sort(lexicographicCompare);
    triples.sort((left, right) =>
      lexicographicCompare(left[0], right[0])
    );
    return { fixed, triples };
  }

  function buildTrialityMetadata(roots = generateE8Roots()) {
    const { fixed, triples } = classifyTrialityOrbits(roots);
    const metadata = new Map();
    fixed.forEach((root, fixedIndex) => {
      metadata.set(vectorKey(root), {
        fixed: true,
        fixedIndex,
        orbitIndex: null,
        qutritLabel: null
      });
    });
    triples.forEach((orbit, orbitIndex) => {
      orbit.forEach((root, qutritLabel) => {
        metadata.set(vectorKey(root), {
          fixed: false,
          fixedIndex: null,
          orbitIndex,
          qutritLabel
        });
      });
    });
    return metadata;
  }

  function selectEtq101Basis(roots = generateE8Roots()) {
    const { fixed, triples } = classifyTrialityOrbits(roots);
    if (fixed.length !== 12 || triples.length !== 76) {
      throw new Error(
        `Unexpected triality decomposition ${fixed.length} + 3*${triples.length}`
      );
    }
    const basis = fixed
      .slice(0, SELECTED_FIXED_ROOTS)
      .map((root) => [...root]);
    for (const orbit of triples.slice(0, SELECTED_TRIALITY_ORBITS)) {
      orbit.forEach((root) => basis.push([...root]));
    }
    if (basis.length !== ETQ_DIMENSION) {
      throw new Error(`Canonical selector produced ${basis.length} states`);
    }
    return basis;
  }

  function trialityPermutation() {
    const permutation = Array.from(
      { length: ETQ_DIMENSION },
      (_, index) => index
    );
    for (let orbit = 0; orbit < SELECTED_TRIALITY_ORBITS; orbit += 1) {
      const start = SELECTED_FIXED_ROOTS + QUTRIT_DIMENSION * orbit;
      for (let q = 0; q < QUTRIT_DIMENSION; q += 1) {
        permutation[start + q] =
          start + ((q + 1) % QUTRIT_DIMENSION);
      }
    }
    return permutation;
  }

  function buildAdjacency(basis = generateE8Roots()) {
    const adjacency = Array.from(
      { length: basis.length },
      () => Array(basis.length).fill(0)
    );
    for (let left = 0; left < basis.length; left += 1) {
      for (let right = left + 1; right < basis.length; right += 1) {
        // Doubled coordinates turn the conventional inner product 1 into 4.
        if (dot(basis[left], basis[right]) === 4) {
          adjacency[left][right] = 1;
          adjacency[right][left] = 1;
        }
      }
    }
    return adjacency;
  }

  function graphDegrees(adjacency) {
    if (!Array.isArray(adjacency) || adjacency.length === 0) {
      throw new TypeError("Adjacency must be a non-empty square matrix");
    }
    const dimension = adjacency.length;
    return adjacency.map((row) => {
      if (!Array.isArray(row) || row.length !== dimension) {
        throw new RangeError("Adjacency must be square");
      }
      return row.reduce((sum, value) => sum + value, 0);
    });
  }

  function graphSummary(adjacency) {
    const degrees = graphDegrees(adjacency);
    const visited = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      const current = queue.shift();
      for (let index = 0; index < adjacency.length; index += 1) {
        if (adjacency[current][index] === 1 && !visited.has(index)) {
          visited.add(index);
          queue.push(index);
        }
      }
    }
    return {
      vertices: adjacency.length,
      edges: degrees.reduce((sum, value) => sum + value, 0) / 2,
      minimumDegree: Math.min(...degrees),
      maximumDegree: Math.max(...degrees),
      connected: visited.size === adjacency.length,
      degrees
    };
  }

  function selectedDegreePotential(
    adjacency = buildAdjacency(selectEtq101Basis())
  ) {
    const degrees = graphDegrees(adjacency);
    const degreeSum = degrees.reduce((sum, value) => sum + value, 0);
    const numerators = degrees.map(
      (degree) => ETQ_DIMENSION * degree - degreeSum
    );
    const denominator = Math.max(...numerators.map(Math.abs));
    return {
      degrees,
      degreeSum,
      numerators,
      denominator,
      diagonal: numerators.map((value) => value / denominator)
    };
  }

  function midiNoteForTernaryState(orbitIndex, qutritLabel) {
    if (
      !Number.isSafeInteger(orbitIndex) ||
      orbitIndex < 0 ||
      orbitIndex >= SELECTED_TRIALITY_ORBITS
    ) {
      throw new RangeError("Orbit index lies outside the ETQ selector");
    }
    if (
      !Number.isSafeInteger(qutritLabel) ||
      qutritLabel < 0 ||
      qutritLabel >= QUTRIT_DIMENSION
    ) {
      throw new RangeError("Qutrit label lies outside {0,1,2}");
    }
    return 14 + SELECTED_TRIALITY_ORBITS * qutritLabel + orbitIndex;
  }

  function buildTernaryMidiCodebook() {
    const entries = [
      {
        basisIndex: 0,
        stateType: "fixed-singlet",
        fixedIndex: 0,
        orbitIndex: null,
        qutritLabel: null,
        lane: "fixed-low-bookend",
        sclCurvature: 0,
        midiNote: 13
      },
      {
        basisIndex: 1,
        stateType: "fixed-singlet",
        fixedIndex: 1,
        orbitIndex: null,
        qutritLabel: null,
        lane: "fixed-high-bookend",
        sclCurvature: 0,
        midiNote: 113
      }
    ];
    const laneNames = ["low", "mid", "high"];
    for (let orbitIndex = 0; orbitIndex < 33; orbitIndex += 1) {
      for (let qutritLabel = 0; qutritLabel < 3; qutritLabel += 1) {
        entries.push({
          basisIndex: 2 + 3 * orbitIndex + qutritLabel,
          stateType: "qutrit-orbit-state",
          fixedIndex: null,
          orbitIndex,
          qutritLabel,
          lane: laneNames[qutritLabel],
          sclCurvature: SCL_STENCIL[qutritLabel],
          midiNote: midiNoteForTernaryState(orbitIndex, qutritLabel)
        });
      }
    }
    entries.sort((left, right) => left.basisIndex - right.basisIndex);
    return entries;
  }

  function basisIndexFromMidiNote(note) {
    if (!Number.isSafeInteger(note)) {
      throw new TypeError("MIDI note must be a safe integer");
    }
    if (note === 13) {
      return 0;
    }
    if (note === 113) {
      return 1;
    }
    const offset = note - 14;
    if (offset < 0 || offset >= 99) {
      return null;
    }
    const qutritLabel = Math.floor(offset / 33);
    const orbitIndex = offset % 33;
    return 2 + 3 * orbitIndex + qutritLabel;
  }

  function identityMatrix(size) {
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) =>
        row === column ? 1 : 0
      )
    );
  }

  function multiplyMatrices(left, right) {
    const rows = left.length;
    const columns = right[0].length;
    const inner = right.length;
    return Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => {
        let value = 0;
        for (let index = 0; index < inner; index += 1) {
          value += left[row][index] * right[index][column];
        }
        return value;
      })
    );
  }

  function matrixVectorMultiply(matrix, vector) {
    return matrix.map((row) => dot(row, vector));
  }

  function reflectionMatrix(root) {
    // For doubled roots alpha.alpha=8:
    // s_alpha(v)=v-2(v.alpha)/(alpha.alpha) alpha
    //           =v-(v.alpha)/4 alpha.
    return Array.from({ length: 8 }, (_, row) =>
      Array.from({ length: 8 }, (_, column) =>
        (row === column ? 1 : 0) - root[row] * root[column] / 4
      )
    );
  }

  let cachedCoxeterElement = null;

  function coxeterElement() {
    if (cachedCoxeterElement) {
      return cachedCoxeterElement.map((row) => [...row]);
    }
    let transformation = identityMatrix(8);
    for (const root of SIMPLE_ROOTS) {
      transformation = multiplyMatrices(
        reflectionMatrix(root),
        transformation
      );
    }
    cachedCoxeterElement = transformation;
    return transformation.map((row) => [...row]);
  }

  function normalized(vector) {
    const length = norm(vector);
    if (length < 1e-12) {
      throw new Error("Cannot normalize a near-zero vector");
    }
    return vector.map((value) => value / length);
  }

  function subtractProjection(vector, basis) {
    const amount = dot(vector, basis);
    return vector.map((value, index) => value - amount * basis[index]);
  }

  const planeCache = new Map();

  function coxeterPlane(exponent = 1) {
    if (!Number.isSafeInteger(exponent) || exponent <= 0) {
      throw new RangeError("Coxeter exponent must be a positive integer");
    }
    if (planeCache.has(exponent)) {
      const cached = planeCache.get(exponent);
      return {
        cosine: [...cached.cosine],
        sine: [...cached.sine],
        exponent: cached.exponent
      };
    }

    const transformation = coxeterElement();
    const angle = TAU * exponent / COXETER_NUMBER;
    let cosineVector = null;
    let sineVector = null;

    for (let seedIndex = 0; seedIndex < 8; seedIndex += 1) {
      const seed = Array(8).fill(0);
      seed[seedIndex] = 1;
      let current = seed;
      const cosineCandidate = Array(8).fill(0);
      const sineCandidate = Array(8).fill(0);
      for (let step = 0; step < COXETER_NUMBER; step += 1) {
        const cosineWeight = Math.cos(angle * step);
        const sineWeight = Math.sin(angle * step);
        for (let coordinate = 0; coordinate < 8; coordinate += 1) {
          cosineCandidate[coordinate] +=
            cosineWeight * current[coordinate];
          sineCandidate[coordinate] += sineWeight * current[coordinate];
        }
        current = matrixVectorMultiply(transformation, current);
      }
      if (norm(cosineCandidate) > 1e-8 && norm(sineCandidate) > 1e-8) {
        cosineVector = normalized(cosineCandidate);
        sineVector = normalized(
          subtractProjection(sineCandidate, cosineVector)
        );
        break;
      }
    }

    if (!cosineVector || !sineVector) {
      throw new Error(`Could not construct Coxeter plane exponent ${exponent}`);
    }
    const result = {
      cosine: cosineVector,
      sine: sineVector,
      exponent
    };
    planeCache.set(exponent, result);
    return {
      cosine: [...result.cosine],
      sine: [...result.sine],
      exponent
    };
  }

  function projectRoots(
    roots = generateE8Roots(),
    mode = "coxeter-depth",
    depthPhase = 0
  ) {
    const primary = coxeterPlane(1);
    const secondary = coxeterPlane(7);
    let points;

    if (mode === "d4-blocks") {
      const scale = 1 / Math.sqrt(8);
      points = roots.map((root) => ({
        x: (root[0] - root[1] + root[2] - root[3]) * scale,
        y: (root[4] - root[5] + root[6] - root[7]) * scale,
        z: (
          root[0] + root[1] - root[2] - root[3] -
          root[4] - root[5] + root[6] + root[7]
        ) * scale * 0.5
      }));
    } else {
      const phase = Number(depthPhase) || 0;
      const depthAxis = secondary.cosine.map(
        (value, index) =>
          value * Math.cos(phase) + secondary.sine[index] * Math.sin(phase)
      );
      points = roots.map((root) => ({
        x: dot(root, primary.cosine),
        y: dot(root, primary.sine),
        z: mode === "coxeter-plane" ? 0 : dot(root, depthAxis) * 0.72
      }));
    }

    const maximumRadius = Math.max(
      ...points.map((point) => Math.hypot(point.x, point.y, point.z))
    ) || 1;
    return points.map((point) => ({
      x: point.x / maximumRadius,
      y: point.y / maximumRadius,
      z: point.z / maximumRadius
    }));
  }

  function coxeterRingSummary(roots = generateE8Roots(), tolerance = 1e-8) {
    const primary = coxeterPlane(1);
    const projected = roots.map((root, index) => {
      const x = dot(root, primary.cosine);
      const y = dot(root, primary.sine);
      return {
        index,
        radius: Math.hypot(x, y),
        angle: Math.atan2(y, x)
      };
    });
    const rings = [];
    for (const point of [...projected].sort(
      (left, right) => left.radius - right.radius
    )) {
      const ring = rings.find(
        (candidate) => Math.abs(candidate.radius - point.radius) <= tolerance
      );
      if (ring) {
        ring.points.push(point);
        ring.radius =
          ring.points.reduce((sum, item) => sum + item.radius, 0) /
          ring.points.length;
      } else {
        rings.push({ radius: point.radius, points: [point] });
      }
    }
    return rings.map((ring, ringIndex) => ({
      ringIndex,
      radius: ring.radius,
      count: ring.points.length,
      rootIndices: ring.points.map((point) => point.index)
    }));
  }

  function buildRootRecords() {
    const roots = generateE8Roots();
    const triality = buildTrialityMetadata(roots);
    const selected = selectEtq101Basis(roots);
    const selectedIndex = new Map(
      selected.map((root, index) => [vectorKey(root), index])
    );
    const fullAdjacency = buildAdjacency(roots);
    const fullDegrees = graphDegrees(fullAdjacency);
    const selectedAdjacency = buildAdjacency(selected);
    const selectedDegrees = graphDegrees(selectedAdjacency);
    const codebook = buildTernaryMidiCodebook();
    const rings = coxeterRingSummary(roots);
    const ringByRootIndex = new Map();
    rings.forEach((ring) => {
      ring.rootIndices.forEach((rootIndex) => {
        ringByRootIndex.set(rootIndex, ring.ringIndex);
      });
    });

    return roots.map((root, rootIndex) => {
      const key = vectorKey(root);
      const trialityData = triality.get(key);
      const basisIndex = selectedIndex.has(key)
        ? selectedIndex.get(key)
        : null;
      const mapping = basisIndex === null ? null : codebook[basisIndex];
      return {
        rootIndex,
        root: [...root],
        key,
        family: rootFamily(root),
        coxeterRing: ringByRootIndex.get(rootIndex),
        fullDegree: fullDegrees[rootIndex],
        selected: basisIndex !== null,
        basisIndex,
        selectedDegree:
          basisIndex === null ? null : selectedDegrees[basisIndex],
        fixed: trialityData.fixed,
        fixedIndex: trialityData.fixedIndex,
        orbitIndex: trialityData.orbitIndex,
        qutritLabel: trialityData.qutritLabel,
        midiNote: mapping?.midiNote ?? null,
        lane: mapping?.lane ?? null,
        sclCurvature: mapping?.sclCurvature ?? null
      };
    });
  }

  function rotatePoint(point, yaw, pitch, roll = 0) {
    const cosineYaw = Math.cos(yaw);
    const sineYaw = Math.sin(yaw);
    const cosinePitch = Math.cos(pitch);
    const sinePitch = Math.sin(pitch);
    const cosineRoll = Math.cos(roll);
    const sineRoll = Math.sin(roll);

    const yawX = point.x * cosineYaw - point.z * sineYaw;
    const yawZ = point.x * sineYaw + point.z * cosineYaw;
    const pitchY = point.y * cosinePitch - yawZ * sinePitch;
    const pitchZ = point.y * sinePitch + yawZ * cosinePitch;
    return {
      x: yawX * cosineRoll - pitchY * sineRoll,
      y: yawX * sineRoll + pitchY * cosineRoll,
      z: pitchZ
    };
  }

  return Object.freeze({
    VERSION,
    TAU,
    ROOT_COUNT,
    INTEGER_ROOT_COUNT,
    HALF_INTEGER_ROOT_COUNT,
    COXETER_NUMBER,
    QUTRIT_DIMENSION,
    SELECTED_FIXED_ROOTS,
    SELECTED_TRIALITY_ORBITS,
    ETQ_DIMENSION,
    SCL_STENCIL,
    PHASE_THETA_RAD,
    SIMPLE_ROOTS,
    D4_TRIALITY_NUMERATOR,
    clamp,
    lexicographicCompare,
    vectorKey,
    dot,
    norm,
    rootFamily,
    generateE8Roots,
    applyTriality,
    trialityOrbit,
    classifyTrialityOrbits,
    buildTrialityMetadata,
    selectEtq101Basis,
    trialityPermutation,
    buildAdjacency,
    graphDegrees,
    graphSummary,
    selectedDegreePotential,
    midiNoteForTernaryState,
    buildTernaryMidiCodebook,
    basisIndexFromMidiNote,
    identityMatrix,
    multiplyMatrices,
    matrixVectorMultiply,
    reflectionMatrix,
    coxeterElement,
    coxeterPlane,
    projectRoots,
    coxeterRingSummary,
    buildRootRecords,
    rotatePoint
  });
});
