<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted, onUnmounted } from 'vue'
import { useSoundEffects, type Priority } from '@/composables/useSoundEffects'

const { playNotificationSound } = useSoundEffects()

// Listen for messages from the service worker (push notification sound triggers)
function handleSWMessage(event: MessageEvent) {
  if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') {
    const priority = (typeof event.data.priority === 'number' ? event.data.priority : 2) as Priority
    playNotificationSound(priority)
  }
}

onMounted(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSWMessage)
  }
})

onUnmounted(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('message', handleSWMessage)
  }
})
</script>

<template>
  <RouterView />
</template>

<style>
/* Global resets handled in main.css */
</style>
