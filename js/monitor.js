// =========================================================================
// Performance Monitor
// =========================================================================

// Publishes fps, renderAvg and renderMax of every stage once per second (ref.<stageId>.*)
pxl.perf = {
  stages: [],
  lastUpdate: 0,

  registerStage: function(stage) {
    if (!this.stages.includes(stage)) this.stages.push(stage);
  },

  unregisterStage: function(stage) {
    pxl.removeFromArray(this.stages, stage);
  },

  publish: function() {
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      const values = stage.attributeValues;
      values.fps = stage.perfFrames;
      values.renderAvg = (stage.perfFrames > 0 ? stage.perfAccumulated / stage.perfFrames : 0).toFixed(2);
      values.renderMax = stage.perfMax.toFixed(2);
      if (stage.refKey) pxl.broadcast(stage.refKey);

      // Reset counters for the next interval
      stage.perfFrames = 0;
      stage.perfAccumulated = 0;
      stage.perfMax = 0;
    }
  }
};
