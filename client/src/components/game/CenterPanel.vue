<template>
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
        v-if="showCenterCharacterGrid"
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
          @select="$emit('select-character', ch, i)"
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
        <DistrictCard :district-id="graveyardCard" small />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import DistrictCard from './elements/DistrictCard.vue';
import CharacterCard from './elements/CharacterCard.vue';
import { getStatusBarData } from '../../data/statusBarData';
import { CharacterChoosingStateType as CCST, ClientTurnState } from 'citadels-common';

export default defineComponent({
  name: 'CenterPanel',
  components: {
    DistrictCard,
    CharacterCard,
  },
  props: {
    gameProgress: {
      type: String,
      required: true,
    },
    charactersList: {
      type: Object,
      required: true,
    },
    gameState: {
      type: Object,
      required: true,
    },
    killMode: {
      type: Boolean,
      required: true,
    },
    robMode: {
      type: Boolean,
      required: true,
    },
    chooseCharacterMode: {
      type: Boolean,
      required: true,
    },
    eventBanner: {
      type: String,
      default: '',
    },
  },
  emits: ['select-character'],
  data() {
    return {
      statusBar: {} as any,
    };
  },
  computed: {
    centerTitle() {
      if (this.gameProgress !== 'IN_GAME') return this.$t('ui.game.messages.end');
      if (this.chooseCharacterMode) {
        return this.$t('ui.game.character_select_title');
      }
      if (this.killMode) return this.$t('ui.game.messages.actions.assassin_kill');
      if (this.robMode) return this.$t('ui.game.messages.actions.thief_rob');
      return this.$t('ui.game.characters');
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
    showCenterCharacterGrid() {
      return this.chooseCharacterMode || this.killMode || this.robMode
        || (this.gameProgress === 'IN_GAME' && (this.charactersList?.callable || []).length > 0);
    },
    showGraveyard() {
      return this.gameState?.board?.graveyard !== undefined;
    },
    graveyardCard() {
      return this.gameState?.board?.graveyard;
    },
  },
  watch: {
    gameState: {
      immediate: true,
      handler() {
        this.statusBar = getStatusBarData(this.gameState);
      },
    },
  },
});
</script>
