<!-- kilopixel-vue.d.ts with Vue 3 templates (vue-tsc): must compile, and every @vue-expect-error must find an error -->
<script setup lang="ts">
import { ref } from 'vue';
const r = ref(50);
const hover = ref(false);
const data = ref<[number, number][]>([[0, 0], [100, 50]]);
</script>

<template>
  <pxl-stage :ratio="5 / 3" :alwaysrender="true">
    <pxl-layer :alpha="0.8" blend="multiply">
      <pxl-circle id="sun" :x="300" :y="250" :r="r" fill="#f97316" linecap="round" :linedash="[20, 10]"
        :style="{ cursor: 'pointer' }" @click="r += 10"></pxl-circle>
      <pxl-group :x="700" :y="250" pxl-on-click="0" @pointerenter="hover = true" @pointerleave="hover = false">
        <pxl-rect :w="200" :h="80" :r="12" anchor="top-left" :fill="hover ? '#2563eb' : '#3b82f6'"></pxl-rect>
        <pxl-text :text="`Value: ${r}`" :size="27" align="center" baseline="middle"></pxl-text>
      </pxl-group>
      <pxl-polyline :points="data" stroke="#16a34a" :strokewidth="4"></pxl-polyline>
      <pxl-circle x="500 + sin(t) * 100" :y="300" :r="10"></pxl-circle>

      <!-- @vue-expect-error a radius takes no object -->
      <pxl-circle :r="{ radius: 5 }"></pxl-circle>
      <!-- @vue-expect-error points take no single number -->
      <pxl-polyline :points="5"></pxl-polyline>
    </pxl-layer>
  </pxl-stage>
</template>
