<template>
<div class="card bg-dark border-0">
  <div class="list-group list-group-flush text-dark">
    <div
      class="list-group-item list-group-item-warning p-1 px-2
        d-flex justify-content-between align-items-center"
    >
      <span class="small font-weight-bold">{{ $t('ui.score.total') }}</span>
      <span class="badge badge-warning">{{ score?.total ?? 0 }}</span>
    </div>
    <div
      v-for="line, i in lines"
      :key="i"
      class="list-group-item list-group-item-dark p-1 px-2
        d-flex justify-content-between align-items-center small"
    >
      <span class="text-muted">{{ $t(`ui.score.${line.title}`) }}</span>
      <span class="badge badge-secondary">{{ line.value ?? 0 }}</span>
    </div>
  </div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PlayerScore',
  props: {
    score: {
      required: true,
      default: () => ({}),
    },
  },
  computed: {
    lines() {
      const s = this.score || {};
      const lines: { title: string; value: number }[] = [];
      if (s.base != null) lines.push({ title: 'base', value: s.base });
      if (s.extraPointsDistrictTypes) {
        lines.push({ title: 'extra_district_types', value: s.extraPointsDistrictTypes });
      }
      if (s.extraPointsCompleteCity) {
        lines.push({ title: 'extra_complete_city', value: s.extraPointsCompleteCity });
      }
      return lines;
    },
  },
});
</script>
