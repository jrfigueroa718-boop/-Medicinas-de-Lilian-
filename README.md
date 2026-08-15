# Medicinas de Lilian

App instalable (PWA) con notificaciones push reales — llegan aunque el teléfono
esté bloqueado o la app esté cerrada. Ya viene cargada con los medicamentos y
la cita del Dr. Carmona.

## Qué incluye

- `public/` — la app que se instala en el teléfono (interfaz + service worker)
- `server.js` — servidor que guarda los datos y manda los avisos a la hora exacta
- `data/` — medicamentos.json y citas.json (los datos, se editan también desde la app)
- Notificaciones vía **Web Push** con llaves VAPID ya generadas en `.env`

## 1. Probarlo en tu computadora (opcional, para revisar antes de publicar)

```bash
npm install
npm start
```

Abre `http://localhost:3000` en Chrome. Puedes activar notificaciones y
probarlas ahí mismo antes de publicar la app de verdad.

## 2. Publicarla en internet (gratis, con Render)

Un servidor necesita estar en línea 24/7 para que los avisos salgan aunque tu
abuela no tenga la app abierta. Render tiene un plan gratuito que funciona
bien para esto:

1. Sube esta carpeta a un repositorio de GitHub (puedo ayudarte a crearlo).
2. Entra a [render.com](https://render.com) y crea una cuenta gratuita.
3. "New +" → "Web Service" → conecta tu repositorio de GitHub.
4. Configuración:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. En "Environment Variables" agrega las mismas que están en el archivo `.env`
   de este proyecto (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). **No subas el
   archivo `.env` a GitHub** — el `.gitignore` ya lo excluye por seguridad.
6. Espera a que termine el despliegue. Render te da una dirección como
   `https://medicinas-lilian.onrender.com`.

> Nota: en el plan gratuito de Render, el servidor "se duerme" tras 15 minutos
> sin visitas y tarda unos segundos en despertar. Esto no afecta los avisos
> programados (el cron los sigue mandando), pero si quieres que nunca se
> duerma, hay planes pagados desde $7 USD/mes.

## 3. Instalarla en el Android de tu abuela

1. Abre la dirección de Render en Chrome, en su teléfono.
2. Toca el botón "Activar avisos" y acepta el permiso de notificaciones.
3. Toca el menú de Chrome (⋮) → "Agregar a pantalla de inicio" / "Instalar app".
4. Le queda un ícono verde como cualquier otra app. Desde ahí puede ver y
   marcar sus medicamentos del día.

## 4. Editar medicamentos o citas

Desde la pestaña "Editar" (tú, o quien tenga el enlace) puedes agregar,
cambiar o borrar cualquier medicamento o cita en cualquier momento — se
actualiza para todos los que tengan la app instalada.

## Probar que las notificaciones sí funcionan

Con el servidor corriendo y al menos un dispositivo con notificaciones
activadas, puedes forzar un aviso de prueba:

```bash
curl -X POST https://tu-servidor.onrender.com/api/probar-notificacion
```
