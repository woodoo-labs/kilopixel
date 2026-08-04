# 2026-08-04: Unified Responsive Filters & Scope Helpers Plan

**Date:** 2026-08-04  
**Status:** Architectural Specification & Implementation Plan  

---

## 1. Goal Description
Create a unified, responsive Filter API in Kilopixel that mirrors our Gradient (`linear`, `radial`) architecture.
1. Replace messy CSS string concatenation and backticks with clean JavaScript function calls in `pxl.scope` (e.g., `blur(5)`, `dropShadow(10, 10, 5, 'rgba(0,0,0,0.5)')`).
2. Automatically scale spatial filter values (`blur`, `drop-shadow`) by the responsive unit `u` at draw time with zero Garbage Collection (GC) overhead at 60 FPS.
3. Support both single filters (`filter="blur(5)"`) and chained filters via JS arrays (`filter="[blur(5), contrast(150)]"`).

---

## 2. User Review Required

> [!IMPORTANT]
> **Unified Syntax & UX Rules**
> 1. **One Unified Syntax**: Whether static or animated, filters use `pxl.scope` function calls (`blur(5)`, `dropShadow(...)`, `contrast(150)`).
> 2. **Chaining via Arrays**: To combine multiple filters, pass an Array of filter expressions: `filter="[blur(5), contrast(150)]"`.
> 3. **Color Quotes Rule**: Inside JavaScript expressions, hex colors require single quotes (`'#ff007f'`), while standard color keyword names (`black`, `white`, `red`, `transparent`, etc.) are available as unquoted constants in `pxl.scope`.
> 4. **Responsive Bare Numbers**: Spatial lengths inside `blur(...)` and `dropShadow(...)` use bare logical numbers (`1000` = full stage width), which Kilopixel automatically multiplies by `u` at draw time.

---

## 3. Side-by-Side Architectural Comparison: Gradients vs Filters

| Feature | Gradients (`linear`, `radial`) | Filters (`blur`, `dropShadow`, `contrast`, etc.) |
| :--- | :--- | :--- |
| **Called via `pxl.scope`** | `linear(angle, [...])`<br>`radial(radius, [...])` | `blur(radius)`<br>`dropShadow(x, y, blur, color)` |
| **Units in Syntax** | Dimensionless numbers / angles | Bare logical numbers (`1000` = full screen) |
| **Physical DPI Scaling (`u`)** | Scaled automatically inside `createGradient` | Scaled automatically inside `applyContextState` |
| **JS Expression / Commas** | Works natively (`t * 90, [...]`) | Works natively (`10 * t, 15, 5, 'red'`) |
| **Chaining Multiple Items** | Array of color stops `['#ff007f', '#00e5ff']` | Array of filters `[blur(5), contrast(150)]` |
| **Template Backticks Needed?** | **No** ❌ | **No** ❌ |

---

## 4. Proposed Changes (File-by-File Detailed Specification)

### 1. [MODIFY] `js/compiler.js`
Add color keyword constants and Filter helper functions to `pxl.scope`:
* **Add CSS Color Keyword Constants**:
  ```javascript
  const colorKeywords = [
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
    'orange', 'purple', 'pink', 'gray', 'grey', 'transparent'
  ];
  for (const color of colorKeywords) {
    pxl.scope[color] = color;
  }
  ```
* **Add Filter Helpers to `pxl.scope`**:
  ```javascript
  pxl.scope.blur       = (radius) => `blur(${radius})`;
  pxl.scope.dropShadow = (x, y, blur, color) => `drop-shadow(${x} ${y} ${blur || 0} ${color || ''})`;
  pxl.scope.brightness = (val) => `brightness(${val}%)`;
  pxl.scope.contrast   = (val) => `contrast(${val}%)`;
  pxl.scope.hueRotate  = (deg) => `hue-rotate(${deg}deg)`;
  pxl.scope.invert     = (val) => `invert(${val}%)`;
  pxl.scope.saturate   = (val) => `saturate(${val}%)`;
  ```

---

### 2. [MODIFY] `js/graphics.js`
Implement zero-GC responsive filter scaling inside context state application:
* **Add `pxl.scaleResponsiveFilter(filterStr, u)` Helper**:
  ```javascript
  pxl.scaleResponsiveFilter = function(filterStr, u) {
    if (!filterStr || filterStr === 'none') return 'none';
    if (u === 1) return filterStr; // Fast path when u == 1

    return filterStr.replace(/(blur|drop-shadow)\(([^)]+)\)/g, (match, fnName, args) => {
      const scaledArgs = args.replace(/(-?\d*\.?\d+)(px|u)?/g, (m, val) => {
        return (parseFloat(val) * u) + 'px';
      });
      return `${fnName}(${scaledArgs})`;
    });
  };
  ```
* **Update `pxl.applyContextState(ctx, u, attributeValues)`**:
  ```javascript
  const filterVal = Array.isArray(attributeValues.filter)
    ? attributeValues.filter.join(' ')
    : attributeValues.filter;

  if (filterVal && filterVal !== 'none') {
    // Zero-GC caching per target node / u pair
    ctx.filter = pxl.scaleResponsiveFilter(filterVal, u);
  }
  ```

---

### 3. [MODIFY] `.agents/KILOPIXEL.md`
Update official documentation to describe the Unified Responsive Filter API:
* Under **Section 5: Attribute Expression Syntax**, add documentation for `pxl.scope` filter helpers (`blur`, `dropShadow`, `brightness`, `contrast`, `hueRotate`, `invert`, `saturate`) and color keyword constants (`black`, `white`, `red`, etc.).
* Explain that `blur(...)` and `dropShadow(...)` use logical Kilopixel units (`1000` = stage width) and are automatically scaled by `u` at draw time.
* Add examples of chaining multiple filters using Array syntax: `filter="[blur(5), contrast(150)]"`.

---

## 5. Verification Plan

### Automated Tests
* Run `node build.js` to verify syntax and bundling of `js/compiler.js` and `js/graphics.js`.

### Manual Verification
* Create `examples/test_responsive_filters.html`:
  1. Test a static `<pxl-layer filter="blur(8)">` and verify it scales proportionally when resizing the browser window.
  2. Test an animated orbiting drop shadow `<pxl-layer filter="dropShadow(cos(t * 90) * 20, sin(t * 90) * 20, 10, 'rgba(0, 0, 0, 0.5)')">`.
  3. Test a chained filter array `<pxl-layer filter="[dropShadow(10, 10, 5, black), blur(5 + wave(2) * 10), contrast(150)]">` and verify execution order and animation smoothness at 60 FPS.
