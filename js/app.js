
const STORAGE_KEY = "scp_neotech_v1";
const MEDS = [
  { id: "revlar", time: "07:00", alertBefore: "06:50", name: "Revlar", detail: "Mañana · asma" },
  { id: "avamys", time: "07:00", alertBefore: "06:50", name: "Avamys", detail: "Mañana · alergias" },
  { id: "bupropion", time: "09:00", alertBefore: "08:50", name: "Bupropión / Buxon", detail: "Mañana · foco y energía" },
  { id: "bilastina", time: "18:00", alertBefore: "17:50", name: "Bilastina / Blaxitec", detail: "Tarde · alergias" },
  { id: "quetiapina", time: "23:00", alertBefore: "22:50", name: "Quetiapina", detail: "Noche · sueño y regulación" }
];

const defaultState = {
  settings: { theme: "dark", fontScale: 1 },
  streak: 0,
  entries: [],
  notifications: { enabled: false, lastSent: "" }
};

let state = loadState();
let cravingInterval = null;
let cravingRemaining = 600;

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  renderAll();
  bindUI();
  registerServiceWorker();
  setInterval(checkMedicationAlerts, 15000);
  setInterval(renderMedicationTimeline, 30000);
});

function loadState(){
  try {
    return { ...defaultState, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) };
  } catch {
    return structuredClone(defaultState);
  }
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function bindUI(){
  document.getElementById("dailyForm").addEventListener("submit", onSaveEntry);
  document.getElementById("notifyBtn").addEventListener("click", requestNotifications);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("fontPlus").addEventListener("click", () => updateFont(0.05));
  document.getElementById("fontMinus").addEventListener("click", () => updateFont(-0.05));
  document.getElementById("startCraving").addEventListener("click", startCravingProtocol);
  document.getElementById("exportBtn").addEventListener("click", exportState);
  document.getElementById("importInput").addEventListener("change", importState);
  document.getElementById("seedBtn").addEventListener("click", loadExampleData);

  ["enfoque", "sueno", "ansiedad"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => document.getElementById(id + "Value").textContent = el.value);
  });
}
function renderAll(){
  renderMedicationTimeline();
  renderMetrics();
  renderHistory();
  renderRecommendations();
  drawTrendChart();
}
function renderMetrics(){
  document.getElementById("streakValue").textContent = state.streak || 0;

  const next = getNextMedication();
  document.getElementById("nextMedValue").textContent = next ? next.time : "--:--";
  document.getElementById("nextMedName").textContent = next ? next.name : "Sin próximas tomas";

  const last = state.entries[0];
  let status = "En ajuste";
  let sub = "Completa registros para ver tu patrón";
  if(last){
    if(last.consumo === "no" && last.enfoque >= 6 && last.ansiedad <= 5){
      status = "En avance";
      sub = "Buen equilibrio entre foco y regulación";
    } else if(last.consumo === "si" || last.ansiedad >= 7){
      status = "Atención";
      sub = "Hoy conviene bajar carga, hidratarte y evitar disparadores";
    } else {
      status = "Monitoreo";
      sub = "Hay progreso, pero aún con variaciones";
    }
  }
  document.getElementById("statusValue").textContent = status;
  document.getElementById("statusSub").textContent = sub;
}
function renderMedicationTimeline(){
  const wrap = document.getElementById("medList");
  wrap.innerHTML = "";
  const next = getNextMedication();
  const now = timeNow();
  MEDS.forEach((med) => {
    const node = document.getElementById("medTemplate").content.firstElementChild.cloneNode(true);
    node.querySelector(".med-time").textContent = med.time;
    node.querySelector(".med-info h4").textContent = med.name;
    node.querySelector(".med-info p").textContent = med.detail;

    const badge = node.querySelector(".med-status");
    if (med.id === next?.id) {
      badge.textContent = "Próxima";
      badge.classList.add("next");
    } else if (now > med.time) {
      badge.textContent = "Hoy";
      badge.classList.add("done");
    } else {
      badge.textContent = "Pendiente";
      badge.classList.add("pending");
    }
    wrap.appendChild(node);
  });
}
function onSaveEntry(e){
  e.preventDefault();
  const entry = {
    date: new Date().toLocaleString("es-CL"),
    consumo: document.getElementById("consumo").value,
    enfoque: Number(document.getElementById("enfoque").value),
    sueno: Number(document.getElementById("sueno").value),
    ansiedad: Number(document.getElementById("ansiedad").value),
    notes: document.getElementById("notes").value.trim()
  };

  if(entry.consumo === "no"){
    state.streak += 1;
  } else {
    state.streak = 0;
  }

  state.entries.unshift(entry);
  state.entries = state.entries.slice(0, 30);
  saveState();
  renderAll();
  e.target.reset();
  document.getElementById("enfoque").value = 6;
  document.getElementById("sueno").value = 6;
  document.getElementById("ansiedad").value = 4;
  ["enfoque","sueno","ansiedad"].forEach(id => document.getElementById(id + "Value").textContent = document.getElementById(id).value);
  toast("Registro guardado correctamente.");
}
function renderHistory(){
  const wrap = document.getElementById("historyList");
  wrap.innerHTML = "";
  if(!state.entries.length){
    wrap.innerHTML = `<div class="history-item"><strong>Aún no hay registros.</strong><span>Empieza hoy para ver tu progreso y tus patrones.</span></div>`;
    return;
  }
  state.entries.slice(0,8).forEach(entry => {
    const riskClass = entry.consumo === "si" ? "risk" : entry.ansiedad >= 7 ? "warn" : "good";
    const riskLabel = entry.consumo === "si" ? "Hubo consumo" : entry.ansiedad >= 7 ? "Ansiedad alta" : "Día estable";
    wrap.insertAdjacentHTML("beforeend", `
      <article class="history-item">
        <div class="history-top">
          <strong>${entry.date}</strong>
          <div class="badges">
            <span class="badge ${entry.consumo === "si" ? "risk" : "good"}">${entry.consumo === "si" ? "Consumo: sí" : "Consumo: no"}</span>
            <span class="badge">🧠 ${entry.enfoque}/10</span>
            <span class="badge">😴 ${entry.sueno}/10</span>
            <span class="badge">😰 ${entry.ansiedad}/10</span>
            <span class="badge ${riskClass}">${riskLabel}</span>
          </div>
        </div>
        <small>${entry.notes || "Sin observaciones."}</small>
      </article>
    `);
  });
}
function renderRecommendations(){
  const wrap = document.getElementById("recommendations");
  wrap.innerHTML = "";
  const latest = state.entries[0];

  const recs = [];
  recs.push({
    title: "Protege tu objetivo principal",
    text: "Tu norte es estabilidad, foco y proyecto de vida. Cualquier decisión de hoy debería acercarte a eso, no solo calmar 20 minutos."
  });

  if(!latest){
    recs.push({
      title: "Parte con una línea base",
      text: "Registra al menos 3 días seguidos. Con eso el panel ya te mostrará tendencias mucho más útiles."
    });
  } else {
    if(latest.consumo === "si"){
      recs.push({
        title: "Día de recuperación inteligente",
        text: "Hoy conviene bajar exigencia extra, hidratarte, comer bien y evitar quedar solo con disparadores. No te castigues: vuelve al plan hoy mismo."
      });
    } else {
      recs.push({
        title: "Refuerza la racha",
        text: `Llevas ${state.streak} día(s) sin consumo. Mantén rituales de tarde-noche sin alcohol ni cannabis para cuidar el sueño y la claridad mental.`
      });
    }

    if(latest.ansiedad >= 7){
      recs.push({
        title: "Ansiedad alta detectada",
        text: "Conviene bajar estimulación: menos pantalla, respiración corta guiada, ducha tibia o caminata. Evita discutir o tomar decisiones grandes cansado."
      });
    }
    if(latest.sueno <= 4){
      recs.push({
        title: "Protege la noche",
        text: "Si el sueño viene bajo, prioriza rutina estable, luz tenue y cero alcohol. Tu siguiente día depende mucho más del descanso que de la fuerza de voluntad."
      });
    }
    if(latest.enfoque <= 4){
      recs.push({
        title: "Modo enfoque mínimo viable",
        text: "No busques perfección hoy. Elige 1 tarea del liceo y 1 tarea personal, ambas pequeñas, y ciérralas completas."
      });
    }
    if(latest.enfoque >= 7 && latest.consumo === "no"){
      recs.push({
        title: "Aprovecha ventana de alto rendimiento",
        text: "Hoy es buen día para avanzar en un proyecto con valor real: planificación, documentación o diseño. Usa ese impulso en algo que quede hecho."
      });
    }
  }

  recs.slice(0,4).forEach(rec => {
    wrap.insertAdjacentHTML("beforeend", `
      <article class="rec-card">
        <h4>${rec.title}</h4>
        <p>${rec.text}</p>
      </article>
    `);
  });
}
function drawTrendChart(){
  const canvas = document.getElementById("trendCanvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 900;
  const cssHeight = 330;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0,0,cssWidth,cssHeight);

  const data = [...state.entries].slice(0,7).reverse();
  const margin = { top: 24, right: 18, bottom: 40, left: 44 };
  const w = cssWidth - margin.left - margin.right;
  const h = cssHeight - margin.top - margin.bottom;

  ctx.strokeStyle = getCSS("--line");
  ctx.lineWidth = 1;
  for(let i=0; i<=10; i++){
    const y = margin.top + h - (i/10)*h;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + w, y);
    ctx.stroke();
    ctx.fillStyle = getCSS("--muted");
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(String(i), 12, y + 4);
  }

  if(!data.length){
    ctx.fillStyle = getCSS("--muted");
    ctx.font = "600 16px Inter, sans-serif";
    ctx.fillText("Aún no hay datos para graficar.", margin.left, margin.top + 22);
    return;
  }

  const labels = data.map((_, i) => `D${i+1}`);
  labels.forEach((label, i) => {
    const x = margin.left + (i/(Math.max(labels.length-1,1))) * w;
    ctx.fillStyle = getCSS("--muted");
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(label, x - 8, margin.top + h + 20);
  });

  drawLine(ctx, data.map(x=>x.enfoque), "#4cc9f0", margin, w, h);
  drawLine(ctx, data.map(x=>x.sueno), "#22c55e", margin, w, h);
  drawLine(ctx, data.map(x=>x.ansiedad), "#ef4444", margin, w, h);

  drawLegend(ctx, cssWidth - 270, 26, [
    ["Enfoque", "#4cc9f0"],
    ["Sueño", "#22c55e"],
    ["Ansiedad", "#ef4444"]
  ]);
}
function drawLine(ctx, values, color, margin, w, h){
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach((value, i) => {
    const x = margin.left + (i/(Math.max(values.length-1,1))) * w;
    const y = margin.top + h - (value/10) * h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  values.forEach((value, i) => {
    const x = margin.left + (i/(Math.max(values.length-1,1))) * w;
    const y = margin.top + h - (value/10) * h;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x,y,4.5,0,Math.PI*2);
    ctx.fill();
  });
}
function drawLegend(ctx, x, y, items){
  items.forEach((item, idx) => {
    ctx.fillStyle = item[1];
    ctx.fillRect(x, y + idx*22, 14, 14);
    ctx.fillStyle = getCSS("--text");
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(item[0], x + 22, y + 12 + idx*22);
  });
}
function requestNotifications(){
  if(!("Notification" in window)){
    toast("Este navegador no soporta notificaciones.");
    return;
  }
  Notification.requestPermission().then(permission => {
    state.notifications.enabled = permission === "granted";
    saveState();
    toast(permission === "granted" ? "Notificaciones activadas." : "No se concedieron notificaciones.");
  });
}
function checkMedicationAlerts(){
  if(!state.notifications.enabled || Notification.permission !== "granted") return;
  const now = timeNow();
  const todayKey = new Date().toLocaleDateString("sv-SE");

  MEDS.forEach(med => {
    const beforeKey = `${todayKey}_${med.id}_before_${med.alertBefore}`;
    const atKey = `${todayKey}_${med.id}_time_${med.time}`;

    if(now === med.alertBefore && state.notifications.lastSent !== beforeKey){
      sendNotification("⏰ Recordatorio previo", `${med.name} en 10 minutos.`);
      state.notifications.lastSent = beforeKey;
      saveState();
    }
    if(now === med.time && state.notifications.lastSent !== atKey){
      sendNotification("💊 Hora de medicación", `Tomar ${med.name}.`);
      state.notifications.lastSent = atKey;
      saveState();
    }
  });
}
function sendNotification(title, body){
  try{
    new Notification(title, { body, icon: "assets/icon.svg" });
  }catch(e){
    console.error(e);
  }
}
function getNextMedication(){
  const now = timeNow();
  return MEDS.find(m => m.time >= now) || MEDS[0];
}
function timeNow(){
  const d = new Date();
  return d.toTimeString().slice(0,5);
}
function startCravingProtocol(){
  clearInterval(cravingInterval);
  cravingRemaining = 600;
  updateCravingUI();
  highlightStep(0);
  document.getElementById("timerState").textContent = "Fase 1: espera sin decidir";
  document.getElementById("timerHint").textContent = "Tu trabajo ahora es no responder en automático.";
  cravingInterval = setInterval(() => {
    cravingRemaining--;
    if(cravingRemaining === 420){
      highlightStep(1);
      document.getElementById("timerState").textContent = "Fase 2: cambia de ambiente";
      document.getElementById("timerHint").textContent = "Muévete del lugar donde apareció el impulso.";
    } else if(cravingRemaining === 240){
      highlightStep(2);
      document.getElementById("timerState").textContent = "Fase 3: mueve el cuerpo";
      document.getElementById("timerHint").textContent = "Camina, sube escaleras o haz una tarea física breve.";
    } else if(cravingRemaining === 60){
      highlightStep(3);
      document.getElementById("timerState").textContent = "Fase 4: decide con cabeza fría";
      document.getElementById("timerHint").textContent = "El impulso ya bajó. Elige según tu meta, no según el impulso.";
    }
    if(cravingRemaining <= 0){
      clearInterval(cravingInterval);
      document.getElementById("timerState").textContent = "Protocolo completo";
      document.getElementById("timerHint").textContent = "Buen trabajo. Ahora vuelve a una acción útil y concreta.";
      cravingRemaining = 0;
    }
    updateCravingUI();
  }, 1000);
}
function updateCravingUI(){
  const min = String(Math.floor(cravingRemaining / 60)).padStart(2,"0");
  const sec = String(cravingRemaining % 60).padStart(2,"0");
  document.getElementById("timerText").textContent = `${min}:${sec}`;
  const degrees = ((600 - cravingRemaining) / 600) * 360;
  document.querySelector(".timer-circle").style.background = `conic-gradient(${getCSS("--accent")} ${degrees}deg, rgba(255,255,255,.08) ${degrees}deg)`;
}
function highlightStep(index){
  document.querySelectorAll("#cravingSteps li").forEach((li, i) => li.classList.toggle("active", i === index));
}
function toggleTheme(){
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
  drawTrendChart();
}
function applyTheme(){
  document.documentElement.setAttribute("data-theme", state.settings.theme);
  document.documentElement.style.setProperty("--font-scale", String(state.settings.fontScale || 1));
}
function updateFont(delta){
  const next = Math.max(0.9, Math.min(1.2, (state.settings.fontScale || 1) + delta));
  state.settings.fontScale = Number(next.toFixed(2));
  saveState();
  applyTheme();
}
function exportState(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "sistema-control-personal-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
function importState(e){
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      state = { ...defaultState, ...JSON.parse(reader.result) };
      saveState();
      applyTheme();
      renderAll();
      toast("Respaldo importado correctamente.");
    }catch{
      toast("El archivo no es válido.");
    }
  };
  reader.readAsText(file);
}
function loadExampleData(){
  state.entries = [
    { date: "2026-04-20 22:10", consumo: "no", enfoque: 7, sueno: 6, ansiedad: 4, notes: "Día exigente, pero estable."},
    { date: "2026-04-19 21:42", consumo: "no", enfoque: 6, sueno: 5, ansiedad: 5, notes: "Algo cansado, sin consumo."},
    { date: "2026-04-18 23:05", consumo: "si", enfoque: 3, sueno: 4, ansiedad: 7, notes: "Hubo disparador en la tarde."},
    { date: "2026-04-17 21:10", consumo: "no", enfoque: 8, sueno: 7, ansiedad: 3, notes: "Buen enfoque en trabajo y proyectos."}
  ];
  state.streak = 2;
  saveState();
  renderAll();
  toast("Se cargó un ejemplo para que veas el panel.");
}
function registerServiceWorker(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
}
function toast(message){
  const node = document.createElement("div");
  node.textContent = message;
  Object.assign(node.style, {
    position:"fixed", right:"18px", bottom:"18px", zIndex:9999,
    background:"rgba(10,18,34,.94)", color:"white", padding:"12px 16px",
    borderRadius:"14px", border:"1px solid rgba(255,255,255,.12)",
    boxShadow:"0 20px 40px rgba(0,0,0,.35)", fontWeight:"700"
  });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2200);
}
function getCSS(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
