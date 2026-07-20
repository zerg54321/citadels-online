<template>
  <div class="w-100 card bg-secondary shadow-sm" style="min-width: 9em;">
    <div class="p-1 text-light d-flex flex-column">
      <div class="bg-dark p-1 flex-fill rounded d-flex flex-column">
        <h5>
          <span
            class="badge w-100"
            :class="{
              'bg-primary': isCurrentPlayer && !teamClass,
              'bg-info': !isCurrentPlayer && teamClass === 'A',
              'bg-danger': !isCurrentPlayer && teamClass === 'B',
              'bg-primary border border-light': isCurrentPlayer && teamClass === 'A',
              'bg-danger border border-light': isCurrentPlayer && teamClass === 'B',
            }"
          >
            {{ username }}
            <span v-if="teamClass" class="small">({{ teamClass }})</span>
          </span>
        </h5>
        <p class="text-center">
          <span v-if="board.crown" class="badge badge-pill badge-danger p-2 mr-2">
            <emoji emoji="👑"></emoji>
          </span>
          <span class="badge badge-pill badge-secondary p-2 mr-2">
            {{ board.stash }} <emoji emoji="🪙"></emoji>
          </span>
          <span
            class="badge badge-pill p-2"
            :class="{
              'badge-secondary': !exchangeHandMode,
              'badge-primary cursor-pointer': exchangeHandMode,
            }"
            @click="exchangeHand()"
             :title="exchangeHandMode ? $t('ui.game.actions.choose_hand') : ''"
          >{{ board.hand.length }} <emoji emoji="🃏"></emoji></span>
          <span class="badge badge-pill badge-warning p-2 ml-2" title="实时总分">
            {{ board.score?.total ?? 0 }} 分
          </span>
        </p>
        <CharactersList v-if="gameProgress === 'IN_GAME'" :characters="board.characters" />
        <!-- killed/robbed badge even if character chip still resolving -->
        <div
          v-if="playerKillRobLabel"
          class="text-center small mt-1"
        >
          <span
            v-if="playerKillRobLabel.killed"
            class="badge badge-danger"
          >💀 {{ playerKillRobLabel.name }}</span>
          <span
            v-else-if="playerKillRobLabel.robbed"
            class="badge badge-warning text-dark"
          >💰 {{ playerKillRobLabel.name }}</span>
        </div>
      </div>
    </div>
    <div class="p-2 bg-secondary d-flex justify-content-center flex-wrap overflow-auto gap-2">
      <DistrictCard
        v-for="id, i in board.city"
        :key="i"
        :district-id="id"
        @click="chooseCardDestroy(id)"
        :disabled="destroyMode && !canDestroy(id)"
        :selectable="canDestroy(id)"
        small
      />
    </div>
    <div class="flex-fill"></div>
    <PlayerScore :score="board.score" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import {
  Move, MoveType, DistrictId, TeamId, PlayerBoard,
} from 'citadels-common';
import { store } from '../../../store';
import CharactersList from './CharactersList.vue';
import DistrictCard from './DistrictCard.vue';
import PlayerScore from './PlayerScore.vue';

type BoardWithCrown = PlayerBoard & { crown: boolean };

export default defineComponent({
  name: 'PlayerCity',
  components: {
    DistrictCard,
    CharactersList,
    PlayerScore,
  },
  props: {
    playerId: {
      type: String,
      required: true,
    },
    board: {
      type: Object as () => BoardWithCrown,
      required: true,
    },
    destroyMode: {
      type: Boolean,
      default: false,
    },
    exchangeHandMode: {
      type: Boolean,
      default: false,
    },
    stash: {
      type: Number,
      default: 0,
    },
  },
  computed: {
    ...mapGetters([
      'getPlayerFromId',
      'gameProgress',
      'currentPlayerId',
    ]),
    username() {
      return this.getPlayerFromId(this.playerId)?.username;
    },
    isCurrentPlayer() {
      return this.currentPlayerId === this.playerId;
    },
    teamClass() {
      const team = this.getPlayerFromId(this.playerId)?.team;
      if (team === TeamId.A) return 'A';
      if (team === TeamId.B) return 'B';
      return '';
    },
    /** show kill/rob as soon as assassin/thief acts (not only when that role's turn arrives) */
    playerKillRobLabel() {
      const chars = this.board?.characters || [];
      const hit = chars.find((c: any) => c.killed || c.robbed);
      if (!hit || !hit.id) return null;
      return {
        killed: Boolean(hit.killed),
        robbed: Boolean(hit.robbed),
        name: this.$t(`characters.${hit.id}.name`),
      };
    },
  },
  methods: {
    canDestroy(name: DistrictId): boolean {
      if (!this.destroyMode) return false;
      const cost = store.getters.getDistrictDestroyPrice(this.playerId, name);
      return cost >= 0 && cost <= this.stash;
    },
    async chooseCardDestroy(name: DistrictId) {
      if (!this.canDestroy(name)) return;
      const myTeam = store.getters.getPlayerFromId(store.state.gameState?.self)?.team;
      const theirTeam = store.getters.getPlayerFromId(this.playerId)?.team;
      if (myTeam != null && theirTeam != null && myTeam === theirTeam) {
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
