<template>
  <div v-if="gameProgress === 'IN_GAME'" class="board-table__turn-order">
    <span class="board-table__turn-label">{{ $t('ui.game.turn_order') }}</span>
    <span
      v-for="ch in turnOrderChips"
      :key="ch.id + '-' + ch.idx"
      class="board-table__char-chip"
      :class="[
        `board-table__char-chip--c${ch.id || 0}`,
        {
          'board-table__char-chip--current': ch.current,
          'board-table__char-chip--killed': ch.killed,
          'board-table__char-chip--face-up': ch.faceUp,
        },
      ]"
      :title="ch.tip"
    >{{ ch.id || '?' }}</span>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { GameProgress } from 'citadels-common';

export default defineComponent({
  name: 'TurnOrderBar',
  props: {
    turnOrderChips: {
      type: Array,
      required: true,
    },
    gameProgress: {
      type: String,
      required: true,
    },
  },
});
</script>
