# E8 Geometry Auditory Display Profile

**Profile ID:** `e8-geometry-auditory-display-v1`  
**Version:** 1.0.0  
**Canonical source:** `ETQ-101@2.0.0`  
**Canonical mapping:** `centered-101-state-ternary-register-v1`  
**Status:** Authored noncanonical audio receiver with deterministic PCM/WAV

## 1. Separation rule

The laboratory preserves two layers:

```text
ETQ basis identity
  -> canonical symbolic MIDI note
  -> declared browser receiver
  -> Web Audio playback or deterministic PCM/WAV
```

Only the first arrow belongs to the ETQ-101 v2 symbolic mapping. The receiver
does not modify ETQ basis identity, selector order, note number or inverse.

## 2. Canonical symbolic mapping

The two fixed singlets map to notes 13 and 113. For triality orbit
`m = 0..32` and qutrit label `q = 0..2`:

```text
basisIndex(m,q) = 2 + 3m + q
M(m,q) = 14 + 33q + m.
```

The inverse for notes 14–112 is:

```text
offset = note − 14
q = floor(offset / 33)
m = offset mod 33
basisIndex = 2 + 3m + q.
```

Triality `q -> q+1 mod 3` is addition of 33 modulo 99 inside the qutrit note
window. No acoustic frequency is canonical.

## 3. Receiver parameter map

| Source field | Target | Transfer | Status |
|---|---|---|---|
| ETQ symbolic note | Oscillator fundamental | Receiver `midiToHz(note, A4)` | External tuning |
| Root family | Partial set | integer→all partials; half-integer→odd partials | Authored |
| Selected degree | Gain/brightness | Linear over exact 22–55 range | Authored |
| Coxeter ring | Brightness | Linear over ring index 0–7 | Authored |
| Qutrit label | Pan | `q = 0,1,2 -> −0.58,0,+0.58` | Authored |
| SCL value | Phase modulation | Magnitude controls small modulation index | Authored |
| ETQ-303 fibre | Pan offset | `a = 0,1,2 -> −0.18,0,+0.18` | Authored |
| Event traversal | Onset | Uniform receiver step | Authored |
| Tempo/subdivision | Step duration | `60 / BPM / stepsPerBeat` | Authored |

The qutrit label already controls the canonical register lane. Stereo pan is a
redundant display cue. The SCL stencil is not treated as an ordered
low/mid/high pitch value.

## 4. Phase

For a selected qutrit state, the receiver starts with the ETQ ternary/SCL phase:

```text
phase(q) = 2 pi q / 3 − (pi/2) d_q,
d = [1, −2, 1].
```

Fixed singlets use phase zero. In ETQ, complex phase is not automatically
audible. Here it becomes audible only because the receiver explicitly applies
the value as oscillator phase and a small modulation control.

## 5. Traversals

### Basis order

One event for each basis index `0..100`.

### Triality orbit groups

Lower singlet, 33 complete `q=0,1,2` orbits, upper singlet.

### Coxeter rings

Selected roots sorted by exact Coxeter ring, then projected polar angle.

### Selected graph breadth-first

Deterministic breadth-first search from basis 0. Newly discovered neighbours
are ordered by descending selected degree and then basis index.

### ETQ-303 support

Starting from `(j,a) = (0,0)`:

```text
(j,a) -> (j+1 mod 101, a+1 mod 3).
```

The schedule visits 303 unique pairs. Root identity and MIDI note come from
`j`; `a` remains an independent receiver field.

## 6. PCM and WAV contract

- deterministic Float32 stereo accumulation;
- no randomness or network input;
- quadratic attack and release ramps;
- constant-power pan;
- deterministic peak normalization only when peak exceeds 0.94;
- 48 kHz browser export by default;
- signed 16-bit little-endian interleaved PCM;
- RIFF/WAVE container with one `fmt ` and one `data` chunk.

The receiver JSON records sample rate, traversal, timing, A4, geometry-timbre
switch, event count and normalization.

## 7. A4 boundary

The interface defaults to A4 = 432 Hz as a QSOL music-workflow preset and
offers A4 = 440 Hz. The manifest always records:

```json
{
  "absoluteFrequencyHz": null,
  "receiverTuning": "external-and-nonnormative"
}
```

The chosen A4 appears only under the noncanonical `receiver` block.

## 8. Claim boundary

Supported:

- the note map is the exact ETQ-101 v2 bijection;
- schedules and WAV bytes are deterministic for fixed settings;
- the stated geometry fields control the stated receiver parameters;
- exported manifests distinguish canonical and receiver fields.

Not supported:

- E8 predicts A4 = 432 Hz or A4 = 440 Hz;
- Coxeter radius is an intrinsic acoustic frequency;
- qutrit labels are physical energy levels;
- SCL values are a musical scale;
- the chosen timbre is uniquely correct;
- pleasantness or listener success validates E8 or a physical theory.
