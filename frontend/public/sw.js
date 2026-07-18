// Service Worker for Web Push Notifications
// This file handles push notifications and notification clicks

self.addEventListener('push', function(event) {
  let data = { title: '任务提醒', body: '您有一个新的任务提醒', icon: '/vite.svg', priority: 2 }

  if (event.data) {
    try {
      data = event.data.json()
    } catch (e) {
      data.body = event.data.text()
    }
  }

  const priority = typeof data.priority === 'number' ? data.priority : 2

  const options = {
    body: data.body,
    icon: data.icon || '/vite.svg',
    badge: data.badge || '/vite.svg',
    tag: data.tag || 'task-reminder',
    renotify: true,
    data: {
      url: data.url || '/',
      taskId: data.taskId || null,
      priority: priority
    },
    vibrate: priority === 0 ? [300, 100, 300, 100, 300] : [200, 100, 200],
    actions: [
      { action: 'open', title: '查看' },
      { action: 'dismiss', title: '忽略' }
    ]
  }

  // Notify all open windows to play the appropriate notification sound
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        clientList.forEach(function(client) {
          client.postMessage({
            type: 'PLAY_NOTIFICATION_SOUND',
            priority: priority
          })
        })
      })
    ])
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()

  const action = event.action
  const url = event.notification.data?.url || '/'

  if (action === 'dismiss') {
    return
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

self.addEventListener('notificationclose', function(event) {
  // User dismissed the notification
  console.log('Notification dismissed', event.notification.tag)
})
