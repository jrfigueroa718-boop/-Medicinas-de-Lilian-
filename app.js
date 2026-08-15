const PERIODOS = {
  manana: { label: "Mañana", emoji: "🌅", color: "#C97A2B", bg: "#FBEEDE" },
  mediodia: { label: "Medio día", emoji: "☀️", color: "#3D7A5C", bg: "#E4F0E9" },
  noche: { label: "Noche", emoji: "🌙", color: "#3F5B8C", bg: "#E6EBF5" },
  prn: { label: "Si hace falta", emoji: "⚠️", color: "#B4472A", bg: "#F8E7E1" },
};

let vista = "hoy";
let medicamentos = [];
let citas = [];
let pantallaEdicion = null; // {tipo: 'med'|'cita', dato: obj|null}

function hoyISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chihuahua" }).format(new Date());
}

function formatoFechaLarga(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  return fecha.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function diasRestantes(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const hoy = new Date(hoyISO());
  fecha.setHours(0, 0, 0, 0);
  hoy.setHours(0, 0, 0, 0);
  return Math.round((fecha - hoy) / 86400000);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function tomadosHoy() {
  return JSON.parse(localStorage.getItem("tomados_" + hoyISO()) || "{}");
}
function marcarTomado(id) {
  const t = tomadosHoy();
  t[id] = !t[id];
  localStorage.setItem("tomados_" + hoyISO(), JSON.stringify(t));
  render();
}

async function cargarDatos() {
  const [rMeds, rCitas] = await Promise.all([fetch("/api/medicamentos"), fetch("/api/citas")]);
  medicamentos = await rMeds.json();
  citas = await rCitas.json();
}

function cambiarVista(v) {
  vista = v;
  pantallaEdicion = null;
  document.getElementById("tab-hoy").classList.toggle("activo", v === "hoy");
  document.getElementById("tab-editar").classList.toggle("activo", v === "editar");
  render();
}

// ---------- Notificaciones push ----------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function activarNotificaciones() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Este navegador no soporta notificaciones push.");
    return;
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return;

  const registro = await navigator.serviceWorker.ready;
  const { publicKey } = await (await fetch("/api/vapid-public-key")).json();
  if (!publicKey) {
    alert("El servidor todavía no tiene configuradas las llaves de notificaciones (VAPID). Revisa el archivo .env.");
    return;
  }
  const suscripcion = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(suscripcion),
  });
  render();
}

function notificacionesActivas() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

// ---------- Render ----------
function render() {
  const c = document.getElementById("contenedor");
  document.getElementById("fecha-hoy").textContent = formatoFechaLarga(hoyISO());

  if (pantallaEdicion) {
    c.innerHTML = pantallaEdicion.tipo === "med" ? formularioMedHTML(pantallaEdicion.dato) : formularioCitaHTML(pantallaEdicion.dato);
    return;
  }

  c.innerHTML = vista === "hoy" ? vistaHoyHTML() : vistaEditarHTML();
  if (vista === "editar") ligarEventosEditar();
  if (vista === "hoy") ligarEventosHoy();
}

function vistaHoyHTML() {
  const tomados = tomadosHoy();
  const futuras = citas.map((c) => ({ ...c, dias: diasRestantes(c.fecha) })).filter((c) => c.dias >= 0).sort((a, b) => a.dias - b.dias);
  const proxima = futuras[0];

  let html = "";
  if (!notificacionesActivas()) {
    html += `<button class="aviso-permiso" id="btn-activar-noti">🔔 Activar avisos de medicamentos en este teléfono</button>`;
  }
  if (proxima) {
    const texto = proxima.dias === 0 ? "— ¡hoy!" : proxima.dias === 1 ? "— mañana" : `— en ${proxima.dias} días`;
    html += `
      <div class="tarjeta-cita">
        <div class="cita-label">Próxima cita ${texto}</div>
        <div class="cita-fecha">${formatoFechaLarga(proxima.fecha)}</div>
        <div>${proxima.doctor}</div>
        ${proxima.lugar ? `<div style="font-size:13px;opacity:.85">${proxima.lugar}</div>` : ""}
        ${proxima.nota ? `<div style="font-size:13px;opacity:.85;margin-top:4px">📋 ${proxima.nota}</div>` : ""}
      </div>`;
  }

  ["manana", "mediodia", "noche", "prn"].forEach((g) => {
    const meds = medicamentos.filter((m) => m.periodo === g);
    if (meds.length === 0) return;
    const p = PERIODOS[g];
    html += `<div class="grupo-titulo" style="color:${p.color}">${p.emoji} ${p.label}</div>`;
    meds.forEach((m) => {
      const hecho = !!tomados[m.id];
      html += `
        <button class="med-card ${hecho ? "hecho" : ""}" data-id="${m.id}">
          <div class="circulo ${hecho ? "hecho" : ""}">${hecho ? "✓" : ""}</div>
          <div style="flex:1">
            <div class="med-nombre" style="${hecho ? "text-decoration:line-through;color:#3D7A5C" : ""}">${m.nombre}</div>
            <div class="med-dosis">${m.dosis}</div>
            ${m.nota ? `<div class="med-nota">${m.nota}</div>` : ""}
          </div>
          ${m.hora ? `<div class="med-hora" style="color:${p.color};background:${p.bg}">${m.hora}</div>` : ""}
        </button>`;
    });
  });
  return html;
}

