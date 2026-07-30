// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..");
const Core = require(path.join(root, "e8-core.js"));
const AudioModel = require(path.join(root, "audio-core.js"));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  assert.ok(
    fs.existsSync(path.join(root, relativePath)),
    `missing required file: ${relativePath}`
  );
}

function near(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} is not within ${epsilon} of ${expected}`
  );
}

function matrixIdentityError(matrix) {
  let error = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      error = Math.max(
        error,
        Math.abs(matrix[row][column] - (row === column ? 1 : 0))
      );
    }
  }
  return error;
}

const requiredFiles = [
  "index.html",
  "style.css",
  "e8-core.js",
  "audio-core.js",
  "app.js",
  "README.md",
  "CHANGELOG.md",
  "CITATION.cff",
  "LICENSE",
  "package.json",
  ".nojekyll",
  "docs/MATHEMATICAL_RECEIVERS.md",
  "docs/SONIFICATION_PROFILE.md",
  "tests/smoke.mjs",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml"
];
requiredFiles.forEach(exists);

for (const relativePath of [
  "index.html",
  "style.css",
  "e8-core.js",
  "audio-core.js",
  "app.js",
  "tests/smoke.mjs"
]) {
  assert.match(
    read(relativePath).slice(0, 220),
    /SPDX-License-Identifier:\s*MPL-2\.0/,
    `${relativePath} must declare MPL-2.0`
  );
}
assert.match(read("LICENSE"), /Mozilla Public License Version 2\.0/);
assert.equal(JSON.parse(read("package.json")).license, "MPL-2.0");

new vm.Script(read("e8-core.js"), { filename: "e8-core.js" });
new vm.Script(read("audio-core.js"), { filename: "audio-core.js" });
new vm.Script(read("app.js"), { filename: "app.js" });

assert.equal(Core.VERSION, "1.0.0");
assert.equal(Core.ROOT_COUNT, 240);
assert.equal(Core.COXETER_NUMBER, 30);
assert.equal(Core.ETQ_DIMENSION, 101);
assert.deepEqual(Core.SCL_STENCIL, [1, -2, 1]);

const roots = Core.generateE8Roots();
assert.equal(roots.length, 240);
assert.equal(new Set(roots.map(Core.vectorKey)).size, 240);
assert.ok(roots.every((root) => Core.dot(root, root) === 8));
assert.equal(
  roots.filter((root) => Core.rootFamily(root) === "integer").length,
  112
);
assert.equal(
  roots.filter((root) => Core.rootFamily(root) === "half-integer").length,
  128
);
const rootKeys = new Set(roots.map(Core.vectorKey));
assert.ok(
  Core.SIMPLE_ROOTS.every((root) => rootKeys.has(Core.vectorKey(root))),
  "all declared simple roots must belong to the E8 root system"
);

const triality = Core.classifyTrialityOrbits(roots);
assert.equal(triality.fixed.length, 12);
assert.equal(triality.triples.length, 76);
assert.equal(12 + 3 * 76, 240);
for (const root of roots) {
  const once = Core.applyTriality(root);
  const twice = Core.applyTriality(once);
  const thrice = Core.applyTriality(twice);
  assert.ok(rootKeys.has(Core.vectorKey(once)));
  assert.deepEqual(thrice, root);
}

const coxeter = Core.coxeterElement();
let power = Core.identityMatrix(8);
let firstClosure = null;
for (let exponent = 1; exponent <= 30; exponent += 1) {
  power = Core.multiplyMatrices(coxeter, power);
  if (matrixIdentityError(power) < 1e-12 && firstClosure === null) {
    firstClosure = exponent;
  }
}
assert.equal(firstClosure, 30);
assert.ok(matrixIdentityError(power) < 1e-12);
for (const exponent of [1, 7]) {
  const plane = Core.coxeterPlane(exponent);
  near(Core.dot(plane.cosine, plane.cosine), 1);
  near(Core.dot(plane.sine, plane.sine), 1);
  near(Core.dot(plane.cosine, plane.sine), 0);
}
const rings = Core.coxeterRingSummary(roots);
assert.equal(rings.length, 8);
assert.deepEqual(rings.map((ring) => ring.count), Array(8).fill(30));
for (let index = 1; index < rings.length; index += 1) {
  assert.ok(rings[index].radius > rings[index - 1].radius);
}
assert.equal(
  new Set(rings.flatMap((ring) => ring.rootIndices)).size,
  240
);

const fullAdjacency = Core.buildAdjacency(roots);
const fullGraph = Core.graphSummary(fullAdjacency);
assert.equal(fullGraph.vertices, 240);
assert.equal(fullGraph.edges, 6720);
assert.equal(fullGraph.minimumDegree, 56);
assert.equal(fullGraph.maximumDegree, 56);
assert.equal(fullGraph.connected, true);

const basis = Core.selectEtq101Basis(roots);
assert.equal(basis.length, 101);
assert.equal(new Set(basis.map(Core.vectorKey)).size, 101);
assert.deepEqual(basis.slice(0, 2), triality.fixed.slice(0, 2));
const selectedAdjacency = Core.buildAdjacency(basis);
const selectedGraph = Core.graphSummary(selectedAdjacency);
assert.equal(selectedGraph.vertices, 101);
assert.equal(selectedGraph.edges, 1687);
assert.equal(selectedGraph.minimumDegree, 22);
assert.equal(selectedGraph.maximumDegree, 55);
assert.equal(selectedGraph.connected, true);
assert.equal(
  selectedGraph.degrees.reduce((sum, value) => sum + value, 0),
  3374
);
const degreeCounts = new Map();
selectedGraph.degrees.forEach((degree) => {
  degreeCounts.set(degree, (degreeCounts.get(degree) ?? 0) + 1);
});
assert.deepEqual(Object.fromEntries(degreeCounts), {
  22: 12,
  23: 6,
  30: 12,
  32: 24,
  33: 12,
  34: 6,
  40: 6,
  42: 12,
  43: 6,
  44: 3,
  55: 2
});
const potential = Core.selectedDegreePotential(selectedAdjacency);
assert.equal(potential.degreeSum, 3374);
assert.equal(potential.denominator, 2181);
assert.equal(
  potential.numerators.reduce((sum, value) => sum + value, 0),
  0
);
near(Math.max(...potential.diagonal.map(Math.abs)), 1);

const codebook = Core.buildTernaryMidiCodebook();
assert.equal(codebook.length, 101);
assert.equal(new Set(codebook.map((entry) => entry.midiNote)).size, 101);
assert.deepEqual(codebook.slice(0, 2).map((entry) => entry.midiNote), [13, 113]);
assert.deepEqual(
  ["low", "mid", "high"].map((lane) => {
    const notes = codebook
      .filter((entry) => entry.lane === lane)
      .map((entry) => entry.midiNote);
    return [Math.min(...notes), Math.max(...notes)];
  }),
  [[14, 46], [47, 79], [80, 112]]
);
for (const entry of codebook) {
  assert.equal(Core.basisIndexFromMidiNote(entry.midiNote), entry.basisIndex);
  if (entry.qutritLabel !== null) {
    assert.equal(
      entry.midiNote,
      14 + 33 * entry.qutritLabel + entry.orbitIndex
    );
  }
}
for (const note of [0, 12, 114, 127]) {
  assert.equal(Core.basisIndexFromMidiNote(note), null);
}
const permutation = Core.trialityPermutation();
const codeByBasis = new Map(
  codebook.map((entry) => [entry.basisIndex, entry])
);
for (const entry of codebook.filter((item) => item.qutritLabel !== null)) {
  const mapped = codeByBasis.get(permutation[entry.basisIndex]);
  assert.equal(
    mapped.midiNote - 14,
    (entry.midiNote - 14 + 33) % 99
  );
}

const records = Core.buildRootRecords();
assert.equal(records.length, 240);
assert.equal(records.filter((record) => record.selected).length, 101);
assert.equal(records.filter((record) => record.fixed).length, 12);
assert.ok(records.every((record) => record.fullDegree === 56));

const traversalNames = [
  "basis-order",
  "triality-orbits",
  "coxeter-rings",
  "graph-breadth-first"
];
for (const traversal of traversalNames) {
  const schedule = AudioModel.buildSchedule({ traversal }, records);
  assert.equal(schedule.events.length, 101);
  assert.equal(
    new Set(schedule.events.map((event) => event.basisIndex)).size,
    101
  );
  assert.ok(schedule.events.every((event) =>
    Number.isFinite(event.frequencyHz) &&
    event.frequencyHz > 0 &&
    event.midiNote >= 13 &&
    event.midiNote <= 113
  ));
}

const etq303 = AudioModel.buildSchedule(
  { traversal: "etq303-support" },
  records
);
assert.equal(etq303.events.length, 303);
assert.equal(
  new Set(
    etq303.events.map(
      (event) => `${event.basisIndex},${event.externalFibre}`
    )
  ).size,
  303
);
assert.deepEqual(
  AudioModel.scheduleReceipt(etq303),
  AudioModel.scheduleReceipt(
    AudioModel.buildSchedule({ traversal: "etq303-support" }, records)
  )
);

near(AudioModel.midiToFrequency(69, 432), 432);
near(AudioModel.midiToFrequency(69, 440), 440);
const shortSchedule = AudioModel.buildSchedule(
  {
    traversal: "basis-order",
    tempo: 240,
    stepsPerBeat: 16,
    sampleRate: 8000,
    maxDurationSeconds: 5
  },
  records
);
const rendered = AudioModel.renderPcm(shortSchedule);
assert.equal(rendered.sampleRate, 8000);
assert.equal(rendered.channels, 2);
assert.equal(rendered.left.length, rendered.frameCount);
assert.equal(rendered.right.length, rendered.frameCount);
assert.ok(rendered.left.every(Number.isFinite));
assert.ok(rendered.right.every(Number.isFinite));
const wav = AudioModel.encodeWav(rendered);
assert.equal(wav.byteLength, 44 + rendered.frameCount * 4);
assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
const wavView = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
assert.equal(wavView.getUint16(22, true), 2);
assert.equal(wavView.getUint32(24, true), 8000);
assert.equal(wavView.getUint16(34, true), 16);
assert.equal(wavView.getUint32(40, true), rendered.frameCount * 4);

const manifest = AudioModel.buildReceiverManifest(shortSchedule, rendered);
assert.equal(manifest.profile, "e8-geometry-auditory-display-v1");
assert.equal(manifest.sourceModel, "ETQ-101@2.0.0");
assert.equal(manifest.canonicalMapping.absoluteFrequencyHz, null);
assert.equal(
  manifest.canonicalMapping.receiverTuning,
  "external-and-nonnormative"
);
assert.equal(
  manifest.receiver.status,
  "authored-noncanonical-auditory-display"
);
assert.equal(manifest.receiver.a4Hz, 432);

const html = read("index.html");
const app = read("app.js");
const declaredIds = new Set(
  [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
);
for (const match of app.matchAll(/byId\("([^"]+)"\)/g)) {
  assert.ok(
    declaredIds.has(match[1]),
    `app.js references missing element #${match[1]}`
  );
}
assert.doesNotMatch(
  html,
  /<(?:script|img)[^>]+src=["']https?:/i,
  "runtime scripts and images must remain local"
);
assert.doesNotMatch(
  html,
  /<link[^>]+href=["']https?:/i,
  "runtime stylesheets must remain local"
);
assert.doesNotMatch(
  [app, read("e8-core.js"), read("audio-core.js")].join("\n"),
  /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/,
  "the offline lab must not call network APIs"
);
assert.doesNotMatch(
  read("audio-core.js"),
  /Math\.random|Date\.now/,
  "the deterministic audio renderer must not use random or wall-clock inputs"
);
assert.match(html, /M\(m,q\) = 14 \+ 33q \+ m/);
assert.match(html, /Render \.WAV/);
assert.match(html, /ETQ-303 support traversal/);
assert.match(html, /Acoustic tuning and sound are\s+external receiver choices/i);
assert.match(read(".github/workflows/pages.yml"), /deploy-pages@v4/);
assert.match(read(".github/workflows/pages.yml"), /npm test/);

console.log(
  "E8 smoke: 240 roots, Coxeter 8×30, D4 triality, ETQ-101 mapping, " +
  "303 traversal, deterministic WAV, offline runtime and Pages verified."
);
