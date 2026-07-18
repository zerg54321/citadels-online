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
        v-tooltip="ch.tip"
      >{{ ch.id || '?' }}</span>
    </div>
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
    <div class="board-table__slot board-table__slot--center">
      <div class="board-table__center-panel">
        <h3 class="board-table__center-title">
          {{ centerTitle }}
        </h3>
        <div class="board-table__center-msg" ref="statusBarMessage">
          {{ $t(statusBar.message, statusBar.args) }}
        </div>

        <div v-if="eventBanner" class="board-table__banner board-table__banner--warn">
          {{ eventBanner }}
        </div>

        <div
          v-if="gameProgress === 'IN_GAME' && showCenterCharacterGrid"
          class="board-table__draft-grid"
        >
          <CharacterCard
            v-for="(ch, i) in centerCharacters"
            :key="i"
            :character-id="ch.id || 0"
            :face-down="false"
            :selectable="ch.selectable"
            :disabled="!ch.selectable && (killMode || robMode || chooseCharacterMode)"
            :killed="ch.killed"
            :robbed="ch.robbed"
            :face-up-mark="ch.faceUp"
            :current="ch.current"
            size="large"
            @select="onCenterCharacterClick(ch, i)"
          />
        </div>

        <div v-if="asideChips.length" class="board-table__aside-row">
          <span>{{ $t('ui.game.aside') }}:</span>
          <span v-for="(a, i) in asideChips" :key="i" class="badge badge-secondary">
            {{ a.id ? $t(`characters.${a.id}.name`) : '?' }}
            <template v-if="a.faceUp"> ({{ $t('ui.game.character_face_up_short') }})</template>
          </span>
        </div>

        <div v-if="showGraveyard" class="d-flex flex-column align-items-center mt-1">
          <span class="small opacity-75">{{ $t('districts.graveyard.name') }}</span>
          <DistrictCard :district-id="gameState.board.graveyard" small />
        </div>
      </div>
    </div>

    <!-- Self strip: only when seated player (not spectator) -->
    <div v-if="!isSpectator" class="board-table__slot board-table__slot--self">
      <div class="board-table__self-wrap">
        <div class="board-table__self-panel">
          <div class="board-table__self-head">
            <span>
              {{ selfLabel }}
              <span class="badge badge-primary ml-1">{{ $t('ui.lobby.you') }}</span>
            </span>
            <span class="d-flex align-items-center gap-2">
              G {{ selfBoard.stash }} · VP {{ selfBoard.score?.total ?? 0 }}
              <span v-if="selfBoard.crown"> 👑</span>
              <CharacterCard
                v-if="gameProgress === 'IN_GAME' && selfRoleCard.show"
                :character-id="selfRoleCard.id"
                :face-down="selfRoleCard.faceDown"
                :killed="selfRoleCard.killed"
                :robbed="selfRoleCard.robbed"
                size="medium"
              />
            </span>
          </div>
          <div class="board-table__self-hand">
            <div
              v-if="(selfBoard.city || []).length"
              class="board-table__self-city"
            >
              <DistrictCard
                v-for="(id, i) in selfBoard.city"
                :key="'city-' + i"
                :district-id="id"
                small
              />
            </div>
            <PlayerHand
              :board="selfBoard"
              :build-mode="buildMode"
              :discard-cards-mode="discardCardsMode"
              :laboratory-mode="laboratoryMode"
            />
          </div>
        </div>
      </div>

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
          v-for="(action, i) in statusBar.actions"
          :key="i"
          type="button"
          class="board-table__action-btn"
          :class="{
            'board-table__action-btn--primary': isPrimaryAction(action.title),
            'board-table__action-btn--danger': action.title === 'finish_turn' || action.title === 'cancel',
          }"
          @click="sendMove(action.move, $event.target)"
        >
          {{ $t(`ui.game.actions.${action.title}`, action.args) }}
        </button>
        <button
          v-if="gameProgress === 'IN_GAME'"
          type="button"
          class="board-table__action-btn"
          :disabled="autoplayBusy"
          @click="toggleAutoplay"
        >
          {{ selfIsAutoplay ? $t('ui.game.autoplay_cancel') : $t('ui.game.autoplay_enable') }}
        </button>
        <div class="board-table__meta">
          <div v-if="selfIsAutoplay">{{ $t('ui.game.autoplay_on') }}</div>
        </div>
      </div>
    </div>

    <!-- Far right: action log (server feed) -->
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
  </div>

  <!-- End game: dismissible result; stay on board until leave -->
  <div
    v-if="gameProgress === 'FINISHED' && showEndModal"
    class="modal fade show d-block"
    style="background:rgba(0,0,0,0.65); z-index: 1050;"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header" :class="endHeaderClass">
          <h4 class="modal-title mb-0">{{ endTitle }}</h4>
          <button type="button" class="close text-white" @click="dismissEndModal" aria-label="close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <div class="text-center mb-3">
            <div class="h5">{{ endSubtitle }}</div>
            <div v-if="showTeamScores" class="mt-2">
              <span class="badge badge-primary badge-pill px-3 py-2 mr-2">
                {{ isSpectator ? $t('ui.team.a') : $t('ui.team.mine') }} {{ liveTeamScores.A }}
              </span>
              <span class="badge badge-danger badge-pill px-3 py-2">
                {{ isSpectator ? $t('ui.team.b') : $t('ui.team.enemy') }} {{ liveTeamScores.B }}
              </span>
            </div>
          </div>
          <table class="table table-sm table-striped mb-0">
            <thead>
              <tr>
                <th>{{ $t('ui.lobby.players') }}</th>
                <th v-if="showTeamScores">{{ $t('ui.stats.team') }}</th>
                <th class="text-right">{{ $t('ui.score.total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in endScoreRows" :key="row.id">
                <td>
                  {{ row.name }}
                  <span v-if="row.isSelf" class="badge badge-info ml-1">{{ $t('ui.lobby.you') }}</span>
                  <span v-if="row.isAi" class="badge badge-dark ml-1">AI</span>
                </td>
                <td v-if="showTeamScores">
                  <span class="badge" :class="row.team === 'A' ? 'badge-primary' : 'badge-danger'">
                    {{ row.team }}
                  </span>
                </td>
                <td class="text-right font-weight-bold">{{ row.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" @click="dismissEndModal">
            {{ $t('ui.score.keep_browsing') }}
          </button>
          <button type="button" class="btn btn-primary" @click="backToLobby">
            {{ $t('ui.score.leave_room') }}
          </button>
        </div>
      </div>
    </div>
  </div>

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
import $ from 'jquery';
import { mapGetters } from 'vuex';
import {
  CharacterChoosingStateType as CCST,
  ClientTurnState,
  GameMode,
  GameProgress,
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

export default defineComponent({
  components: {
    SeatPanel,
    PlayerHand,
    DistrictCard,
    CharacterCard,
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
    /** relation for LoL-style colors: self=ally blue, enemy=red */
    relationOf() {
      return (playerId: string) => {
        if (!this.isSpectator && playerId === this.self) return 'self';
        const t = this.getPlayerFromId(playerId)?.team;
        const mine = this.myTeam;
        if (mine == null || t == null || t === TeamId.NONE || mine === TeamId.NONE) {
          // spectator or no teams: alternate by seat index for contrast
          if (this.isSpectator) {
            const idx = (this.gameState.board.playerOrder || []).indexOf(playerId);
            return idx % 2 === 0 ? 'ally' : 'enemy';
          }
          return 'enemy';
        }
        return t === mine ? 'ally' : 'enemy';
      };
    },
    /** seats rotated so self is bottom when playing */
    seatOrder() {
      const order = [...(this.gameState.board.playerOrder || [])];
      if (this.isSpectator || !order.length) return order;
      const idx = order.indexOf(this.gameState.self);
      if (idx < 0) return order;
      return [...order.slice(idx), ...order.slice(0, idx)];
    },
    tableSlots() {
      // pick order: crown holder drafts first (playerOrder[0] = 1)
      const order = this.gameState.board.playerOrder || [];
      const pickOf = (playerId: string) => {
        const idx = order.indexOf(playerId);
        return idx >= 0 ? idx + 1 : 0;
      };
      const mk = (playerId: string, pos: string) => {
        const board = this.gameState.board.players.get(playerId) || {
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
        // 6 seats: left 1,2,3 top→bottom; right 4,5,6 top→bottom
        return order.map((pid: string, i: number) => {
          const pos = i < 3 ? `l${i + 1}` : `r${i - 2}`;
          return mk(pid, pos);
        });
      }

      // player view: self bottom; left top→bottom = 4,3,2; right = 5,6
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
      const board = this.gameState.board.players.get(this.self);
      return {
        stash: 0, hand: [], tmpHand: [], city: [], score: {}, characters: [],
        ...(board || {}),
        crown: this.gameState.board.playerOrder[0] === this.self,
      };
    },
    selfLabel() {
      const name = this.getPlayerFromId(this.self)?.username || 'You';
      return `${name} (${this.$t('ui.lobby.you')})`;
    },
    displayActionFeed() {
      return this.gameState?.actionFeed || this.actionLog || [];
    },
    selfRoleCard() {
      const chars = this.selfBoard?.characters || [];
      if (!chars.length) return { show: false, id: 0, faceDown: true, killed: false, robbed: false };
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
      return Array.from(this.gameState.players.values()).some(
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
          const total = this.gameState?.board?.players?.get(pid)?.score?.total ?? 0;
          if (meta?.team === TeamId.A) A += total;
          if (meta?.team === TeamId.B) B += total;
        });
      }
      // LoL-style: show "my team" as left blue, enemy as right red when seated
      const mine = this.myTeam;
      if (!this.isSpectator && mine === TeamId.B) {
        return { A: B, B: A, myLabel: 'B', enemyLabel: 'A' };
      }
      return { A, B, myLabel: 'A', enemyLabel: 'B' };
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
      // fallback 1-8
      return [1, 2, 3, 4, 5, 6, 7, 8].map((id, idx) => ({
        idx, id, current: id === current, killed: false, faceUp: false, tip: '',
      }));
    },
    showCenterCharacterGrid() {
      return this.chooseCharacterMode || this.killMode || this.robMode
        || (this.gameProgress === 'IN_GAME' && (this.charactersList?.callable || []).length > 0);
    },
    centerCharacters() {
      const list = this.charactersList?.callable || [];
      const current = this.charactersList?.current || 0;
      return list.map((c: any) => {
        const killed = Boolean(c.killed);
        const faceUp = Boolean(c.faceUp || c.discardedFaceUp);
        let selectable = false;
        if (this.killMode) {
          selectable = c.id > 1 && c.id !== 0 && !c.faceDown;
        } else if (this.robMode) {
          selectable = c.id > 2 && !killed && c.id !== 0 && !c.faceDown && !faceUp;
        } else if (this.chooseCharacterMode) {
          selectable = Boolean(c.selectable);
        }
        return {
          ...c,
          killed,
          faceUp,
          selectable,
          current: c.id === current && current !== 0,
        };
      });
    },
    asideChips() {
      return this.charactersList?.aside || [];
    },
    centerTitle() {
      if (this.gameProgress !== 'IN_GAME') return this.$t('ui.game.messages.end');
      if (this.chooseCharacterMode) {
        return this.$t('ui.game.character_select_title');
      }
      if (this.killMode) return this.$t('ui.game.messages.actions.assassin_kill');
      if (this.robMode) return this.$t('ui.game.messages.actions.thief_rob');
      return this.$t('ui.game.characters');
    },
    isWin() {
      const result = this.gameState?.matchResult;
      const team = this.getPlayerFromId(this.self)?.team;
      return (result === MatchResult.TEAM_A_WIN && team === TeamId.A)
        || (result === MatchResult.TEAM_B_WIN && team === TeamId.B);
    },
    isLose() {
      const result = this.gameState?.matchResult;
      const team = this.getPlayerFromId(this.self)?.team;
      return (result === MatchResult.TEAM_A_WIN && team === TeamId.B)
        || (result === MatchResult.TEAM_B_WIN && team === TeamId.A);
    },
    endTitle() {
      if (this.isSpectator) return this.$t('ui.score.game_over');
      if (this.isWin) return this.$t('ui.score.you_win');
      if (this.isLose) return this.$t('ui.score.you_lose');
      if (this.gameState?.matchResult === MatchResult.DRAW) return this.$t('ui.score.draw');
      return this.$t('ui.score.game_over');
    },
    endSubtitle() {
      if (this.matchSummary?.detail) return this.matchSummary.detail;
      if (this.matchSummary?.title) return this.matchSummary.title;
      return '';
    },
    endHeaderClass() {
      if (this.isWin) return 'bg-success text-white';
      if (this.isLose) return 'bg-danger text-white';
      return 'bg-secondary text-white';
    },
    endScoreRows() {
      const order = this.gameState?.board?.playerOrder || [];
      return order.map((pid: string) => {
        const meta = this.getPlayerFromId(pid);
        const board = this.gameState?.board?.players?.get(pid);
        let team = '';
        if (meta?.team === TeamId.A) team = 'A';
        if (meta?.team === TeamId.B) team = 'B';
        return {
          id: pid,
          name: meta?.username || pid,
          isSelf: pid === this.self,
          isAi: Boolean(meta?.isAi),
          team,
          total: board?.score?.total ?? 0,
        };
      }).sort((a: any, b: any) => b.total - a.total);
    },
    matchSummary() {
      if (!this.showTeamScores) return null;
      const { A, B } = this.liveTeamScores;
      const result = this.gameState?.matchResult;
      let title = this.$t('ui.score.draw');
      if (result === MatchResult.TEAM_A_WIN) title = this.$t('ui.score.team_a_win');
      if (result === MatchResult.TEAM_B_WIN) title = this.$t('ui.score.team_b_win');
      if (result === MatchResult.CASUAL_END) title = this.$t('ui.score.game_over');
      return {
        title,
        detail: this.$t('ui.score.team_totals', { a: A, b: B }),
      };
    },
    showGraveyard() {
      return this.gameState.board.graveyard !== undefined;
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
      $('#setupConfirmationModal').modal();
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
    backToLobby() {
      this.$router.push('/').catch(() => {
        window.location.href = '/';
      });
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
    $('#setupConfirmationModal').modal('hide');
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
</style>
