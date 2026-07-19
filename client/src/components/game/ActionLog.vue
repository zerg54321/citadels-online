<template>
  <div class="board-table__slot board-table__slot--log">
    <div class="board-table__log">
      <div class="board-table__log-title">{{ $t('ui.game.action_log') }}</div>
      <div class="board-table__log-list" ref="actionLogList">
        <div
          v-for="(line, i) in displayActionFeed"
          :key="i"
          class="board-table__log-item"
          :class="{
            'board-table__log-item--warn': line.kind === 'rob' || line.kind === 'warn',
            'board-table__log-item--kill': line.kind === 'kill',
          }"
        >
          {{ line.text }}
        </div>
        <div v-if="!displayActionFeed.length" class="board-table__log-item opacity-50">
          {{ $t('ui.game.action_log_empty') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ActionLog',
  props: {
    displayActionFeed: {
      type: Array,
      required: true,
    },
  },
  watch: {
    displayActionFeed: {
      deep: true,
      handler(list: any[]) {
        if (!Array.isArray(list) || !list.length) return;
        const last = list[list.length - 1];
        if (last?.kind === 'kill' || last?.kind === 'rob') {
          this.$emit('show-event', last.text);
        }
        this.$nextTick(() => {
          const el = this.$refs.actionLogList as HTMLElement | undefined;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
    },
  },
});
</script>