function ligarEventosHoy() {
  const btnNoti = document.getElementById("btn-activar-noti");
  if (btnNoti) btnNoti.onclick = activarNotificaciones;
  document.querySelectorAll(".med-card").forEach((el) => {
    el.onclick = () => marcarTomado(el.dataset.id);
  });
}

function vistaEditarHTML() {
  let html = `<div class="fila-titulo"><h2>Medicamentos</h2><button class="btn btn-verde" id="btn-nuevo-med">+ Agregar</button></div>`;
  medicamentos.forEach((m) => {
    const p = PERIODOS[m.periodo];
    html += `
      <div class="item-lista">
        <div class="info">
          <div class="nombre">${m.nombre}</div>
          <div class="detalle">${m.dosis} · <span style="color:${p.color};background:${p.bg};border-radius:8px;padding:1px 6px;font-weight:600">${p.label}</span>${m.hora ? " · " + m.hora : ""}</div>
          ${m.nota ? `<div style="font-size:12px;color:#8A8271">${m.nota}</div>` : ""}
        </div>
        <button class="btn-icono" data-editar-med="${m.id}">✏️</button>
        <button class="btn-icono borrar" data-borrar-med="${m.id}">🗑️</button>
      </div>`;
  });

  html += `<div class="fila-titulo" style="margin-top:30px"><h2>Citas médicas</h2><button class="btn btn-azul" id="btn-nueva-cita">+ Agregar</button></div>`;
  if (citas.length === 0) html += `<div style="font-size:14px;color:#8A8271">No hay citas agendadas.</div>`;
  citas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((c) => {
    html += `
      <div class="item-lista">
        <div class="info">
          <div class="nombre">${formatoFechaLarga(c.fecha)}</div>
          <div class="detalle">${c.doctor}</div>
          ${c.lugar ? `<div style="font-size:12px;color:#8A8271">${c.lugar}</div>` : ""}
          ${c.nota ? `<div style="font-size:12px;color:#8A8271">${c.nota}</div>` : ""}
        </div>
        <button class="btn-icono" data-editar-cita="${c.id}">✏️</button>
        <button class="btn-icono borrar" data-borrar-cita="${c.id}">🗑️</button>
      </div>`;
  });
  return html;
}

function ligarEventosEditar() {
  document.getElementById("btn-nuevo-med").onclick = () => {
    pantallaEdicion = { tipo: "med", dato: null };
    render();
  };
  document.getElementById("btn-nueva-cita").onclick = () => {
    pantallaEdicion = { tipo: "cita", dato: null };
    render();
  };
  document.querySelectorAll("[data-editar-med]").forEach((el) => {
    el.onclick = () => {
      pantallaEdicion = { tipo: "med", dato: medicamentos.find((m) => m.id === el.dataset.editarMed) };
      render();
    };
  });
  document.querySelectorAll("[data-borrar-med]").forEach((el) => {
    el.onclick = async () => {
      await fetch("/api/medicamentos/" + el.dataset.borrarMed, { method: "DELETE" });
      await cargarDatos();
      render();
    };
  });
  document.querySelectorAll("[data-editar-cita]").forEach((el) => {
    el.onclick = () => {
      pantallaEdicion = { tipo: "cita", dato: citas.find((c) => c.id === el.dataset.editarCita) };
      render();
    };
  });
  document.querySelectorAll("[data-borrar-cita]").forEach((el) => {
    el.onclick = async () => {
      await fetch("/api/citas/" + el.dataset.borrarCita, { method: "DELETE" });
      await cargarDatos();
      render();
    };
  });
}

