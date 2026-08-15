self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Medicinas de Lilian", body: "Tienes un recordatorio." };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  const opciones = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: "medicinas-lilian",
  };

  event.waitUntil(self.registration.showNotification(data.title, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
