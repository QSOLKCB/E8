# E8 Geometry Laboratory

An offline, deterministic browser laboratory for exploring the **240 roots of
E8** as exact geometry and as a carefully bounded auditory display.

**Launch the lab:** <https://qsolkcb.github.io/E8/>

The Pages link becomes live after this change is merged and the repository's
GitHub Pages source is set to **GitHub Actions**.

## What the lab does

- Generates the standard 240-root E8 system from exact doubled-integer
  coordinates: 112 integer-family roots and 128 half-integer-family roots.
- Builds the complete inner-product root graph with 6,720 edges and 56
  neighbours per root.
- Constructs a genuine order-30 Coxeter element and projects the roots onto its
  exponent-1 invariant plane, producing the characteristic **eight rings of 30
  roots**.
- Adds optional display depth from an exponent-7 invariant plane without
  pretending the three-dimensional receiver is the native eight-dimensional
  object.
- Applies the explicit embedded `D4 × D4` order-three triality used by
  [QSOLKCB/SONIFICATION](https://github.com/QSOLKCB/SONIFICATION), giving exactly
  12 fixed roots and 76 three-cycles.
- Reconstructs the normative ETQ-101 selector: two fixed roots plus the first
  33 complete triality orbits, for `2 + 33×3 = 101` root-indexed states.
- Provides interactive filters, structural palettes, root inspection, graph
  edges, drag rotation, zoom, triality stepping, PNG capture and settings
  import/export.
- Plays and renders deterministic stereo WAV files from the ETQ symbolic note
  code while preserving the distinction between canonical mathematical identity
  and an authored audio receiver.

No server, package install, build step, CDN, web font, telemetry or network API
is required at runtime. `index.html` can be opened directly from disk.

## Visual receivers

| Receiver | Exact input | Display choice |
|---|---|---|
| Coxeter plane | Exponent-1 invariant plane of an E8 Coxeter element | Screen scale, colour and rotation |
| Coxeter + depth | Same exact x/y plane | Exponent-7 plane supplies a declared z receiver |
| D4 × D4 blocks | The two four-coordinate blocks used by triality | Three linear combinations shown as x/y/z |
| Root graph | Inner product `r·s = 1`, tested as `(2r)·(2s) = 4` | Edge opacity and filtering |

The exact two-dimensional Coxeter receiver is the least interpretive view. The
other projections are useful ways to inspect relationships, not claims that E8
is intrinsically three-dimensional.

## Sonification model

The canonical part comes directly from **ETQ-101 v2**:

```text
basis j = 0, 1                       -> fixed singlets
basis j = 2 + 3m + q                -> m = 0..32, q = 0..2
M(s0) = 13
M(s1) = 113
M(m,q) = 14 + 33q + m
```

This gives an exact, reversible 101-note symbolic code:

| State class | MIDI notes | ETQ meaning |
|---|---:|---|
| Fixed singlet 0 | 13 | Lower codebook boundary |
| `q = 0` | 14–46 | Authored low register lane; SCL `+1` |
| `q = 1` | 47–79 | Authored mid register lane; SCL `−2` |
| `q = 2` | 80–112 | Authored high register lane; SCL `+1` |
| Fixed singlet 1 | 113 | Upper codebook boundary |

MIDI note number is canonical **symbolic identity**, not canonical hertz. This
lab adds a separately named receiver profile,
`e8-geometry-auditory-display-v1`:

| Geometry field | Receiver parameter | Why it is useful |
|---|---|---|
| Integer vs half-integer root family | Harmonic family | Distinguishes sparse and dense coordinate families |
| Selected-graph degree 22–55 | Brightness and gain | Makes local connectivity contrast audible |
| Coxeter ring 1–8 | Spectral colour | Preserves the eight-ring projection class |
| Qutrit label `q` | Register lane and stereo position | Retains the exact ETQ lane code |
| SCL value `[1,−2,1]` | Phase-modulation depth | Keeps curvature distinct from ordered pitch |
| ETQ-303 external fibre | Small stereo displacement | Exposes the independent three-state fibre |

Tempo, step duration, A4 tuning, pan, gain, waveform, partials, sample rate, PCM
and WAV serialization are all recorded **receiver settings**. They are not
derived from E8.

The lab defaults to A4 = 432 Hz as an audible receiver preset because it is
useful in QSOL music workflows. A4 = 440 Hz is one click away. Neither value is
part of ETQ-101 structural identity, and every exported manifest says so
explicitly.

## Event traversals

- **ETQ-101 basis order** follows the canonical root-indexed basis.
- **Triality orbit groups** places the two singlets around 33 ordered
  `q = 0,1,2` triples.
- **Coxeter ring / angle** makes the selected roots move through the exact
  eight-ring projection.
- **Selected graph breadth-first** follows deterministic connectivity, sorting
  newly discovered neighbours by degree and then basis index.
- **ETQ-303 support traversal** uses
  `(j,a) → (j+1 mod 101, a+1 mod 3)`. Coprimality gives all 303 pairs exactly
  once before closure. The root note remains the ETQ-101 code; the independent
  fibre is a receiver field.

## Run locally

Open `index.html` directly, or serve the directory with any static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Run the dependency-free structural and audio smoke suite with Node.js 20 or
newer:

```bash
npm test
```

or:

```bash
node tests/smoke.mjs
```

## Deterministic checks

The smoke suite fixes:

- 240 unique doubled-coordinate roots, every norm squared 8;
- the `112 + 128` coordinate-family split;
- Coxeter element order 30 and eight 30-root projection rings;
- triality decomposition `12 + 76×3`;
- full graph fixtures `240 / 6,720 / degree 56`;
- ETQ graph fixtures `101 / 1,687 / degree 22–55`;
- degree-potential receipts `sum = 3,374`, denominator `2,181`;
- all 101 codebook notes, inverse mapping and triality lane shift;
- the 303-pair support traversal;
- deterministic stereo PCM and a valid 16-bit RIFF/WAVE container;
- local-only runtime resources and the Pages deployment workflow.

## Repository layout

```text
index.html                    Browser instrument
style.css                     Responsive offline interface
e8-core.js                    Exact E8, triality, graph and Coxeter construction
audio-core.js                 ETQ codebook receiver, schedules and WAV encoder
app.js                        Canvas, controls, Web Audio and local capture
docs/MATHEMATICAL_RECEIVERS.md Projection derivation and claim boundary
docs/SONIFICATION_PROFILE.md  Canonical mapping vs receiver contract
tests/smoke.mjs               Dependency-free regression suite
.github/workflows/            CI and GitHub Pages deployment
```

## Scientific boundary

Supported descriptions include:

- “the standard 240 E8 roots in doubled integer coordinates”;
- “the E8 root graph under inner-product-one adjacency”;
- “a Coxeter-plane projection with eight 30-root rings”;
- “D4 triality embedded in the E8 root system”;
- “a deterministic, triality-closed 101-state root-indexed truncation”; and
- “an authored auditory receiver using the ETQ symbolic MIDI codebook.”

The lab does **not** claim:

- a 101-dimensional representation of E8;
- that the screen is the full eight-dimensional geometry;
- that low/mid/high is an intrinsic qutrit energy order;
- that MIDI or a pleasing WAV validates E8 or a physical theory;
- that E8 selects 432 Hz, 440 Hz, a waveform, a tempo or a musical scale; or
- that projection depth or sound is a measurement of a physical E8 system.

## Lineage

- Product and offline-lab architecture:
  [QSOLKCB/VORTEX](https://github.com/QSOLKCB/VORTEX)
- Normative ETQ mathematics, selector and symbolic MIDI mapping:
  [QSOLKCB/SONIFICATION](https://github.com/QSOLKCB/SONIFICATION)

The source implementation is independently organized for this repository while
preserving the cited ETQ formulas and claim boundaries.

## Creator and licence

Created by **Trent Slade / QSOL-IMC**.

Source code and documentation are licensed under the
[Mozilla Public License 2.0](LICENSE). Preserve copyright and licence notices
and identify modified files as required by the licence.
