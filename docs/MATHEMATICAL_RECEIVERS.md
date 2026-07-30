# Mathematical Receivers

This document records which parts of the E8 laboratory are exact constructions
and which parts are projection choices.

## 1. Exact root construction

The standard E8 root system is

```text
{ ±e_i ±e_j : i < j }
union
{ 1/2(s_1,...,s_8) : s_i in {−1,+1}, even minus-sign parity }.
```

The implementation stores doubled coordinates `2r`. Integer-family roots
therefore contain two entries in `{−2,+2}` and six zeros. Half-integer-family
roots contain eight entries in `{−1,+1}` with even negative parity.

Every stored root satisfies:

```text
(2r)·(2r) = 8.
```

Conventional inner-product-one adjacency becomes the exact integer test:

```text
(2r)·(2s) = 4.
```

This produces a 240-vertex, 6,720-edge regular graph of degree 56.

## 2. Coxeter element

`e8-core.js` declares eight doubled simple roots. Reflection in a doubled root
`alpha` is:

```text
s_alpha(v) = v − (v·alpha / 4) alpha,
```

because `alpha·alpha = 8`.

The ordered product of the eight simple reflections is a Coxeter element `C`.
The implementation verifies `C^30 = I`. For exponent `m`, an invariant real
plane is extracted from a coordinate seed by the finite Fourier projectors:

```text
u_m = sum(k=0..29) cos(2 pi m k / 30) C^k v
v_m = sum(k=0..29) sin(2 pi m k / 30) C^k v.
```

After normalization and Gram–Schmidt orthogonalization, root coordinates in the
exponent-1 plane are:

```text
x(r) = r·u_1
y(r) = r·v_1.
```

The radii cluster into exactly eight groups of 30 roots. This is the exact
Coxeter-plane receiver.

## 3. Optional exponent-7 depth

The three-dimensional default keeps exponent-1 coordinates as x/y and uses a
phase-selected axis in the exponent-7 invariant plane:

```text
z_phi(r) = r·(u_7 cos(phi) + v_7 sin(phi)).
```

This preserves exact linear data from another Coxeter invariant plane, but
choosing it as screen depth is an authored receiver. It is not a claim that the
E8 root system is natively three-dimensional.

## 4. Embedded D4 triality

On each four-coordinate block the order-three action is:

```text
    1  1  1  1
    1  1 −1 −1
A = 1/2 [1 −1  1 −1]
   −1  1  1 −1
```

The eight-dimensional action is `tau = A direct-sum A`. Exact enumeration gives:

```text
12 fixed roots + 76 orbits of length 3 = 240.
```

Triality is the exceptional outer symmetry of D4/Spin(8) embedded here in the
E8 root set. The lab does not call it an outer automorphism of E8.

## 5. ETQ-101 selector

Roots and orbit representatives are ordered numerically and lexicographically.
The selector keeps:

1. the first two triality-fixed roots; and
2. the first 33 complete triality three-cycles.

The resulting 101 roots label formal orthonormal states:

```text
H_101 = C^2 direct-sum (C^33 tensor C^3).
```

This is a 101-dimensional root-indexed graph truncation. The labels still live
in eight-dimensional Euclidean root space, and they are not 101 linearly
independent vectors in that space.

The restricted graph has 1,687 edges, degree range 22–55 and degree sum 3,374.
Its exact centered degree potential is:

```text
V_degree[j,j] = (101 degree_j − 3374) / 2181.
```

## 6. Display boundary

Exact:

- root coordinates and counts;
- integer inner products;
- reflections and Coxeter order;
- invariant-plane projection coordinates;
- eight-by-thirty ring partition;
- triality action and orbit partition;
- ETQ selector and graph fixtures.

Authored:

- coordinate scale, camera rotation and perspective;
- exponent-7 axis phase and depth amount;
- D4-block linear combinations;
- colour palettes, opacity and root size;
- filtering and animated highlighting.
