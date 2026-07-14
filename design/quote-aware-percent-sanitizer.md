# Implementation Plan: Quote-Aware CSS Percentage Sanitizer

> **Date**: 2026-07-13  
> **File**: `js/compiler.js` (lines 193-197)  
> **Risk**: Low — surgical change to one regex replacement  
> **Breaking Changes**: None — all existing code paths preserved  

---

## Problem Statement

The CSS percentage sanitizer in `compileExpression()` converts `80%,` to `'80%',` to make CSS percentages valid JavaScript. However, the regex is **not quote-aware** — it blindly matches `\d+%[,)]` even inside quoted string literals, producing broken JavaScript:

```
INPUT:   radial(0.8, ['hsla(280, 80%, 30%, 0.06)', 'transparent'])
                            ^^^     ^^^
CURRENT: radial(0.8, ['hsla(280, '80%', '30%', 0.06)', 'transparent'])
                                 ↑   ↑  ↑   ↑
                              nested quotes = SyntaxError!
```

---

## Current Implementation (lines 193-197)

```javascript
// 2. CSS PERCENTAGE SANITIZER: Safely convert illegal JS percentages to strings
let sanitizedStr = str;
if (sanitizedStr.includes('%') && sanitizedStr[0] !== '`') {
  sanitizedStr = sanitizedStr.replace(/(\d+(?:\.\d+)?)%(\s*[,)])/g, "'$1%'$2");
}
```

### What the regex does

Pattern: `/(\d+(?:\.\d+)?)%(\s*[,)])/g`
- Matches: `100%,` or `80%)` or `0.5%,` — a number followed by `%` followed by `,` or `)`
- Replacement: `'$1%'$2` — wraps the `number%` in single quotes to make it a JS string literal

### Two guards already in place

1. **`includes('%')` check** — skips entirely when no `%` present (fast path)
2. **`sanitizedStr[0] !== '`'` check** — skips backtick template literals entirely

### The handshake with scope functions

The conversion produces quoted strings like `'80%'`. The scope functions are designed to accept both:
```javascript
pxl.scope.hsl = (h, s, l) => {
  const sf = typeof s === 'number' ? s + '%' : s;  // 80 → "80%", '80%' → '80%'
  const lf = typeof l === 'number' ? l + '%' : l;
  return `hsl(${h},${sf},${lf})`;
};
```

This handshake is elegant and must be preserved.

---

## Behavior Matrix (Current vs. Proposed)

| # | Expression | Current | Proposed | Notes |
|---|-----------|---------|----------|-------|
| 1 | `hsl(200, 80%, 50%)` (direct attr, static) | ✅ Fast-path line 155 | ✅ Same | Never reaches sanitizer |
| 2 | `hsl(t*36, 80%, 50%)` (direct attr, animated) | ✅ Sanitizer wraps → scope passes through | ✅ Same | No quotes around `80%` |
| 3 | `hsla((t/5)%360, 100%, 60%, 0.5)` (modulo + percent) | ✅ Modulo safe (preceded by `)`) | ✅ Same | Critical: existing test02.html |
| 4 | `radial(0.8, ['hsla(280, 80%, 30%, 0.06)', ...])` | ❌ SyntaxError | ✅ Fixed | `%` inside quotes now skipped |
| 5 | `radial(0.8, [hsla(280, 80, 30, 0.06), ...])` | ✅ No `%` present | ✅ Same | Scope function call, no `%` |
| 6 | `` `hsl(${expr}, 80%, 50%)` `` (backtick) | ✅ Guard skips | ✅ Same | Backtick guard preserved |
| 7 | `fill="hsl(200, 80%, 50%)"` → fast-path | ✅ Line 155 regex | ✅ Same | Never compiled |
| 8 | `linear(45, ['hsl(0, 100%, 50%)', 'hsl(240, 100%, 50%)'])` | ❌ SyntaxError | ✅ Fixed | Multiple `%` in strings |
| 9 | `50 + ref.x.value % 100` (pure modulo, no percent) | ✅ Regex doesn't match (no `[,)]` after) | ✅ Same | Modulo not followed by `,/)` |

---

## Proposed Implementation

### Strategy: Segment-Based Sanitization

Instead of running the regex blindly across the entire string, split the string into **quoted** and **unquoted** segments. Only apply the `%` sanitizer to unquoted segments.

### Code

Replace lines 193-197 in `compiler.js` with:

```javascript
// 2. CSS PERCENTAGE SANITIZER: Safely convert illegal JS percentages to strings
//    QUOTE-AWARE: Only sanitizes % outside of string literals ('...' or "...")
let sanitizedStr = str;
if (sanitizedStr.includes('%') && sanitizedStr[0] !== '`') {
  const percentRegex = /(\d+(?:\.\d+)?)%(\s*[,)])/g;
  let result = '';
  let inQuote = false;
  let quoteChar = '';
  let segmentStart = 0;

  for (let i = 0; i < sanitizedStr.length; i++) {
    const ch = sanitizedStr[i];
    if (!inQuote && (ch === "'" || ch === '"')) {
      // Entering a quoted string: flush & sanitize the unquoted segment before it
      result += sanitizedStr.slice(segmentStart, i).replace(percentRegex, "'$1%'$2");
      segmentStart = i;
      inQuote = true;
      quoteChar = ch;
    } else if (inQuote && ch === quoteChar) {
      // Exiting a quoted string: flush the quoted segment AS-IS (no sanitization)
      result += sanitizedStr.slice(segmentStart, i + 1);
      segmentStart = i + 1;
      inQuote = false;
    }
  }
  // Flush the remaining segment
  if (segmentStart < sanitizedStr.length) {
    const remaining = sanitizedStr.slice(segmentStart);
    result += inQuote ? remaining : remaining.replace(percentRegex, "'$1%'$2");
  }
  sanitizedStr = result;
}
```

### How it works

1. Scans the string character by character tracking quote state
2. When entering a quote: flushes the preceding **unquoted** segment through the `%` regex
3. When exiting a quote: flushes the **quoted** segment as-is (no regex)
4. Final remaining segment: sanitized if unquoted, passed through if in an unclosed quote

### Trace through the bug case

```
Input: radial(0.8, ['hsla(280, 80%, 30%, 0.06)', 'transparent'])

