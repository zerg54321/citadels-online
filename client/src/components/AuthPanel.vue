<template>
<div class="auth-panel text-right">
  <template v-if="!authReady">
    <small class="text-muted">...</small>
  </template>
  <template v-else-if="isLoggedIn && authUser">
    <div class="d-flex flex-column align-items-end">
      <span class="small">
        {{ authUser.displayName }}
        <span class="badge badge-success">{{ $t('ui.auth.logged_in') }}</span>
      </span>
      <div class="btn-group btn-group-sm mt-1">
        <button type="button" class="btn btn-outline-light btn-sm" @click="showProfile = true">
          {{ $t('ui.auth.profile') }}
        </button>
        <button type="button" class="btn btn-outline-light btn-sm" @click="logout">
          {{ $t('ui.auth.logout') }}
        </button>
      </div>
    </div>
  </template>
  <template v-else>
    <span class="badge badge-secondary mr-1">{{ $t('ui.auth.guest') }}</span>
    <button type="button" class="btn btn-sm btn-light" @click="openAuth('login')">
      {{ $t('ui.auth.login') }}
    </button>
    <button type="button" class="btn btn-sm btn-outline-light ml-1" @click="openAuth('register')">
      {{ $t('ui.auth.register') }}
    </button>
  </template>

  <div
    class="modal fade"
    id="authModal"
    tabindex="-1"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content text-dark text-left">
        <div class="modal-header">
          <h5 class="modal-title">
            {{ mode === 'login' ? $t('ui.auth.login') : $t('ui.auth.register') }}
          </h5>
          <button type="button" class="close" data-dismiss="modal" :aria-label="$t('ui.close')">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
          <div class="form-group">
            <label>{{ $t('ui.auth.username') }}</label>
            <input class="form-control" v-model="username" autocomplete="username" />
          </div>
          <div class="form-group">
            <label>{{ $t('ui.auth.password') }}</label>
            <input
              class="form-control"
              type="password"
              v-model="password"
              autocomplete="current-password"
            />
          </div>
          <div class="form-group" v-if="mode === 'register'">
            <label>{{ $t('ui.auth.display_name') }}</label>
            <input
              class="form-control"
              v-model="displayName"
              :placeholder="$t('ui.auth.display_name_hint')"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-link"
            @click="mode = mode === 'login' ? 'register' : 'login'"
          >
            {{ mode === 'login' ? $t('ui.auth.switch_to_register') : $t('ui.auth.switch_to_login') }}
          </button>
          <button type="button" class="btn btn-primary" :disabled="busy" @click="submitAuth">
            {{ mode === 'login' ? $t('ui.auth.login') : $t('ui.auth.register') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    class="modal fade"
    id="profileModal"
    tabindex="-1"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content text-dark text-left">
        <div class="modal-header">
          <h5 class="modal-title">{{ $t('ui.auth.profile') }}</h5>
          <button type="button" class="close" data-dismiss="modal" :aria-label="$t('ui.close')">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <div v-if="profileError" class="alert alert-danger py-2">{{ profileError }}</div>
          <div v-if="profileOk" class="alert alert-success py-2">{{ $t('ui.auth.saved') }}</div>
          <p class="mb-2">
            <strong>{{ $t('ui.auth.username') }}:</strong>
            {{ authUser?.username }}
          </p>
          <div class="form-group mb-0">
            <label>{{ $t('ui.auth.display_name') }}</label>
            <input class="form-control" v-model="profileDisplayName" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-dismiss="modal">
            {{ $t('ui.close') }}
          </button>
          <button type="button" class="btn btn-primary" :disabled="busy" @click="saveProfile">
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
import $ from 'jquery';
import { mapGetters } from 'vuex';
import { store } from '../store';

export default defineComponent({
  name: 'AuthPanel',
  data() {
    return {
      mode: 'login' as 'login' | 'register',
      username: '',
      password: '',
      displayName: '',
      profileDisplayName: '',
      error: '',
      profileError: '',
      profileOk: false,
      busy: false,
      showProfile: false,
    };
  },
  computed: {
    ...mapGetters(['isLoggedIn', 'authUser', 'authReady']),
  },
  watch: {
    showProfile(val) {
      if (val) {
        this.profileDisplayName = this.authUser?.displayName || '';
        this.profileError = '';
        this.profileOk = false;
        this.$nextTick(() => $('#profileModal').modal('show'));
        this.showProfile = false;
      }
    },
  },
  methods: {
    openAuth(mode: 'login' | 'register') {
      this.mode = mode;
      this.error = '';
      this.password = '';
      $('#authModal').modal('show');
    },
    async submitAuth() {
      this.busy = true;
      this.error = '';
      try {
        if (this.mode === 'login') {
          await store.dispatch('login', {
            username: this.username.trim(),
            password: this.password,
          });
        } else {
          await store.dispatch('register', {
            username: this.username.trim(),
            password: this.password,
            displayName: this.displayName.trim() || undefined,
          });
        }
        $('#authModal').modal('hide');
        this.password = '';
      } catch (e: any) {
        this.error = e?.message || String(e);
      } finally {
        this.busy = false;
      }
    },
    async logout() {
      await store.dispatch('logout');
    },
    async saveProfile() {
      this.busy = true;
      this.profileError = '';
      this.profileOk = false;
      try {
        await store.dispatch('updateDisplayName', this.profileDisplayName.trim());
        this.profileOk = true;
      } catch (e: any) {
        this.profileError = e?.message || String(e);
      } finally {
        this.busy = false;
      }
    },
  },
});
</script>
