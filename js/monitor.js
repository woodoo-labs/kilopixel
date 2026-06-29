// =========================================================================
// Performance Monitor
// =========================================================================

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
    const len = this.stages.length;
    for (let i = 0; i < len; i++) {
      const stage = this.stages[i];
      
      if (stage.attributeValues) {
        stage.attributeValues.fps = stage.perfFrames;
        stage.attributeValues.renderAvg = (stage.perfFrames > 0 ? (stage.perfAccumulated / stage.perfFrames) : 0).toFixed(2);
        stage.attributeValues.renderMax = stage.perfMax.toFixed(2);
        if (stage._refKey) pxl.broadcast(stage._refKey);
      }

      // Reset counters for the next interval
      stage.perfFrames = 0;
      stage.perfAccumulated = 0;
      stage.perfMax = 0;
    }
  }
};
