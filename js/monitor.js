// =========================================================================
// Performance Monitor
// =========================================================================

pxl.perf = {
  stages: [],
  _timeout: null,

  wakeUp: function() {
    if (pxl.perf._timeout === null) {
      pxl.perf._timeout = setTimeout(pxl.perf.publish, 1000);
    }
  },

  registerStage: function(stage) {
    if (!this.stages.includes(stage)) {
      this.stages.push(stage);
      this.wakeUp();
    }
  },

  unregisterStage: function(stage) {
    pxl.removeFromArray(this.stages, stage);
  },

  publish: function() {
    let totalFrames = 0;
    const stages = pxl.perf.stages;
    const len = stages.length;

    for (let i = 0; i < len; i++) {
      const stage = stages[i];
      let stageFPS = stage.perfFrames || 0;
      
      if (stageFPS === 1 && stage.attributeValues?.fps === 0) stageFPS = 0;

      if (stage.attributeValues) {
        stage.attributeValues.fps = stageFPS;
        stage.attributeValues.renderAvg = (stageFPS > 0 ? ((stage.perfAccumulated || 0) / stageFPS) : 0).toFixed(2);
        stage.attributeValues.renderMax = (stage.perfMax || 0).toFixed(2);
        if (stage._refKey) pxl.broadcast(stage._refKey);
      }

      totalFrames += stageFPS;
      stage.perfFrames = 0;
      stage.perfAccumulated = 0;
      stage.perfMax = 0;

      const layerLen = stage.layers.length;
      for (let j = 0; j < layerLen; j++) {
        const layer = stage.layers[j];
        if (layer.attributeValues) {
          let layerFPS = layer.perfFrames || 0;
          if (layerFPS === 1 && layer.attributeValues.fps === 0) layerFPS = 0;
          layer.attributeValues.fps = layerFPS;
          if (layer._refKey) pxl.broadcast(layer._refKey);
        }
        totalFrames += layer.perfFrames || 0;
        layer.perfFrames = 0;
      }
    }

    if (totalFrames > 0) {
      pxl.perf._timeout = setTimeout(pxl.perf.publish, 1000);
    } else {
      pxl.perf._timeout = null;
    }
  }
};