Scan:
  i=0-11:  "radial(0.8, " — unquoted
  i=12 ('):  ENTER QUOTE → flush "radial(0.8, [" through regex (no % match) → "radial(0.8, ["
  i=13-40:  "'hsla(280, 80%, 30%, 0.06)'" — inside quotes
  i=41 ('):  EXIT QUOTE → flush as-is → "'hsla(280, 80%, 30%, 0.06)'"
  i=42-43:  ", " — unquoted
  i=44 ('):  ENTER QUOTE → flush ", " through regex → ", "
  i=45-56:  "'transparent'" — inside quotes
  i=57 ('):  EXIT QUOTE → flush as-is → "'transparent'"
  i=58:     "])" — unquoted
  Flush remaining: "])" through regex → "])"

Result: radial(0.8, ['hsla(280, 80%, 30%, 0.06)', 'transparent'])
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                      Preserved! No broken quotes!  ✅
```

### Trace through the existing working case

```
Input: hsla((t/5 + 0)%360, 100%, 60%, 0.6 + wave(1.5)*0.4)

Scan: No quotes found → entire string goes through regex
  "100%," → "'100%',"
  "60%,"  → "'60%',"
  "%360"  → no match (preceded by `)`, not digits in the capture group — wait actually `0)%360,` ...

  Let me be precise. The regex /(\d+(?:\.\d+)?)%(\s*[,)])/g:
  - At position of `%360`: the chars before `%` are `)`, not a digit → `\d+` fails → no match ✅
  - At position of `100%,`: `100` matches `\d+`, `%` matches, `,` matches `[,)]` → match → wrapped ✅
  - At position of `60%,`: same → wrapped ✅

Result: hsla((t/5 + 0)%360, '100%', '60%', 0.6 + wave(1.5)*0.4)  ✅
```

---

## Performance Analysis

### Overhead: Only when `%` is present

The `includes('%')` fast check ensures this code never runs for the vast majority of attributes (coordinates, sizes, booleans, hex colors, etc.).

### When it does run

The character scan is O(n) where n is string length. Typical color expressions are 30-80 characters. This runs at **compile time only** (once per attribute), not per frame. Cost is negligible.

### Compared to current

Current: one regex pass. Proposed: one character scan + regex on unquoted segments only. The overhead is the character scan, which is ~30-80 iterations. At compile time, this is unmeasurable.

---

## Files Changed

### `js/compiler.js` — Lines 193-197

**Before** (5 lines):
```javascript
// 2. CSS PERCENTAGE SANITIZER: Safely convert illegal JS percentages to strings
let sanitizedStr = str;
if (sanitizedStr.includes('%') && sanitizedStr[0] !== '`') {
  sanitizedStr = sanitizedStr.replace(/(\d+(?:\.\d+)?)%(\s*[,)])/g, "'$1%'$2");
}
```

**After** (~22 lines):
```javascript
// 2. CSS PERCENTAGE SANITIZER: Safely convert illegal JS percentages to strings
//    QUOTE-AWARE: Only sanitizes % outside of string literals ('...' or "...")
let sanitizedStr = str;
if (sanitizedStr.includes('%') && sanitizedStr[0] !== '`') {
  const percentRegex = /(\d+(?:\.\d+)?)%(\s*[,)])/g;
  let result = '';
  let inQuote = false;
  let quoteChar = '';
  let segmentStart = 0;

  for (let i = 0; i < sanitizedStr.length; i++) {
    const ch = sanitizedStr[i];
    if (!inQuote && (ch === "'" || ch === '"')) {
      result += sanitizedStr.slice(segmentStart, i).replace(percentRegex, "'$1%'$2");
      segmentStart = i;
      inQuote = true;
      quoteChar = ch;
    } else if (inQuote && ch === quoteChar) {
      result += sanitizedStr.slice(segmentStart, i + 1);
      segmentStart = i + 1;
      inQuote = false;
    }
  }
  if (segmentStart < sanitizedStr.length) {
    const remaining = sanitizedStr.slice(segmentStart);
    result += inQuote ? remaining : remaining.replace(percentRegex, "'$1%'$2");
  }
  sanitizedStr = result;
}
```

No other files need to change. The scope functions, gradient functions, fast-path checks, and backtick guard all remain untouched.

---

## Verification Plan

### 1. Automated — Build & Load Test

```bash
node build.js
```

Open these existing test files and verify no regressions:
- `test02.html` — heavy use of `hsla((t/5 + 0)%360, 100%, 60%, ...)` (modulo + percent mix)
- `test36.html` — gradient strokes on grid
- `test37.html` — the new showcase with gradient stops

### 2. Manual Test Cases

Create a quick inline test with these attribute values to confirm each case:

| Test | Attribute | Expected |
|------|-----------|----------|
| Static CSS | `fill="hsl(200, 80%, 50%)"` | Blue-ish color, no console errors |
| Animated + `%` | `fill="hsl(t * 36, 80%, 50%)"` | Cycling rainbow |
| Modulo + `%` | `fill="hsla((t/5)%360, 100%, 60%, 0.8)"` | Cycling rainbow (test02 pattern) |
| **String in array** | `fill="radial(1, ['hsla(200, 80%, 50%, 0.5)', 'transparent'])"` | Gradient, no SyntaxError |
| **Mixed** | `fill="linear(45, ['hsl(0, 100%, 50%)', 'hsl(240, 100%, 50%)'])"` | Red→Blue gradient |
| Scope call | `fill="radial(1, [hsla(200, 80, 50, 0.5), 'transparent'])"` | Same as string test |
| Backtick | `` fill="`hsl(${t * 36}, 80%, 50%)`" `` | Cycling rainbow |
| No `%` | `fill="hsl(200, 80, 50)"` | Blue-ish, scope adds `%` |
| Pure modulo | `x="t * 100 % 1000"` | Wrapping horizontal motion |

### 3. Edge Cases to Verify

- **Nested quotes**: `fill="linear(45, [\"hsl(0, 100%, 50%)\", 'blue'])"` — should handle both quote types
- **Escaped quotes**: Not supported in HTML attributes (escaped differently), so not a concern
- **Empty string in array**: `fill="linear(45, ['', 'red'])"` — no `%`, sanitizer doesn't run
- **`%` at end of expression** (no `,` or `)`): `x="t % 360"` — regex doesn't match (no `[,)]` after) ✅

---

## Post-Implementation: Update Documentation

### `.agents/framework.md`

Update the "Common Pitfalls" section. Remove the pitfall about `%` in gradient arrays (it's no longer a pitfall). Add a note that both CSS `%` syntax and scope function calls (without `%`) are valid everywhere.

### `.agents/AGENTS.md`

Update the Colors & Gradients rules to note that `%` is now safe in all contexts.

### `design/performance-analysis.md`

No change needed (this fix doesn't affect the 60fps hot loop — it's compile-time only).

---

## Rollback Plan

If the change causes unexpected regressions, revert to the original 2-line regex replacement. The only downside is the gradient-string-with-`%` case remains broken (users must use scope function calls instead).