function formularioMedHTML(med) {
  const m = med || { id: uid(), nombre: "", dosis: "", periodo: "manana", nota: "", hora: "08:00" };
  const opciones = Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${m.periodo === k ? "selected" : ""}>${v.label}</option>`).join("");
  return `
    <form class="editor" id="form-med">
      <button type="button" class="volver" id="btn-volver">‹ Volver</button>
      <h2 style="font-family:'Fredoka',sans-serif">${med ? "Editar medicamento" : "Nuevo medicamento"}</h2>
      <div class="campo"><label>Nombre del medicamento</label><input id="f-nombre" value="${m.nombre}" placeholder="Ej. Atorvastatina" /></div>
      <div class="campo"><label>Dosis</label><input id="f-dosis" value="${m.dosis}" placeholder="Ej. 1 tableta (20mg)" /></div>
      <div class="campo"><label>¿Cuándo se toma?</label><select id="f-periodo">${opciones}</select></div>
      <div class="campo" id="campo-hora"><label>Hora del recordatorio</label><input type="time" id="f-hora" value="${m.hora || "08:00"}" /></div>
      <div class="campo"><label>Nota (opcional)</label><input id="f-nota" value="${m.nota || ""}" placeholder="Ej. Con el desayuno" /></div>
      <button type="submit" class="btn btn-verde" style="width:100%;justify-content:center;padding:14px;font-size:16px">Guardar</button>
    </form>`;
}

function formularioCitaHTML(cita) {
  const c = cita || { id: uid(), doctor: "", fecha: hoyISO(), lugar: "", nota: "" };
  return `
    <form class="editor" id="form-cita">
      <button type="button" class="volver" id="btn-volver">‹ Volver</button>
      <h2 style="font-family:'Fredoka',sans-serif">${cita ? "Editar cita" : "Nueva cita"}</h2>
      <div class="campo"><label>Fecha</label><input type="date" id="f-fecha" value="${c.fecha}" /></div>
      <div class="campo"><label>Doctor / especialidad</label><input id="f-doctor" value="${c.doctor}" placeholder="Ej. Dr. Carmona (Cardiólogo)" /></div>
      <div class="campo"><label>Lugar (opcional)</label><input id="f-lugar" value="${c.lugar || ""}" placeholder="Ej. Hospital Ángeles Chihuahua" /></div>
      <div class="campo"><label>Nota (opcional)</label><input id="f-nota" value="${c.nota || ""}" placeholder="Ej. Llevar laboratorio" /></div>
      <button type="submit" class="btn btn-azul" style="width:100%;justify-content:center;padding:14px;font-size:16px">Guardar</button>
    </form>`;
}

document.getElementById("contenedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "form-med") {
    const dato = pantallaEdicion.dato;
    const payload = {
      id: dato ? dato.id : uid(),
      nombre: document.getElementById("f-nombre").value.trim(),
      dosis: document.getElementById("f-dosis").value.trim(),
      periodo: document.getElementById("f-periodo").value,
      hora: document.getElementById("f-periodo").value === "prn" ? "" : document.getElementById("f-hora").value,
      nota: document.getElementById("f-nota").value.trim(),
    };
    if (!payload.nombre) return;
    if (dato) await fetch("/api/medicamentos/" + dato.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    else await fetch("/api/medicamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await cargarDatos();
    pantallaEdicion = null;
    vista = "editar";
    render();
  } else if (e.target.id === "form-cita") {
    const dato = pantallaEdicion.dato;
    const payload = {
      id: dato ? dato.id : uid(),
      fecha: document.getElementById("f-fecha").value,
      doctor: document.getElementById("f-doctor").value.trim(),
      lugar: document.getElementById("f-lugar").value.trim(),
      nota: document.getElementById("f-nota").value.trim(),
    };
    if (!payload.doctor) return;
    if (dato) await fetch("/api/citas/" + dato.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    else await fetch("/api/citas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    await cargarDatos();
    pantallaEdicion = null;
    vista = "editar";
    render();
  }
});

document.getElementById("contenedor").addEventListener("click", (e) => {
  if (e.target.id === "btn-volver") {
    pantallaEdicion = null;
    render();
  }
});

// ---------- Arranque ----------
(async function iniciar() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => console.error("Error registrando service worker:", err));
  }
  await cargarDatos();
  render();
})();
