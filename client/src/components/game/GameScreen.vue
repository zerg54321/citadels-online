<template>
  <div class="container-fluid p-0 h-100 game-screen">
    <div v-if="showLobby" class="container-lg h-100 py-4">
      <LobbyScreen />
    </div>
    <div v-else-if="showBoard" class="h-100 d-flex">
      <BoardScreen />
    </div>
    <div v-else class="h-100">
      Invalid game state: {{ gameProgress }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import BoardScreen from './BoardScreen.vue';
import LobbyScreen from './LobbyScreen.vue';

export default defineComponent({
  components: { LobbyScreen, BoardScreen },
  name: 'GameScreen',
  computed: {
    ...mapGetters([
      'gameProgress',
    ]),
    showLobby() {
      return this.gameProgress === 'IN_LOBBY';
    },
    showBoard() {
      return this.gameProgress === 'IN_GAME' || this.gameProgress === 'FINISHED';
    },
  },
});
</script>

<style scoped>
.game-screen {
  min-height: 0;
}
</style>
