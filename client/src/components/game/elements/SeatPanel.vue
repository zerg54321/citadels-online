<template>
  <div
    class="seat-panel"
    :class="{
      'seat-panel--ally': relation === 'ally' || relation === 'self',
      'seat-panel--enemy': relation === 'enemy',
      'seat-panel--active': isCurrentPlayer,
      'seat-panel--acting': isActingNow,
    }"
  >
    <div class="seat-panel__main">
      <div class="seat-panel__banner">
        <span
          class="seat-panel__pick-no"
          v-tooltip="$t('ui.game.pick_order_tip')"
        >{{ pickOrder }}</span>
        <span class="text-truncate flex-fill seat-panel__name">{{ username }}</span>
        <span
          v-if="board.crown"
          class="seat-panel__crown"
          :title="$t('ui.game.crown_holder')"
        >👑</span>
        <span v-if="relation === 'self'" class="seat-panel__tag">{{ $t('ui.lobby.you') }}</span>
        <span v-else-if="relation === 'ally'" class="seat-panel__tag">{{ $t('ui.team.ally') }}</span>
        <span v-else-if="relation === 'enemy'" class="seat-panel__tag">{{ $t('ui.team.enemy_short') }}</span>
      </div>

      <div class="seat-panel__stats">
        <div class="seat-panel__stat" :title="$t('ui.game.stat_gold')">
          <span class="seat-panel__stat-icon">🪙</span>
          <span class="seat-panel__stat-val">{{ board.stash ?? 0 }}</span>
        </div>
        <div
          class="seat-panel__stat"
          :class="{ 'seat-panel__stat--click': exchangeHandMode }"
          :title="$t('ui.game.stat_hand')"
          @click="exchangeHand"
        >
          <span class="seat-panel__stat-icon">🃏</span>
          <span class="seat-panel__stat-val">{{ (board.hand || []).length }}</span>
        </div>
        <div class="seat-panel__stat seat-panel__stat--score" :title="$t('ui.game.stat_score')">
          <span class="seat-panel__stat-icon">⭐</span>
          <span class="seat-panel__stat-val">{{ board.score?.total ?? 0 }}</span>
        </div>
        <div class="seat-panel__stat" :title="$t('ui.game.stat_city')">
          <span class="seat-panel__stat-icon">🏛</span>
          <span class="seat-panel__stat-val">{{ (board.city || []).length }}</span>
        </div>
      </div>

      <div class="seat-panel__body">
        <div class="seat-panel__city">
          <DistrictCard
            v-for="(id, i) in (board.city || [])"
            :key="i"
            :district-id="id"
            small
            :disabled="destroyMode && !canDestroy(id)"
            :selectable="canDestroy(id)"
            @click="chooseCardDestroy(id)"
          />
          <div v-if="!(board.city || []).length" class="seat-panel__city-empty">
            {{ $t('ui.game.no_buildings') }}
          </div>
        </div>
        <div class="seat-panel__role">
          <CharacterCard
            v-if="gameProgress === 'IN_GAME' && roleCard.show"
            :character-id="roleCard.id"
            :face-down="roleCard.faceDown"
            :killed="roleCard.killed"
            :robbed="roleCard.robbed"
            size="medium"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import {
  DistrictId, Move, MoveType,
} from 'citadels-common';
import { store } from '../../../store';
import DistrictCard from './DistrictCard.vue';
import CharacterCard from './CharacterCard.vue';

export default defineComponent({
  name: 'SeatPanel',
  components: {
    DistrictCard,
    CharacterCard,
  },
  props: {
    playerId: { type: String, required: true },
    board: { required: true },
    /** 1-based pick order this round (crown starts at 1) */
    pickOrder: { type: Number, default: 1 },
    destroyMode: { type: Boolean, default: false },
    exchangeHandMode: { type: Boolean, default: false },
    stash: { type: Number, default: 0 },
    relation: { type: String, default: 'enemy' },
  },
  computed: {
    ...mapGetters([
      'getPlayerFromId',
      'gameProgress',
      'currentPlayerId',
    ]),
    username() {
      return this.getPlayerFromId(this.playerId)?.username || this.playerId;
    },
    isCurrentPlayer() {
      return this.currentPlayerId === this.playerId;
    },
    /** true when this seat holds the currently called character */
    isActingNow() {
      return this.isCurrentPlayer && this.gameProgress === 'IN_GAME';
    },
    roleCard() {
      const chars = this.board?.characters || [];
      if (!chars.length) {
        return { show: false, id: 0, faceDown: true, killed: false, robbed: false };
      }
      const revealed = chars.find((c: any) => c.id > 0 && !c.faceDown);
      if (revealed) {
        return {
          show: true,
          id: revealed.id,
          faceDown: false,
          killed: Boolean(revealed.killed),
          robbed: Boolean(revealed.robbed),
        };
      }
      return {
        show: true,
        id: 0,
        faceDown: true,
        killed: false,
        robbed: false,
      };
    },
  },
  methods: {
    isAllyTarget(): boolean {
      return this.relation === 'ally' || this.relation === 'self';
    },
    canDestroy(name: DistrictId): boolean {
      if (!this.destroyMode) return false;
      const cost = store.getters.getDistrictDestroyPrice(this.playerId, name);
      return cost >= 0 && cost <= this.stash;
    },
    async chooseCardDestroy(name: DistrictId) {
      if (!this.canDestroy(name)) return;
      if (this.isAllyTarget()) {
        const ok = window.confirm(
          this.$t('ui.game.warn_destroy_ally', { name: this.username }) as string,
        );
        if (!ok) return;
      }
      try {
        const move: Move = {
          type: MoveType.WARLORD_DESTROY_DISTRICT,
          data: {
            player: store.getters.getPlayerPosition(this.playerId),
            card: name,
          },
        };
        await store.dispatch('sendMove', move);
      } catch (error) {
        console.log('error when sending move', error);
      }
    },
    async exchangeHand() {
      if (!this.exchangeHandMode) return;
      try {
        const move: Move = {
          type: MoveType.MAGICIAN_EXCHANGE_HAND,
          data: store.getters.getPlayerPosition(this.playerId),
        };
        await store.dispatch('sendMove', move);
      } catch (error) {
        console.log('error when sending move', error);
      }
    },
  },
});
</script>
