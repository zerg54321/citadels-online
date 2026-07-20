<template>
  <div v-if="show" class="modal fade show d-block" style="background:rgba(0,0,0,0.65); z-index: 1050;">
    <div class="modal-dialog" :class="dialogClass">
      <div class="modal-content">
        <div class="modal-header" :class="headerClass">
          <h5 class="modal-title mb-0">{{ title }}</h5>
          <button
            type="button"
            class="close text-white"
            @click="$emit('close')"
            aria-label="close"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'AppModal',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    title: {
      type: String,
      default: '',
    },
    dialogClass: {
      type: String,
      default: 'modal-dialog-centered',
    },
    headerClass: {
      type: String,
      default: '',
    },
  },
  emits: ['close'],
});
</script>
