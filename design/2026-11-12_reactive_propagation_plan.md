# Reactive Propagation in Dependency Order

- **Status**: 💬 **Discussion** (2026-11-13, the crash of cycles that never settle is fixed with a nesting counter (§2); the full design waits until a feature needs values without half-updated states (§3); review of cost, GC and code size in §5)
- **Date**: 2026-11-12
- **Related**: `design/2026-11-12_two_phase_frame_plan.md` (§3.1.1: its update phase orders readers with `t`; could share the ordering code), `design/2026-10-26_tolocal_fix_plan.md` (toLocal readers and `broadcastGlobalMatrixChange()`), `design/2026-11-07_safe_shape_render_plan.md` (a reader's error is its own), `design/2026-10-15_interactive_state_auto_registration_plan.md` (`isHovered` / `isPressed` broadcasts)
- **Target Implementation** (if built): `js/engine.js` (`pxl.broadcast()`), `js/elements/node.js` (`variableChangedCallback()`, new fields), `tests/index.html`, `.agents/KILOPIXEL.md` (Variable Change Propagation)
- **Prototypes**: `design/prototypes/2026-11-12_reactive_propagation/chains_and_diamonds.html` (long chain, stacked diamonds, half-updated values; `?lib=` compares builds), `design/prototypes/2026-11-12_reactive_propagation/ref_cycles.html` (cycles that settle, never settle, self-reference with `t`, animated chain in the wrong DOM order), `design/prototypes/2026-11-12_reactive_propagation/propagation_cost_bench.html` (today's broadcast cost in the engine, and the algorithms of §4 on plain objects)

---

## 1. Today: Recursive Broadcasts

Every change to a value that others read goes through `pxl.broadcast('ref.<id>')`: `setAttribute()`, animated values in `evaluateAnimations()`, matrix changes (`broadcastGlobalMatrixChange()`), polyline points, `isHovered` / `isPressed`, stage size and mouse values, the performance monitor. `broadcast()` calls `variableChangedCallback()` on each subscriber, which re-evaluates its reactive attributes and, if a value changed, broadcasts its own key. Propagation is recursive and depth first. The behavior has been the same since the first commit (2026-06-29).

Measured 2026-11-12 with the prototypes (engine of commit `8442d19`), and whether real pages hit it:

| Case | Expected | Today | Real pages? |
|---|---|---|---|
| Cycle that never settles (`a = b + 1`, `b = a + 1`) | stops cleanly | was a `RangeError` after about 10,000 rounds; **stops after 100 rounds with a warning since 2026-11-13** (§2) | yes, by mistake (a typo or a wrong formula) |
| Cycle that settles (`a = b`, `b = a`) | keeps its values | correct | |
| Element reading its own attribute (walkthrough section 9: `shadowcolor="ref.sec9FlyingOrb.stroke"`) | follows at once | correct, one extra round | |
| Self-reference with `t` ("follow" smoothing) | previous frame's value | correct (readers with `t` don't subscribe) | |
| Chain of 150 readers (`ch(i) = ch(i-1) + 1`) | end = 1,150 | correct; the stack limits it only after thousands of levels | no |
| 10 stacked diamonds (`l` and `r` both read `d(k-1)`, `d(k) = l + r`) | bottom evaluated once | 1,024 times: once per path | no: real pages have one or two levels, a factor of 2–4 on a few µs |
| One diamond, values its bottom computes (`g0` from 1 to 2) | 220 | 210, then 220: the first evaluation sees one new and one old input | not today: only final values are drawn |

## 2. Fix Built 2026-11-13: Count Nesting per Element

A cycle whose values keep changing enters an element again from inside that element's own broadcast, one level deeper in every round. Chains, diamonds and elements with many inputs are entered one call after the other. So `variableChangedCallback()` counts how many of its own broadcasts are still running (`_broadcastNesting`) and stops at `pxl.MAX_CYCLE_ROUNDS` (100), with one warning through `reportError()`:

- **A chain** of any length is never stopped; **an element with 150 inputs** that all change in one broadcast neither.
- **The walkthrough orb** nests once and settles, no warning.
- **A cycle of n elements** nests n × 100 calls, below the stack limit up to about 200 elements.
- **Cost:** two field writes per changed reader that has an `id`; no allocation. 10 lines in `js/engine.js` and `js/elements/node.js`.

Rejected on 2026-11-12: a nesting limit in `pxl.broadcast()` (100 levels) counted nesting over all elements, so it also cut off the chain of 150 (end 150 instead of 1,150, with a wrong warning). The per-element count measures cycles instead.

Tests in `tests/index.html` ("ref cycles: …"): a cycle that never settles stops and warns once; the orb case; a cycle that settles; the self-reference with `t`; two toLocal readers that read each other; a chain of 150 plus an element with 150 changed inputs, without a warning. A sweep of all docs and example pages, re-triggering every `<pxl-var>` (77 pages, 279 variables), showed no warning or error.

## 3. When to Build the Rest

Diamonds and half-updated values cost a little time but are not visible today. Build the full design when one of these comes:

- **`<pxl-out>`** (TODO §5) or event handlers that react to every value change: they would show or act on the 210 before the 220.
- **A real page** where a diamond's cost shows up in a measurement.

## 4. Design (for Later)

Goal: find every affected reader first, then evaluate each one **once**, sources before readers, as spreadsheets and signal libraries do. No recursion, no repeated evaluation, no half-updated values. Callers keep calling `pxl.broadcast()`.

Two ways to get the order (D1):

- **A. Per broadcast, no lasting graph (recommended):** pass 1 marks the affected readers and counts their affected inputs (an explicit stack, stamps on the elements); pass 2 evaluates a reader when all its affected inputs are done, and only if one of them changed (Kahn's algorithm on the affected part only). Readers left with inputs pending are in a cycle or behind one; they use the cycle rule. Nothing to rebuild when elements connect or disconnect.
- **B. A lasting graph:** a topological rank per element from Tarjan's algorithm (iterative: a recursive one would hit the stack on long chains), rebuilt after subscriptions change, and a heap ordered by rank per broadcast. Same cost per broadcast as A, but about 70 more lines, and a page that adds particles reading `ref.mouse` in every frame would rebuild the graph in every frame.

Common to both:

- **Nested broadcasts** (a matrix walk while propagating) only add to the running propagation; only the outermost call runs the loop.
- **Zero allocation:** stamps instead of sets, pre-allocated arrays reused for every propagation.
- **Errors:** a reader whose evaluation throws reports its own error and counts as unchanged.
- **Cycles:** members evaluated in DOM order, repeated while values change, at most `pxl.MAX_CYCLE_ROUNDS` rounds, one warning. An element that reads itself settles inside the element.
- **No fast path** for readers that nobody reads: it would save about 0.02 ms per 1,000 readers (§5), and with A it would need extra bookkeeping.

Open decisions:

- **D1 Order:** A (recommended) or B.
- **D2 Granularity:** element level as the compiler records it today (recommended), or attribute level (`ref.orb.stroke` as its own node; the compiler must record the property names).
- **D3 Batching:** one propagation per `broadcast()` call as today (recommended: `ref.*` reads right after a `setAttribute()` see the new values), or several changes in a handler as one propagation.
- **D4 toLocal:** keep `broadcastGlobalMatrixChange()` as the entry point and route its broadcasts through the work list (recommended first step), or edges from the ancestors' transforms.

## 5. Cost Review (2026-11-13)

Measured with `propagation_cost_bench.html` (Chrome, this laptop):

| Case | Today | A: per broadcast | B: heap by rank |
|---|---|---|---|
| Engine today, per reader (evaluate, compare, invalidate) | 120–180 ns | | |
| Propagation overhead per reader, fan-out to 100 or 1,000 readers | 11–19 ns | ~34 ns | ~35–40 ns |
| Chain of 150 | 2.6 µs | 4.9 µs | 4.3 µs |
| 10 stacked diamonds | 46 µs, 4,092 evaluations | ~2 µs, 30 evaluations | same |
| 14 stacked diamonds | 0.76 ms, 65,532 evaluations | ~2 µs, 42 evaluations | same |

- **Performance:** about +20 ns per reader, 15–20 % of a broadcast. 1,000 readers take 0.15–0.18 ms today and about 0.02 ms more: 0.1 % of a 16.7 ms frame. Diamonds go from exponential to linear.
- **GC:** zero per broadcast with stamps and reused arrays. B allocates on graph rebuilds unless written carefully. Found while reviewing, unrelated to this plan: `pxl.clearAllVariableSubscriptions()` allocates an `Object.keys()` copy and walks every key on every disconnect; a list of sources per element would make it a loop over its own dependencies.
- **Code:** A about 90 lines (+1 KB minified), B about 170 lines (+2.5 KB, about 5 % of the engine). Nearly all in `js/engine.js`, plus the fields and a shorter `variableChangedCallback()` in `js/elements/node.js`.

## 6. Tests (for the Full Design)

The cycle tests of §2 stay. New:

1. Ten stacked diamonds: the bottom is evaluated once per change.
2. A diamond's bottom never sees a half-updated state (only 220, never 210).
3. A chain of 10,000 readers ends at the right value (no stack limit).

## 7. Steps (When Built)

1. Agree on D1–D4.
2. Measure today's broadcast cost on the hot paths: `docs/walkthrough.html` section 9, `docs/mapping.html`, and the bench of two-phase plan §5.1.
3. Tests 1–3 failing first, then the propagation (§4); all tests pass; measure again.
4. KILOPIXEL.md "Variable Change Propagation".
