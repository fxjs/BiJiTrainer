<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { sound } from '../sound'
import { useAuthStore } from '../stores/auth'

const props = withDefaults(defineProps<{ dataBusy?: boolean }>(), { dataBusy: false })
const auth = useAuthStore()
const id = useId()
const name = ref('')
const pending = ref<'init' | 'roll' | 'enter' | 'leave' | null>(null)
const resolvedRoll = ref(false)
const confirming = ref(false)
const working = computed(() => auth.busy || props.dataBusy || pending.value !== null)
const locked = computed(() => working.value || !auth.ready)

watch(() => auth.candidate?.name, (candidate) => {
  name.value = candidate ?? ''
}, { immediate: true })

watch(() => auth.identity?.id, () => {
  name.value = auth.candidate?.name ?? ''
  resolvedRoll.value = false
  confirming.value = false
})

async function initialize(force = false) {
  if (working.value)
    return
  pending.value = 'init'
  try {
    await auth.init(force)
  }
  finally {
    pending.value = null
  }
}

async function roll() {
  if (locked.value || auth.identity)
    return
  pending.value = 'roll'
  resolvedRoll.value = false
  sound.play('ui')
  try {
    resolvedRoll.value = await auth.roll()
  }
  finally {
    pending.value = null
  }
}

async function enter() {
  if (locked.value || auth.identity || !name.value.trim())
    return
  pending.value = 'enter'
  try {
    await auth.enter(name.value)
  }
  finally {
    pending.value = null
  }
}

async function leave() {
  if (locked.value || !auth.identity)
    return
  if (!confirming.value) {
    confirming.value = true
    return
  }
  pending.value = 'leave'
  try {
    await auth.leave()
  }
  finally {
    pending.value = null
  }
}

onMounted(() => {
  if (!auth.ready)
    void initialize()
})
</script>

<template>
  <section class="account" aria-label="训练名号" :aria-busy="working || !auth.ready">
    <header v-if="auth.identity" class="account-heading">
      <h2>{{ auth.identity.name }}</h2>
      <div class="identity-actions">
        <button v-if="confirming" type="button" class="btn" :disabled="locked" @click="confirming = false">取消</button>
        <button type="button" class="btn" :disabled="locked" @click="leave">{{ confirming ? '确认切换' : '切换名号' }}</button>
      </div>
    </header>
    <p v-if="auth.identity && confirming" class="switch-note">记住「{{ auth.identity.name }}」，下次输入即可回来。</p>

    <form v-if="!auth.identity" class="account-form" @submit.prevent="enter">
      <fieldset :disabled="locked">
        <legend class="sr-only">
          进入训练
        </legend>
        <div class="name-control" :class="{ 'is-resolved': resolvedRoll }">
          <label class="sr-only" :for="`${id}-name`">名号</label>
          <input
            :id="`${id}-name`"
            v-model="name"
            name="character-name"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            :spellcheck="false"
            :aria-describedby="auth.error ? `${id}-error` : undefined"
            required
          >
          <button
            type="button"
            class="btn dice"
            :class="{ 'is-rolling': pending === 'roll' }"
            aria-label="换个名号"
            title="换个名号"
            @click="roll"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.7" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" />
              <circle cx="16" cy="8" r="1.4" fill="currentColor" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" />
              <circle cx="8" cy="16" r="1.4" fill="currentColor" />
              <circle cx="16" cy="16" r="1.4" fill="currentColor" />
            </svg>
          </button>
        </div>
        <button type="submit" class="btn primary" :disabled="!name.trim()">
          进入训练
        </button>
      </fieldset>
    </form>

    <div v-if="auth.error" class="account-error">
      <p :id="`${id}-error`" class="message error" role="alert">
        {{ auth.error }}
      </p>
      <button v-if="!auth.identity && !auth.candidate" type="button" class="btn retry" :disabled="working" @click="initialize(true)">
        重试
      </button>
    </div>
  </section>
</template>

<style scoped>
.account {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: var(--surface);
  display: grid;
  gap: 16px;
}

.account-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
}

.identity-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.switch-note { margin: 0; color: var(--muted); font-size: 13px; }

h2 {
  min-width: 0;
  margin: 0;
  color: var(--ink);
  font-size: 18px;
  line-height: 1.4;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.account-form {
  width: 100%;
  max-width: 440px;
  justify-self: center;
}

fieldset {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
  display: grid;
  gap: 16px;
}

.name-control {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

input {
  min-width: 0;
  width: 100%;
  min-height: 48px;
  padding: 11px 14px;
  border: 1px solid var(--rule);
  border-radius: 9px;
  background: var(--ground);
  color: var(--ink);
  font-size: 18px;
  line-height: 1.4;
  transition: border-color var(--motion-fast) var(--ease-out), opacity var(--motion-fast);
}

input:hover:not(:disabled) {
  border-color: var(--muted);
}

input:focus-visible {
  border-color: var(--gold);
}

.dice {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  padding: 11px;
  display: grid;
  place-items: center;
  color: var(--gold);
}

.dice svg {
  display: block;
  width: 24px;
  height: 24px;
}

.is-rolling svg {
  animation: dice-turn 220ms var(--ease-out);
}

.is-resolved input {
  animation: name-arrive 200ms var(--ease-out);
}

.account-error {
  min-width: 0;
  display: grid;
  gap: 12px;
}

.message {
  margin: 0;
  color: var(--red);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.retry {
  justify-self: start;
}

input:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

@keyframes dice-turn {
  from { transform: rotate(-55deg) scale(.9); opacity: .5; }
  to { transform: rotate(0) scale(1); opacity: 1; }
}

@keyframes name-arrive {
  from { transform: translateY(2px); opacity: .65; }
  to { transform: translateY(0); opacity: 1; }
}

@media (max-width: 480px) {
  .account {
    padding: 18px 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .account button,
  input {
    transition: none;
  }

  .account button:active:not(:disabled) {
    transform: none;
  }

  .is-rolling svg,
  .is-resolved input {
    animation: none;
  }
}
</style>
