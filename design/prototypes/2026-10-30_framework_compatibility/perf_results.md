# Engine Performance: 0cb53ac (2026-08-31) vs. 5eda11d (2026-10-30)

Metric: CPU time of all `requestAnimationFrame` callbacks per frame (engine evaluation + canvas calls, not GPU
rasterization), via `perf_raf_timer.js` injected into page copies. Browser pane in the foreground, 1200 × 800 iframe,
1.5 s warm-up, 4 s measurement, all runs at 60 fps. Timer resolution 0.1 ms.

## Run 1: each version with its own pages (first version of `perf_run.html`, which loaded page copies per version, 3 rounds, median of round medians, ms)

| Page | Old | New | Δ |
|---|---|---|---|
| test01 | 2.3 | 2.3 | 0 % |
| test02 | 1.6 | 3.0 | +88 % (noise, see run 3) |
| test06 (1,000 animated lines) | 1.4 | 1.3 | −7 % |
| test07 | 0.7 | 0.6 | −14 % |
| test09 | 0.5 | 0.5 | 0 % |
| test37 | 1.7 | 1.7 | 0 % |
| test40 (160 polylines) | 1.4 | 1.2 | −14 % |
| benchmark (default preset) | 1.8 | 3.1 | +72 % (noise, see run 3) |

## Run 2: 8 engine builds, identical current test02 page (`bisect.html` (not kept), 2 rounds, mean ms)

0cb53ac 3.77 · 66ffa92 4.58 (rounds 4.58 / 1.92) · 3d5003b 3.92 · e4051ae 3.75 · 216cf00 3.54 · 599b4ed 3.55 · 568e08c 3.29 · 5eda11d 3.40

## Run 3: old vs. new engine, identical current pages, 6 interleaved rounds (mean ms)

| Page | Old | New | Single rounds old / new |
|---|---|---|---|
| test02 | 3.28 | 3.43 (+5 %) | 2.02–3.37 / 2.77–3.61 |
| benchmark | 2.56 | 2.04 (−20 %) | 1.85–4.90 / 1.56–4.14 |

## Reading

- No measurable change between the two engines. Differences of ±20 % on one page flip sign between runs;
  single rounds of the same build vary by up to 2×.
- Run 1's outliers (test02, benchmark) didn't reproduce with more rounds and identical pages.
- Noise sources: laptop power management, the browser pane sharing the machine with the app, 0.1 ms timer
  resolution on sub-millisecond frames. Smaller real differences (< ~20 %) can't be resolved with this setup.
