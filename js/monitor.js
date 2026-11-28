// =========================================================================
// Performance Monitor
// =========================================================================

// The timer that publishes fps, renderAvg and renderMax of every stage once per second (Stage.publishMetrics()).
// Its own timer, not the frame loop: an idle page publishes 0 instead of keeping the last values. Runs while any stage
// is connected (pxl.stages, stage.js).
pxl.perf = {
  _timer: 0,
  _lastPublish: 0,

  // On every stage connect; starts the timer for the first one
  start: function() {
    if (pxl.perf._timer) return;
    pxl.perf._lastPublish = performance.now();
    pxl.perf._timer = setInterval(pxl.perf.publish, 1000);
  },

  // After the last stage left
  stop: function() {
    if (!pxl.perf._timer) return;
    clearInterval(pxl.perf._timer);
    pxl.perf._timer = 0;
  },

  publish: function() {
    // Divided by the real interval: timers in background tabs or after a long frame fire late
    const now = performance.now();
    const seconds = (now - pxl.perf._lastPublish) / 1000;
    pxl.perf._lastPublish = now;
    for (let i = 0; i < pxl.stages.length; i++) pxl.stages[i].publishMetrics(seconds);
  }
};
