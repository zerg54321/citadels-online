<template>
  <div class="h-100 d-flex room-screen">
    <transition name="fade" mode="out-in">
      <RoomEntryScreen v-if="!isInRoom" />
      <GameScreen v-else />
    </transition>

    <div
      v-if="showLeaveModal"
      class="modal fade show d-block"
      style="background:rgba(0,0,0,0.65); z-index: 1050;"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content lobby-modal">
          <div class="modal-header border-0 pb-2">
            <h5 class="modal-title text-gold lobby-modal-title">
              {{ $t('ui.lobby.leave_room_confirm_title') }}
            </h5>
          </div>
          <div class="modal-body">
            <p class="text-parchment mb-0">
              {{ $t('ui.lobby.leave_room_confirm_body') }}
            </p>
          </div>
          <div class="modal-footer border-0">
            <button
              type="button"
              class="btn btn-outline-gold"
              @click="cancelLeave"
            >
              {{ $t('ui.cancel') }}
            </button>
            <button
              type="button"
              class="btn btn-gold"
              @click="confirmLeave"
              :disabled="leaving"
            >
              {{ $t('ui.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  data() {
    return {
      leaving: false,
      pendingTarget: null as string | null,
      showLeaveModal: false,
    };
  },
  computed: {
    ...mapGetters([
      'isInRoom',
    ]),
  },
  beforeRouteLeave(to, from, next) {
    if (!this.isInRoom) {
      next();
      return;
    }
    next(false);
    this.pendingTarget = to.fullPath || '/';
    this.showLeaveModal = true;
  },
  unmounted() {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  },
  mounted() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  },
  methods: {
    onBeforeUnload(event: BeforeUnloadEvent) {
      if (!this.isInRoom) return;
      event.preventDefault();
      event.returnValue = '';
    },
    cancelLeave() {
      this.pendingTarget = null;
      this.showLeaveModal = false;
    },
    async confirmLeave() {
      this.leaving = true;
      try {
        await store.dispatch('leaveRoomSilent');
      } catch (e) {
        console.error('leave room failed', e);
      }
      const target = this.pendingTarget;
      this.pendingTarget = null;
      this.showLeaveModal = false;
      this.leaving = false;
      store.commit('resetGameState');
      if (target) {
        this.$router.replace(target).catch(() => {
          window.location.href = target;
        });
      }
    },
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
