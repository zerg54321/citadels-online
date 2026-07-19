<template>
  <div class="board-table__self-actions">
    <div class="board-table__actions-title">{{ $t('ui.game.action_panel') }}</div>
    <div
      v-if="gameProgress === 'IN_GAME'"
      class="board-table__timer"
      :class="{ 'board-table__timer--urgent': countdownUrgent }"
    >
      {{ countdownText }}
    </div>
    <button
      v-for="(action, i) in actions"
      :key="i"
      type="button"
      class="board-table__action-btn"
      :class="{
        'board-table__action-btn--primary': isPrimaryAction(action.title),
        'board-table__action-btn--danger':
          action.title === 'finish_turn' || action.title === 'cancel',
      }"
      @click="$emit('action', action.move, $event.target)"
    >
      {{ $t(`ui.game.actions.${action.title}`, action.args) }}
    </button>
    <button
      v-if="gameProgress === 'IN_GAME'"
      type="button"
      class="board-table__action-btn"
      :disabled="autoplayBusy"
      @click="$emit('toggle-autoplay')"
    >
      {{ isAutoplay ? $t('ui.game.autoplay_cancel') : $t('ui.game.autoplay_enable') }}
    </button>
    <div class="board-table__meta">
      <div v-if="isAutoplay">{{ $t('ui.game.autoplay_on') }}</div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ActionPanel',
  props: {
    actions: {
      type: Array,
      required: true,
    },
    gameProgress: {
      type: String,
      required: true,
    },
    countdownText: {
      type: String,
      required: true,
    },
    countdownUrgent: {
      type: Boolean,
      required: true,
    },
    isAutoplay: {
      type: Boolean,
      required: true,
    },
    autoplayBusy: {
      type: Boolean,
      required: true,
    },
  },
  methods: {
    isPrimaryAction(title: string) {
      return ['take_gold', 'draw_cards', 'draw_cards_3', 'build_district', 'confirm', 'accept']
        .includes(title);
    },
  },
});
</script>
