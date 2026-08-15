require("dotenv").config();
const express = require("express");
const cors = require("cors");
const webpush = require("web-push");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data");
const MEDS_FILE = path.join(DATA_DIR, "medicamentos.json");
const CITAS_FILE = path.join(DATA_DIR, "citas.json");
const SUBS_FILE = path.join(DATA_DIR, "subscriptions.json");

function leer(archivo, porDefecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, "utf-8"));
  } catch (e) {
    return porDefecto;
  }
}
function escribir(archivo, datos) {
  fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
}

// --- Configuración VAPID (notificaciones push) ---
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:recordatorios@medicinaslilian.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("⚠️  Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el archivo .env. Las notificaciones push no funcionarán hasta que las agregues.");
}

// --- Clave pública para que el frontend se suscriba ---
app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || "" });
});

// --- Guardar suscripción de este dispositivo ---
app.post("/api/subscribe", (req, res) => {
  const subs = leer(SUBS_FILE, []);
  const nueva = req.body;
  const yaExiste = subs.some((s) => s.endpoint === nueva.endpoint);
  if (!yaExiste) {
    subs.push(nueva);
    escribir(SUBS_FILE, subs);
  }
  res.status(201).json({ ok: true });
});

app.post("/api/unsubscribe", (req, res) => {
  const subs = leer(SUBS_FILE, []);
  const restantes = subs.filter((s) => s.endpoint !== req.body.endpoint);
  escribir(SUBS_FILE, restantes);
  res.json({ ok: true });
});

// --- Medicamentos ---
app.get("/api/medicamentos", (req, res) => {
  res.json(leer(MEDS_FILE, []));
});
app.post("/api/medicamentos", (req, res) => {
  const meds = leer(MEDS_FILE, []);
  meds.push(req.body);
  escribir(MEDS_FILE, meds);
  res.status(201).json(req.body);
});
app.put("/api/medicamentos/:id", (req, res) => {
  const meds = leer(MEDS_FILE, []);
  const idx = meds.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "No encontrado" });
  meds[idx] = { ...meds[idx], ...req.body, id: req.params.id };
  escribir(MEDS_FILE, meds);
  res.json(meds[idx]);
});
app.delete("/api/medicamentos/:id", (req, res) => {
  const meds = leer(MEDS_FILE, []);
  escribir(MEDS_FILE, meds.filter((m) => m.id !== req.params.id));
  res.json({ ok: true });
});

// --- Citas ---
app.get("/api/citas", (req, res) => {
  res.json(leer(CITAS_FILE, []));
});
app.post("/api/citas", (req, res) => {
  const citas = leer(CITAS_FILE, []);
  citas.push(req.body);
  escribir(CITAS_FILE, citas);
  res.status(201).json(req.body);
});
app.put("/api/citas/:id", (req, res) => {
  const citas = leer(CITAS_FILE, []);
  const idx = citas.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "No encontrada" });
  citas[idx] = { ...citas[idx], ...req.body, id: req.params.id };
  escribir(CITAS_FILE, citas);
  res.json(citas[idx]);
});
app.delete("/api/citas/:id", (req, res) => {
  const citas = leer(CITAS_FILE, []);
  escribir(CITAS_FILE, citas.filter((c) => c.id !== req.params.id));
  res.json({ ok: true });
});

// --- Envío de notificación a todos los dispositivos suscritos ---
function enviarATodos(payload) {
  const subs = leer(SUBS_FILE, []);
  subs.forEach((sub) => {
    webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        const restantes = leer(SUBS_FILE, []).filter((s) => s.endpoint !== sub.endpoint);
        escribir(SUBS_FILE, restantes);
      } else {
        console.error("Error enviando notificación:", err.message);
      }
    });
  });
}

// Ruta de prueba manual, útil al configurar el servidor
app.post("/api/probar-notificacion", (req, res) => {
  enviarATodos({ title: "Notificación de prueba 🔔", body: "Si ves esto, las notificaciones están funcionando." });
  res.json({ ok: true });
});

// --- Revisión cada minuto: ¿algún medicamento toca ahora? (hora de Chihuahua) ---
cron.schedule(
  "* * * * *",
  () => {
    const ahora = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Chihuahua",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

    const meds = leer(MEDS_FILE, []);
    meds.forEach((m) => {
      if (m.hora && m.hora === ahora) {
        enviarATodos({
          title: "Hora de tu medicamento 💊",
          body: `${m.nombre} — ${m.dosis}${m.nota ? " · " + m.nota : ""}`,
        });
      }
    });

    // Aviso de cita médica: a las 9:00am si la cita es hoy o mañana
    if (ahora === "09:00") {
      const citas = leer(CITAS_FILE, []);
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chihuahua" }).format(new Date());
      citas.forEach((c) => {
        if (c.fecha === hoy) {
          enviarATodos({ title: "Cita médica hoy 🩺", body: `${c.doctor} — ${c.lugar || ""}` });
        }
      });
    }
  },
  { timezone: "America/Chihuahua" }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Medicinas de Lilian corriendo en el puerto ${PORT}`);
});
