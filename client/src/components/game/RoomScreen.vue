<template>
<div class="h-100 d-flex room-screen">
  <transition name="fade" mode="out-in">
    <RoomEntryScreen v-if="!isInRoom" />
    <GameScreen v-else />
  </transition>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import GameScreen from './GameScreen.vue';
import RoomEntryScreen from './RoomEntryScreen.vue';
import { store } from '../../store';

export default defineComponent({
  components: { RoomEntryScreen, GameScreen },
  name: 'RoomScreen',
  computed: {
    ...mapGetters([
      'isInRoom',
    ]),
  },
  unmounted() {
    store.commit('resetGameState');
  },
});
</script>

<style scoped>
.room-screen {
  min-height: 0;
  width: 100%;
}
.room-screen :deep(.board-table) {
  flex: 1 1 auto;
  width: 100%;
}
</style>
