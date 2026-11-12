// Injected by perf_run.html as the first script of every page it measures.
// Wraps requestAnimationFrame and sums the CPU time of all callbacks that run in the same frame
// (same rAF timestamp): engine evaluation plus canvas calls, not GPU rasterization.
(function() {
  const perf = window.__perf = { recording: false, frames: [] };
  const nativeRaf = window.requestAnimationFrame.bind(window);
  let currentStamp = -1;
  let currentSum = 0;

  function flush() {
    if (currentStamp >= 0 && perf.recording) perf.frames.push(currentSum);
    currentSum = 0;
  }

  window.requestAnimationFrame = function(callback) {
    return nativeRaf(function(stamp) {
      if (stamp !== currentStamp) {
        flush();
        currentStamp = stamp;
      }
      const t0 = performance.now();
      try {
        callback(stamp);
      } finally {
        currentSum += performance.now() - t0;
      }
    });
  };

  perf.start = function() { perf.frames = []; perf.recording = true; };
  perf.stop = function() { flush(); perf.recording = false; return perf.frames.slice(); };
})();
