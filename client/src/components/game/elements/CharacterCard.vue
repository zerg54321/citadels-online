<template>
  <div
    class="char-card"
    :class="[
      `char-card--${resolvedSize}`,
      {
        'char-card--selectable': selectable && !disabled,
        'char-card--disabled': disabled,
        'char-card--face-down': isBack,
        'char-card--killed': killed,
        'char-card--robbed': robbed,
        'char-card--face-up-mark': faceUpMark,
        'char-card--current': current,
      },
    ]"
    @click="onClick"
  >
    <div v-if="isBack" class="char-card__inner char-card__inner--back">
    </div>
    <div
      v-else
      class="char-card__inner"
      :class="[
        `char-card__inner--c${characterId}`,
        artKey ? `char-card__inner--art-${artKey}` : '',
      ]"
    >
      <div class="char-card__num">{{ characterId }}</div>
      <div class="char-card__art">
        <span v-if="!artKey" class="char-card__emoji">{{ roleEmoji }}</span>
      </div>
      <div class="char-card__footer">
        <div class="char-card__name">{{ $t(`characters.${characterId}.name`) }}</div>
      </div>
      <div v-if="killed" class="char-card__stamp char-card__stamp--kill">💀</div>
      <div v-else-if="robbed" class="char-card__stamp char-card__stamp--rob">💰</div>
      <div v-if="faceUpMark" class="char-card__tag">
        {{ $t('ui.game.character_face_up_short') }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

const ART_KEYS: Record<number, string> = {
  1: 'assassin',
  2: 'thief',
  3: 'magician',
  4: 'king',
  5: 'bishop',
  6: 'merchant',
  7: 'architect',
  8: 'warlord',
};

const EMOJIS: Record<number, string> = {
  1: '🗡️',
  2: '🦹',
  3: '🪄',
  4: '👑',
  5: '✝️',
  6: '💰',
  7: '🏗️',
  8: '⚔️',
};

export default defineComponent({
  name: 'CharacterCard',
  props: {
    characterId: { type: Number, default: 0 },
    faceDown: { type: Boolean, default: false },
    selectable: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    small: { type: Boolean, default: false },
    size: { type: String, default: '' },
    killed: { type: Boolean, default: false },
    robbed: { type: Boolean, default: false },
    faceUpMark: { type: Boolean, default: false },
    current: { type: Boolean, default: false },
  },
  computed: {
    resolvedSize(): string {
      if (this.size === 'small' || this.size === 'medium' || this.size === 'large') {
        return this.size;
      }
      return this.small ? 'small' : 'medium';
    },
    isBack(): boolean {
      return this.faceDown || !this.characterId;
    },
    artKey(): string {
      return ART_KEYS[this.characterId] || '';
    },
    roleEmoji(): string {
      return EMOJIS[this.characterId] || '🎭';
    },
  },
  methods: {
    onClick() {
      if (this.selectable && !this.disabled) {
        this.$emit('select');
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.char-card {
  flex-shrink: 0;
  border-radius: 0.5rem;
  position: relative;
  user-select: none;

  &--small { width: 4.4rem; height: 6.1rem; }
  &--medium { width: 5.8rem; height: 8rem; }
  &--large { width: 7.2rem; height: 9.8rem; }

  &--selectable {
    cursor: pointer;
    &:hover .char-card__inner {
      transform: translateY(-3px);
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45), 0 0 0 2px rgba(212, 175, 55, 0.55);
    }
  }

  &--disabled {
    opacity: 0.42;
    filter: grayscale(0.45);
    pointer-events: none;
  }

  &--current .char-card__inner {
    box-shadow: 0 0 0 2px #d4af37, 0 0 16px rgba(212, 175, 55, 0.6);
  }

  &__inner {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #f5e6c8;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    background-color: #1a1512;
    background-position: center top;
    background-size: cover;

    &--back {
      background-image: url('../../../assets/characters/background.jpg');
      background-size: cover;
      background-position: center;
      border-color: rgba(180, 140, 255, 0.35);
      box-shadow: inset 0 0 24px rgba(0,0,0,0.6);
    }

    /* fallback gradients when art missing */
    &--c1 { background-color: #111827; }
    &--c2 { background-color: #0f172a; }
    &--c3 { background-color: #1e1b4b; }
    &--c4 { background-color: #78350f; }
    &--c5 { background-color: #1e3a8a; }
    &--c6 { background-color: #14532d; }
    &--c7 { background-color: #4c1d95; }
    &--c8 { background-color: #7f1d1d; }

    /* art — same pattern as DistrictCard */
    &--art-assassin {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/assassin.jpg');
    }
    &--art-thief {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/thief.jpg');
    }
    &--art-magician {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/magician.jpg');
    }
    &--art-king {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/king.jpg');
    }
    &--art-bishop {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/bishop.jpg');
    }
    &--art-merchant {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/merchant.jpg');
    }
    &--art-architect {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/architect.jpg');
    }
    &--art-warlord {
      background-image: linear-gradient(to top, #000c 0%, #0000 48%),
        url('../../../assets/characters/warlord.jpg');
    }
  }

  &__back-pattern {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
  }

  &__back-icon { font-size: 1.8rem; opacity: 0.9; }
  &--small &__back-icon { font-size: 1.25rem; }
  &--large &__back-icon { font-size: 2.2rem; }

  &__back-label {
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  &__num {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    min-width: 1.35rem;
    height: 1.35rem;
    padding: 0 0.2rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 0.78rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  &--small &__num { min-width: 1.1rem; height: 1.1rem; font-size: 0.65rem; }
  &--large &__num { min-width: 1.55rem; height: 1.55rem; font-size: 0.9rem; }

  &__art {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  &__emoji {
    font-size: 2rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
  }
  &--small &__emoji { font-size: 1.35rem; }
  &--large &__emoji { font-size: 2.5rem; }

  &__footer {
    background: linear-gradient(to top, #000d 0%, #0007 70%, #0000 100%);
    padding: 0.35rem 0.2rem 0.4rem;
    z-index: 1;
  }

  &__name {
    text-align: center;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.15;
    text-shadow: 0 1px 3px #000, 0 0 6px #000;
  }
  &--small &__name { font-size: 0.58rem; }
  &--large &__name { font-size: 0.85rem; }

  &__stamp {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-12deg);
    font-size: 2rem;
    opacity: 0.92;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.65);
    z-index: 3;
  }
  &--small &__stamp { font-size: 1.25rem; }
  &--large &__stamp { font-size: 2.4rem; }

  &__tag {
    position: absolute;
    top: 0.3rem;
    right: 0.25rem;
    font-size: 0.55rem;
    font-weight: 800;
    background: #0ea5e9;
    color: #fff;
    border-radius: 3px;
    padding: 0.05rem 0.25rem;
    z-index: 2;
  }

  &--killed .char-card__inner {
    filter: grayscale(0.65) brightness(0.85);
  }
}
</style>
