<template>
  <div class="board-table">
    <div class="board-table__bg" />

    <!-- Top: team scores + turn order -->
    <div class="board-table__top">
      <div v-if="showTeamScores" class="board-table__score-bar">
        <span class="board-table__team-a">
          {{ isSpectator ? $t('ui.team.a') : $t('ui.team.mine') }}
          {{ liveTeamScores.A }}
        </span>
        <span class="opacity-50">VS</span>
        <span class="board-table__team-b">
          {{ isSpectator ? $t('ui.team.b') : $t('ui.team.enemy') }}
          {{ liveTeamScores.B }}
        </span>
      </div>
      <TurnOrderBar
        :turn-order-chips="turnOrderChips"
        :game-progress="gameProgress"
      />
      <button type="button" class="board-table__leave-btn" @click="leaveRoom">
        {{ $t('ui.score.leave_room') }}
      </button>
    </div>

    <div class="board-table__stage" :class="{ 'board-table__stage--spectate': isSpectator }">
      <!-- Seats: player = 5 opponents + self bottom; spectator = 6 seats L3+R3 -->
      <div
        v-for="slot in tableSlots"
        :key="slot.playerId"
        class="board-table__slot"
        :class="`board-table__slot--${slot.pos}`"
      >
        <SeatPanel
          :player-id="slot.playerId"
          :board="slot.board"
          :pick-order="slot.pickOrder"
          :destroy-mode="destroyMode"
          :exchange-hand-mode="exchangeHandMode"
          :stash="selfBoard.stash"
          :relation="slot.relation"
        />
      </div>

      <!-- Center: character selection / status / draft -->
      <CenterPanel
        :game-progress="gameProgress"
        :characters-list="charactersList"
        :board="gameState.board"
        :kill-mode="killMode"
        :rob-mode="robMode"
        :choose-character-mode="chooseCharacterMode"
        :event-banner="eventBanner"
        @select-character="onCenterCharacterClick"
      />

      <!-- Self strip: only when seated player (not spectator) -->
      <div v-if="!isSpectator" class="board-table__slot board-table__slot--self">
        <div class="board-table__self-wrap">
          <div class="board-table__self-panel">
            <div class="board-table__self-banner">
              <span class="board-table__self-pick">{{ selfPickOrder }}</span>
              <span class="text-truncate flex-fill">{{ selfName }}</span>
              <span class="board-table__self-vp">
                ⭐ {{ selfBoard.score?.total ?? 0 }}
              </span>
              <span
                v-if="selfBoard.crown"
                class="seat-panel__crown"
                :title="$t('ui.game.crown_holder')"
              >👑</span>
              <span class="seat-panel__tag">{{ $t('ui.lobby.you') }}</span>
            </div>
            <div class="board-table__self-body">
              <div class="board-table__self-city">
                <DistrictCard
                  v-for="(id, i) in selfBoard.city"
                  :key="'city-' + i"
                  :district-id="id"
                  small
                />
                <div v-if="!(selfBoard.city || []).length" class="seat-panel__city-empty">
                  {{ $t('ui.game.no_buildings') }}
                </div>
              </div>
              <div class="board-table__self-role">
                <CharacterCard
                  v-if="gameProgress === 'IN_GAME' && selfRoleCard.show"
                  :character-id="selfRoleCard.id"
                  :face-down="selfRoleCard.faceDown"
                  :killed="selfRoleCard.killed"
                  :robbed="selfRoleCard.robbed"
                  size="medium"
                />
              </div>
            </div>
            <div class="board-table__self-hand">
              <PlayerHand
                :board="selfBoard"
                :build-mode="buildMode"
                :discard-cards-mode="discardCardsMode"
                :laboratory-mode="laboratoryMode"
              />
            </div>
          </div>
        </div>

        <ActionPanel
          :actions="statusBar.actions"
          :game-progress="gameProgress"
          :countdown-text="countdownText"
          :countdown-urgent="countdownUrgent"
          :is-autoplay="selfIsAutoplay"
          :autoplay-busy="autoplayBusy"
          @action="sendMove"
          @toggle-autoplay="toggleAutoplay"
        />
      </div>

      <!-- Far right: action log (server feed) -->
      <ActionLog
        :display-action-feed="displayActionFeed"
        @show-event="showEvent"
      />
    </div>

    <!-- End game: dismissible result; stay on board until leave -->
    <EndGameModal
      :show="gameProgress === 'FINISHED' && showEndModal"
      :game-state="gameState"
      :self-id="self"
      :is-spectator="isSpectator"
      :show-team-scores="showTeamScores"
      :get-player-from-id="getPlayerFromId"
      @close="dismissEndModal"
      @leave="backToLobby"
    />

    <!-- floating reopen + leave when modal dismissed -->
    <div
      v-if="gameProgress === 'FINISHED' && !showEndModal"
      class="board-table__end-bar"
    >
      <button type="button" class="btn btn-sm btn-warning mr-2" @click="showEndModal = true">
        {{ $t('ui.score.show_result') }}
      </button>
      <button type="button" class="btn btn-sm btn-outline-light" @click="backToLobby">
        {{ $t('ui.score.leave_room') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import {
  CharacterChoosingStateType as CCST,
  ClientTurnState,
  GameMode,
  MatchResult,
  Move,
  MoveType,
  PlayerRole,
  TeamId,
} from 'citadels-common';
import { store } from '../../store';
import SeatPanel from './elements/SeatPanel.vue';
import PlayerHand from './elements/PlayerHand.vue';
import DistrictCard from './elements/DistrictCard.vue';
import CharacterCard from './elements/CharacterCard.vue';
import { getStatusBarData } from '../../data/statusBarData';
import TurnOrderBar from './TurnOrderBar.vue';
import ActionLog from './ActionLog.vue';
import ActionPanel from './ActionPanel.vue';
import CenterPanel from './CenterPanel.vue';
import EndGameModal from './EndGameModal.vue';

export default defineComponent({
  components: {
    SeatPanel,
    PlayerHand,
    DistrictCard,
    CharacterCard,
    TurnOrderBar,
    ActionLog,
    ActionPanel,
    CenterPanel,
    EndGameModal,
  },
  name: 'BoardScreen',
  data() {
    return {
      startingGame: false,
      nowMs: Date.now(),
      countdownTimer: 0 as any,
      autoplayBusy: false,
      eventBanner: '',
      eventBannerTimer: 0 as any,
      lastKilledId: 0,
      lastRobbedId: 0,
      lastCurrentChar: 0,
      lastStatusKey: '',
      actionLog: [] as { text: string; kind?: string }[],
      /** end-game result dialog; can dismiss without leaving room */
      showEndModal: true,
      showSetupConfirm: false,
    };
  },
  computed: {
    ...mapGetters([
      'getPlayerFromId',
      'gameSetupData',
      'gameState',
      'charactersList',
      'isCurrentPlayerSelf',
      'gameProgress',
    ]),
    self() {
      return this.gameState.self;
    },
    selfIsAutoplay() {
      const me = this.getPlayerFromId(this.self);
      return Boolean(me?.isAutoplay);
    },
    countdownSecondsLeft() {
      const deadline = this.gameState?.turnDeadlineAt;
      if (!deadline) return null;
      return Math.max(0, Math.ceil((deadline - this.nowMs) / 1000));
    },
    countdownText() {
      if (this.selfIsAutoplay) return this.$t('ui.game.countdown_autoplay');
      if (this.countdownSecondsLeft === null) return '—';
      const s = this.countdownSecondsLeft;
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${s}s`;
    },
    countdownUrgent() {
      return this.countdownSecondsLeft !== null && this.countdownSecondsLeft <= 15;
    },
    isSpectator() {
      const me = this.getPlayerFromId(this.self);
      if (me?.role === PlayerRole.SPECTATOR) return true;
      const order = this.gameState?.board?.playerOrder || [];
      return !order.includes(this.self);
    },
    myTeam() {
      if (this.isSpectator) return null;
      return this.getPlayerFromId(this.self)?.team ?? null;
    },
    relationOf() {
      return (playerId: string) => {
        if (this.isSpectator || playerId === this.self) return 'self';
        const t = this.getPlayerFromId(playerId)?.team;
        const mine = this.myTeam;
        if (mine == null || t == null || t === TeamId.NONE || mine === TeamId.NONE) {
          if (this.isSpectator) {
            const idx = (this.gameState.board.playerOrder || []).indexOf(playerId);
            return idx % 2 === 0 ? 'ally' : 'enemy';
          }
          return 'enemy';
        }
        return t === mine ? 'ally' : 'enemy';
      };
    },
    seatOrder() {
      const order = [...(this.gameState.board.playerOrder || [])];
      if (this.isSpectator || !order.length) return order;
      const idx = order.indexOf(this.gameState.self);
      if (idx < 0) return order;
      return [...order.slice(idx), ...order.slice(0, idx)];
    },
    tableSlots() {
      const order = this.gameState.board.playerOrder || [];
      const pickOf = (playerId: string) => {
        const idx = order.indexOf(playerId);
        return idx >= 0 ? idx + 1 : 0;
      };
      const mk = (playerId: string, pos: string) => {
        const board = this.gameState.board.players[playerId] || {
          stash: 0, hand: [], tmpHand: [], city: [], score: {}, characters: [],
        };
        return {
          playerId,
          pos,
          pickOrder: pickOf(playerId),
          relation: this.relationOf(playerId),
          board: {
            ...board,
            crown: order[0] === playerId,
          },
        };
      };

      if (this.isSpectator) {
        return order.map((pid: string, i: number) => {
          const pos = i < 3 ? `l${i + 1}` : `r${i - 2}`;
          return mk(pid, pos);
        });
      }

      const rotated = this.seatOrder;
      const others = rotated.slice(1);
      const leftThree = others.slice(0, 3);
      const rightTwo = others.slice(3, 5);
      const leftTopToBottom = [...leftThree].reverse();
      const mapped = [
        ...leftTopToBottom.map((playerId: string, i: number) => ({
          playerId, pos: ['l1', 'l2', 'l3'][i],
        })),
        ...rightTwo.map((playerId: string, i: number) => ({
          playerId, pos: ['r1', 'r2'][i],
        })),
      ];
      return mapped.map((item) => mk(item.playerId, item.pos));
    },
    selfBoard() {
      if (this.isSpectator) {
        return {
          stash: 0, hand: [], tmpHand: [], city: [], score: {}, characters: [], crown: false,
        };
      }
      const board = this.gameState.board.players[this.self];
      return {
        stash: 0,
        hand: [],
        tmpHand: [],
        city: [],
        score: {},
        characters: [],
        ...(board || {}),
        crown: this.gameState.board.playerOrder[0] === this.self,
      };
    },
    selfName() {
      return this.getPlayerFromId(this.self)?.username || 'You';
    },
    selfPickOrder() {
      const order = this.gameState?.board?.playerOrder || [];
      const idx = order.indexOf(this.self);
      return idx >= 0 ? idx + 1 : 0;
    },
    displayActionFeed() {
      return this.gameState?.actionFeed || this.actionLog || [];
    },
    selfRoleCard() {
      const chars = this.selfBoard?.characters || [];
      if (!chars.length) {
        return {
          show: false, id: 0, faceDown: true, killed: false, robbed: false,
        };
      }
      const revealed = chars.find((c: any) => c.id > 0);
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
    statusBar() {
      return getStatusBarData(this.gameState);
    },
    buildMode() {
      return !this.isSpectator && this.isCurrentPlayerSelf
        && this.gameState.board.turnState === ClientTurnState.BUILD_DISTRICT;
    },
    destroyMode() {
      return !this.isSpectator && this.isCurrentPlayerSelf
        && this.gameState.board.turnState === ClientTurnState.WARLORD_DESTROY_DISTRICT;
    },
    killMode() {
      return !this.isSpectator && this.isCurrentPlayerSelf
        && this.gameState.board.turnState === ClientTurnState.ASSASSIN_KILL;
    },
    robMode() {
      return !this.isSpectator && this.isCurrentPlayerSelf
        && this.gameState.board.turnState === ClientTurnState.THIEF_ROB;
    },
    putAsideMode() {
      if (this.isSpectator || !this.isCurrentPlayerSelf) return false;
      switch (this.gameState.board.characters.state.type) {
        case CCST.PUT_ASIDE_FACE_UP:
        case CCST.PUT_ASIDE_FACE_DOWN:
        case CCST.PUT_ASIDE_FACE_DOWN_UP:
          return true;
        default:
          return false;
      }
    },
    chooseCharacterMode() {
      if (this.isSpectator || !this.isCurrentPlayerSelf) return false;
      return this.gameState.board.characters?.state?.type === CCST.CHOOSE_CHARACTER
        || this.putAsideMode;
    },
    exchangeHandMode() {
      return !this.isSpectator && this.isCurrentPlayerSelf
        && this.gameState.board.turnState === ClientTurnState.MAGICIAN_EXCHANGE_HAND;
    },
    discardCardsMode() {
      return !this.isSpectator && this.isCurrentPlayerSelf
        && this.gameState.board.turnState === ClientTurnState.MAGICIAN_DISCARD_CARDS;
    },
    laboratoryMode() {
      return !this.isSpectator && this.isCurrentPlayerSelf
        && this.gameState.board.turnState === ClientTurnState.LABORATORY_DISCARD_CARD;
    },
    isCompetitive() {
      return this.gameState?.gameMode === GameMode.COMPETITIVE_TEAM6;
    },
    showTeamScores() {
      if (!this.gameState?.board?.playerOrder) return false;
      return Object.values(this.gameState.players).some(
        (p: any) => p.team === TeamId.A || p.team === TeamId.B,
      );
    },
    liveTeamScores() {
      const ts = this.gameState?.teamScores;
      let A = 0;
      let B = 0;
      if (ts && (ts.A != null || ts.B != null)) {
        A = ts.A ?? 0;
        B = ts.B ?? 0;
      } else {
        (this.gameState?.board?.playerOrder || []).forEach((pid: string) => {
          const meta = this.getPlayerFromId(pid);
          const total = this.gameState?.board?.players?.[pid]?.score?.total ?? 0;
          if (meta?.team === TeamId.A) A += total;
          if (meta?.team === TeamId.B) B += total;
        });
      }
      const mine = this.myTeam;
      if (!this.isSpectator && mine === TeamId.B) {
        return {
          A: B, B: A, myLabel: 'B', enemyLabel: 'A',
        };
      }
      return {
        A, B, myLabel: 'A', enemyLabel: 'B',
      };
    },
    turnOrderChips() {
      const list = this.charactersList?.callable || [];
      const current = this.charactersList?.current || 0;
      if (list.length) {
        return list.map((c: any, idx: number) => ({
          idx,
          id: c.id || 0,
          current: c.id === current && current !== 0,
          killed: Boolean(c.killed),
          faceUp: Boolean(c.faceUp || c.discardedFaceUp),
          tip: c.id
            ? this.$t(`characters.${c.id}.name`)
            : this.$t('ui.game.character_unknown'),
        }));
      }
      return [1, 2, 3, 4, 5, 6, 7, 8].map((id, idx) => ({
        idx, id, current: id === current, killed: false, faceUp: false, tip: '',
      }));
    },
  },
  methods: {
    isPrimaryAction(title: string) {
      return ['take_gold', 'draw_cards', 'draw_cards_3', 'build_district', 'confirm', 'accept']
        .includes(title);
    },
    async onCenterCharacterClick(ch: any, index: number) {
      if (!ch.selectable) return;
      let moveType = MoveType.CHOOSE_CHARACTER;
      let moveData: any = index;
      if (this.killMode) {
        moveType = MoveType.ASSASSIN_KILL;
        moveData = ch.id;
      } else if (this.robMode) {
        moveType = MoveType.THIEF_ROB;
        moveData = ch.id;
      }
      try {
        await store.dispatch('sendMove', { type: moveType, data: moveData });
      } catch (e) {
        console.log('character click failed', e);
      }
    },
    showConfirmationModal() {
      store.commit('prepareGameSetupConfirmation');
      this.showSetupConfirm = true;
    },
    async startGame() {
      this.startingGame = true;
      try {
        await store.dispatch('startGame');
        this.startingGame = false;
      } catch (error) {
        console.error('error when starting game', error);
        this.startingGame = false;
      }
    },
    async toggleAutoplay() {
      if (this.autoplayBusy) return;
      this.autoplayBusy = true;
      try {
        await store.dispatch('setAutoplay', !this.selfIsAutoplay);
      } catch (error) {
        console.error('autoplay toggle failed', error);
      } finally {
        this.autoplayBusy = false;
      }
    },
    async sendMove(move: Move, target: HTMLElement) {
      if (target && target.blur) target.blur();
      try {
        await store.dispatch('sendMove', move);
      } catch (error) {
        console.log('error when sending move', error);
      }
    },
    dismissEndModal() {
      this.showEndModal = false;
    },
    async backToLobby() {
      try {
        await store.dispatch('leaveRoom');
      } catch (e) {
        console.error('leave room failed', e);
      }
      this.$router.push('/').catch(() => {
        window.location.href = '/';
      });
    },
    async leaveRoom() {
      try {
        await store.dispatch('leaveRoom');
        this.$router.push('/').catch(() => {
          window.location.href = '/';
        });
      } catch (e) {
        console.error('leave room failed', e);
      }
    },
    showEvent(text: string) {
      this.eventBanner = text;
      if (this.eventBannerTimer) clearTimeout(this.eventBannerTimer);
      this.eventBannerTimer = setTimeout(() => {
        this.eventBanner = '';
      }, 3500);
    },
  },
  mounted() {
    this.countdownTimer = setInterval(() => {
      this.nowMs = Date.now();
    }, 250);
  },
  beforeUnmount() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.eventBannerTimer) clearTimeout(this.eventBannerTimer);
    this.showSetupConfirm = false;
  },
  watch: {
    gameProgress(val: string) {
      if (val === 'FINISHED') this.showEndModal = true;
    },
    displayActionFeed: {
      deep: true,
      handler(list: any[]) {
        if (!Array.isArray(list) || !list.length) return;
        const last = list[list.length - 1];
        if (last?.kind === 'kill' || last?.kind === 'rob') {
          this.showEvent(last.text);
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

<style lang="scss" scoped>
.board-table__end-bar {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  z-index: 20;
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(212, 175, 55, 0.4);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}
.board-table__leave-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 20;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(212, 175, 55, 0.45);
  color: var(--gold);
  border-radius: 0.35rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.board-table__leave-btn:hover {
  background: rgba(212, 175, 55, 0.15);
  border-color: var(--gold-bright);
  color: var(--gold-bright);
}
</style>
