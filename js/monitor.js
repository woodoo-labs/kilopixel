// =========================================================================
// Performance Monitor
// =========================================================================

// Publishes fps, renderAvg and renderMax of every stage once per second (ref.<stageId>.*).
// Its own timer, not the frame loop: an idle page publishes 0 instead of keeping the last values.
pxl.perf = {
  stages: [],
  _timer: 0,
  _lastPublish: 0,

  registerStage: function(stage) {
    if (!pxl.perf.stages.includes(stage)) pxl.perf.stages.push(stage);
    if (!pxl.perf._timer) {
      pxl.perf._lastPublish = performance.now();
      pxl.perf._timer = setInterval(pxl.perf.publish, 1000);
    }
  },

  unregisterStage: function(stage) {
    pxl.removeFromArray(pxl.perf.stages, stage);
    if (pxl.perf.stages.length === 0 && pxl.perf._timer) {
      clearInterval(pxl.perf._timer);
      pxl.perf._timer = 0;
    }
  },

  publish: function() {
    // Divided by the real interval: timers in background tabs or after a long frame fire late
    const now = performance.now();
    const seconds = (now - pxl.perf._lastPublish) / 1000;
    pxl.perf._lastPublish = now;

    for (let i = 0; i < pxl.perf.stages.length; i++) {
      const stage = pxl.perf.stages[i];
      const values = stage.attributeValues;
      const frames = stage.perfFrames;
      values.fps = seconds > 0 ? Math.round(frames / seconds) : 0;
      values.renderAvg = (frames > 0 ? stage.perfAccumulated / frames : 0).toFixed(2);
      values.renderMax = stage.perfMax.toFixed(2);
      if (stage.refKey) pxl.broadcast(stage.refKey);

      // Reset counters for the next interval
      stage.perfFrames = 0;
      stage.perfAccumulated = 0;
      stage.perfMax = 0;
    }
  }
};
