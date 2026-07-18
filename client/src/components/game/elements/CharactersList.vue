<template>
<div v-if="characters.length > 0" class="card bg-dark">
  <div v-if="title" class="card-header bg-secondary text-light text-center px-0">
    {{ title }}
  </div>
  <ul class="list-group list-group-flush text-dark shadow-sm">
    <li
      v-for="(character, i) in processedCharacters" :key="i"
      class="list-group-item p-1 d-flex justify-content-between align-items-center"
      :class="rowClass(character)"
      v-tooltip="tooltipText(character)"
      data-placement="left"
      @click="selectCharacter(i, character.id)"
    >
      <!-- unknown / face-down discard (aside list only) -->
      <span
        v-if="character.id === 0 || character.faceDown"
        class="badge px-2 py-2 shadow-sm bg-dark text-light border border-secondary"
      >?</span>
      <span
        v-else
        class="badge px-2 py-2 shadow-sm"
        :class="`bg-${bgColor(character.id)} text-${textColor(character.id)}`"
      >{{ character.id }}</span>

      <span class="badge text-truncate flex-fill text-left">
        <template v-if="character.id === 0 || character.faceDown">
          {{ $t('ui.game.character_unknown') }}
        </template>
        <template v-else>
          {{ $t(`characters.${character.id}.name`) }}
        </template>
      </span>

      <!-- 明弃：天绝牌，刺杀时仍可选（空刀策略） -->
      <span
        v-if="character.faceUp || character.discardedFaceUp"
        class="badge badge-info badge-pill p-1 shadow-sm mr-1"
        :title="$t('ui.game.character_face_up')"
      >{{ $t('ui.game.character_face_up_short') }}</span>

      <span
        v-if="character.killed"
        class="badge badge-pill badge-danger p-1 shadow-sm"
        :title="$t('ui.game.character_killed')"
      ><emoji emoji="💀"></emoji></span>
      <span
        v-else-if="character.robbed"
        class="badge badge-pill badge-warning p-1 shadow-sm"
        :title="$t('ui.game.character_robbed')"
      ><emoji emoji="💰"></emoji></span>

      <span class="hover-hint">
        <span
          v-if="killMode && character.selectable"
          class="badge badge-pill badge-danger p-1 shadow-sm"
        >
          <emoji emoji="💀"></emoji>
        </span>
      <span
        v-else-if="robMode && character.selectable"
        class="badge badge-pill badge-dark p-1 shadow-sm"
      ><emoji emoji="💰"></emoji></span>
        <span v-else-if="putAsideMode"><emoji emoji="⬇️"></emoji></span>
      </span>
    </li>
  </ul>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { Move, MoveType } from 'citadels-common';
import { store } from '../../../store';

export default defineComponent({
  name: 'CharactersList',
  props: {
    title: { type: String, default: '' },
    characters: { type: Array, required: true },
    current: { type: Number, default: 0 },
    killMode: { type: Boolean, default: false },
    robMode: { type: Boolean, default: false },
    putAsideMode: { type: Boolean, default: false },
  },
  computed: {
    processedCharacters() {
      return this.characters.map((character: any) => {
        const killed = Boolean(character.killed);
        const robbed = Boolean(character.robbed);
        const faceUp = Boolean(character.faceUp || character.discardedFaceUp);
        let selectable = Boolean(character.selectable);

        if (this.killMode) {
          // 2–8 always clickable for bluff kill, including face-up discards
          selectable = character.id > 1 && character.id !== 0 && !character.faceDown;
        } else if (this.robMode) {
          // cannot rob killed; face-up discard is not in play as a holder but id still shown
          selectable = character.id > 2
            && !killed
            && character.id !== 0
            && !character.faceDown
            && !faceUp;
        } else if (this.putAsideMode) {
          selectable = Boolean(character.selectable);
        }

        return {
          ...character,
          killed,
          robbed,
          faceUp,
          selectable,
        };
      });
    },
  },
  methods: {
    rowClass(character: any) {
      return {
        'list-group-item-dark': !character.killed,
        'list-group-item-danger': character.killed,
        // 明弃：明显标记但仍可选（刺杀时）
        'char-face-up': character.faceUp,
        'char-killed': character.killed,
        'bg-secondary text-white-50': character.id > 0
          && character.id < this.current
          && !character.killed
          && !character.faceUp,
        'active bg-white text-dark border-dark mx-n1 shadow-sm rounded':
          character.id === this.current
          && this.current !== 0
          && !(this.killMode || this.robMode),
        'bg-light': character.id > this.current
          && !character.killed
          && character.id !== 0
          && !character.faceUp,
        'bg-white text-dark cursor-pointer hover-hint-hitbox border border-primary':
          character.selectable,
        'font-italic opacity-75': character.faceDown || character.id === 0,
      };
    },
    tooltipText(character: any) {
      if (character.faceDown || character.id === 0) {
        return this.$t('ui.game.character_face_down');
      }
      const base = this.$t(`characters.${character.id}.description`);
      if (character.faceUp) {
        return `${base} — ${this.$t('ui.game.character_face_up')}（${this.$t('ui.game.character_face_up_hint')}）`;
      }
      if (character.killed) {
        return `${base} — ${this.$t('ui.game.character_killed')}`;
      }
      return base;
    },
    bgColor(character: number) {
      if (character < this.current) return 'dark';
      switch (character) {
        case 4: return 'warning';
        case 5: return 'primary';
        case 6: return 'success';
        case 8: return 'danger';
        default: return 'secondary';
      }
    },
    textColor(character: number) {
      if (character < this.current) return 'light';
      return character === 4 ? 'dark' : 'light';
    },
    async selectCharacter(index: number, characterId: number) {
      if (!this.processedCharacters[index].selectable) return;
      if (this.robMode && this.processedCharacters[index].killed) return;

      let moveType = MoveType.CHOOSE_CHARACTER;
      let moveData: any = index;
      if (this.killMode) {
        moveType = MoveType.ASSASSIN_KILL;
        moveData = characterId;
      } else if (this.robMode) {
        moveType = MoveType.THIEF_ROB;
        moveData = characterId;
      }
      await store.dispatch('sendMove', { type: moveType, data: moveData } as Move);
    },
  },
});
</script>

<style lang="scss" scoped>
.hover-hint { display: none; }
.hover-hint-hitbox:hover .hover-hint { display: block; }

/* 明弃：左侧亮边 + 斜纹感，仍可点击 */
.char-face-up {
  background: repeating-linear-gradient(
    -45deg,
    #1e3a5f,
    #1e3a5f 6px,
    #243b55 6px,
    #243b55 12px
  ) !important;
  color: #e0f2fe !important;
  border-left: 4px solid #38bdf8 !important;
}

.char-killed {
  background: #3f1d1d !important;
  color: #fecaca !important;
  text-decoration: line-through;
}
</style>
