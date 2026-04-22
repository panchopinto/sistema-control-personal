const STORAGE_KEY = "scp_neotech_v2";
const MEDS = [
  { id:"revlar_avamys", time:"07:00", alertBefore:"06:50", name:"Revlar + Avamys", detail:"Rutina respiratoria / alergias de la mañana" },
  { id:"bupropion", time:"09:00", alertBefore:"08:50", name:"Bupropión / Buxon", detail:"Foco, energía mental y constancia" },
  { id:"bilastina", time:"18:00", alertBefore:"17:50", name:"Bilastina / Blaxitec", detail:"Alergia de la tarde" },
  { id:"quetiapina", time:"23:00", alertBefore:"22:50", name:"Quetiapina", detail:"Rutina nocturna y regulación del sueño" }
];
const defaultState = {
  streak: 0,
  entries: [],
  notifications: { enabled:false, lastSent:"" },
  settings: { theme:"dark", fontScale:1 }
};
let state = loadState();
let cravingInterval = null;
let cravingRemaining = 600;

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  bindEvents();
  renderAll();
  registerServiceWorker();
  setInterval(checkMedicationAlerts, 30000);
  setInterval(renderMedicationTimeline, 60000);
  setInterval(renderMetrics, 60000);
});
function loadState(){
  try{ return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch{ return structuredClone(defaultState); }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function bindEvents(){
  document.getElementById("dailyForm").addEventListener("submit", onSaveEntry);
  document.getElementById("notifyBtn").addEventListener("click", requestNotifications);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("fontPlus").addEventListener("click", () => updateFont(0.05));
  document.getElementById("fontMinus").addEventListener("click", () => updateFont(-0.05));
  document.getElementById("startCraving").addEventListener("click", startCravingProtocol);
  document.getElementById("exportBtn").addEventListener("click", exportState);
  document.getElementById("importInput").addEventListener("change", importState);
  document.getElementById("seedBtn").addEventListener("click", loadExampleData);
  document.querySelectorAll(".quickWorkout").forEach(btn => btn.addEventListener("click", applyQuickWorkout));
  ["enfoque","sueno","ansiedad","energy","cravingLevel"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => document.getElementById(id + "Value").textContent = el.value);
  });
}
function renderAll(){
  renderMedicationTimeline();
  renderMetrics();
  renderWeeklySummary();
  renderTrainingInsights();
  renderHistory();
  renderRecommendations();
  drawTrendChart();
}
function renderMetrics(){
  document.getElementById("streakValue").textContent = state.streak || 0;
  const next = getNextMedication();
  document.getElementById("nextMedValue").textContent = next ? next.time : "--:--";
  document.getElementById("nextMedName").textContent = next ? next.name : "Sin próximas tomas";
  const summary = getWeeklySummary();
  document.getElementById("weeklyActivityValue").textContent = summary.totalActivity;
  document.getElementById("weeklyActivitySub").textContent = `${summary.bikeMinutes} min bici · ${summary.weightsMinutes} min fuerza`;

  const last = state.entries[0];
  let status = "En ajuste";
  let sub = "Completa registros para mayor precisión";
  if(last){
    const activity = (last.bikeMinutes || 0) + (last.weightsMinutes || 0);
    if(last.consumo === "no" && last.enfoque >= 6 && last.ansiedad <= 5 && activity >= 15){
      status = "En avance";
      sub = "Buen equilibrio entre foco, regulación y movimiento";
    } else if(last.consumo === "si" || last.ansiedad >= 7 || (last.cravingLevel || 0) >= 7){
      status = "Atención";
      sub = "Hoy conviene bajar carga, hidratarte y activar plan anti-craving";
    } else {
      status = "Monitoreo";
      sub = "Hay progreso, pero aún con variaciones";
    }
  }
  document.getElementById("statusValue").textContent = status;
  document.getElementById("statusSub").textContent = sub;
}
function renderWeeklySummary(){
  const wrap = document.getElementById("weeklySummaryCards");
  const s = getWeeklySummary();
  wrap.innerHTML = "";
  const cards = [
    ["🧠 Enfoque promedio", `${s.avgFocus.toFixed(1)}/10`, "Últimos 7 registros"],
    ["😴 Sueño promedio", `${s.avgSleep.toFixed(1)}/10`, "Base para recuperación"],
    ["😰 Ansiedad promedio", `${s.avgAnxiety.toFixed(1)}/10`, "Mientras más bajo, mejor"],
    ["🚴 Actividad física", `${s.totalActivity} min`, `${s.bikeMinutes} bici · ${s.weightsMinutes} fuerza`],
    ["🚫 Días limpios", `${s.cleanDays}/7`, "Sin alcohol ni cannabis"],
  ];
  cards.forEach(card => {
    wrap.insertAdjacentHTML("beforeend", `<article class="summary-card"><p class="eyebrow">${card[0]}</p><strong>${card[1]}</strong><span>${card[2]}</span></article>`);
  });
}
function getWeeklySummary(){
  const entries = state.entries.slice(0,7);
  const safeAvg = (key) => entries.length ? entries.reduce((a,b)=>a+(Number(b[key])||0),0)/entries.length : 0;
  const bikeMinutes = entries.reduce((a,b)=>a+(Number(b.bikeMinutes)||0),0);
  const weightsMinutes = entries.reduce((a,b)=>a+(Number(b.weightsMinutes)||0),0);
  return {
    avgFocus: safeAvg("enfoque"),
    avgSleep: safeAvg("sueno"),
    avgAnxiety: safeAvg("ansiedad"),
    avgEnergy: safeAvg("energy"),
    bikeMinutes,
    weightsMinutes,
    totalActivity: bikeMinutes + weightsMinutes,
    cleanDays: entries.filter(e => e.consumo === "no").length
  };
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
    if (med.id === next?.id) { badge.textContent = "Próxima"; badge.classList.add("next"); }
    else if (now > med.time) { badge.textContent = "Hoy"; badge.classList.add("done"); }
    else { badge.textContent = "Pendiente"; badge.classList.add("pending"); }
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
    bikeMinutes: Number(document.getElementById("bikeMinutes").value || 0),
    weightsMinutes: Number(document.getElementById("weightsMinutes").value || 0),
    energy: Number(document.getElementById("energy").value),
    cravingLevel: Number(document.getElementById("cravingLevel").value),
    notes: document.getElementById("notes").value.trim()
  };
  if(entry.consumo === "no") state.streak += 1; else state.streak = 0;
  state.entries.unshift(entry);
  state.entries = state.entries.slice(0, 30);
  saveState();
  renderAll();
  e.target.reset();
  resetFormDefaults();
  toast("Registro guardado correctamente.");
}
function resetFormDefaults(){
  document.getElementById("enfoque").value = 6;
  document.getElementById("sueno").value = 6;
  document.getElementById("ansiedad").value = 4;
  document.getElementById("energy").value = 6;
  document.getElementById("cravingLevel").value = 2;
  document.getElementById("bikeMinutes").value = 0;
  document.getElementById("weightsMinutes").value = 0;
  ["enfoque","sueno","ansiedad","energy","cravingLevel"].forEach(id => document.getElementById(id + "Value").textContent = document.getElementById(id).value);
}
function applyQuickWorkout(e){
  const btn = e.currentTarget;
  document.getElementById("bikeMinutes").value = Number(document.getElementById("bikeMinutes").value || 0) + Number(btn.dataset.bike || 0);
  document.getElementById("weightsMinutes").value = Number(document.getElementById("weightsMinutes").value || 0) + Number(btn.dataset.weights || 0);
  toast("Se cargó una propuesta rápida al registro de hoy.");
}
function renderTrainingInsights(){
  const wrap = document.getElementById("trainingInsights");
  const s = getWeeklySummary();
  const latest = state.entries[0];
  wrap.innerHTML = "";
  const items = [
    {
      title:"Meta mínima funcional",
      text: s.totalActivity >= 90
        ? `Muy bien: ya llevas ${s.totalActivity} min esta semana. Mantén consistencia sin sobrecargarte.`
        : `Tu meta base puede ser 90 min semanales. Hoy llevas ${s.totalActivity} min entre bici y fuerza.`
    },
    {
      title:"Uso estratégico del ejercicio",
      text: latest && (latest.cravingLevel || 0) >= 6
        ? "Con craving alto, la bici 10–20 min puede ayudarte mucho a bajar intensidad antes de decidir."
        : "Úsalo como regulador: bici para bajar ansiedad y pesas para sacar tensión acumulada."
    }
  ];
  items.forEach(item => wrap.insertAdjacentHTML("beforeend", `<article class="insight-card"><h4>${item.title}</h4><p>${item.text}</p></article>`));
}
function renderHistory(){
  const wrap = document.getElementById("historyList");
  wrap.innerHTML = "";
  if(!state.entries.length){
    wrap.innerHTML = `<div class="history-item"><strong>Aún no hay registros.</strong><span>Empieza hoy para ver tu progreso, tu entrenamiento y tus patrones.</span></div>`;
    return;
  }
  state.entries.slice(0,8).forEach(entry => {
    const riskClass = entry.consumo === "si" ? "risk" : entry.ansiedad >= 7 ? "warn" : "good";
    const riskLabel = entry.consumo === "si" ? "Hubo consumo" : entry.ansiedad >= 7 ? "Ansiedad alta" : "Día estable";
    const activity = (entry.bikeMinutes || 0) + (entry.weightsMinutes || 0);
    wrap.insertAdjacentHTML("beforeend", `
      <article class="history-item">
        <div class="history-top">
          <strong>${entry.date}</strong>
          <div class="badges">
            <span class="badge ${entry.consumo === "si" ? "risk" : "good"}">${entry.consumo === "si" ? "Consumo: sí" : "Consumo: no"}</span>
            <span class="badge">🧠 ${entry.enfoque}/10</span>
            <span class="badge">😴 ${entry.sueno}/10</span>
            <span class="badge">😰 ${entry.ansiedad}/10</span>
            <span class="badge">⚡ ${entry.energy || 0}/10</span>
            <span class="badge">🏋️ ${activity} min</span>
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
  const weekly = getWeeklySummary();
  const recs = [{
    title: "Protege tu objetivo principal",
    text: "Tu norte es estabilidad, foco y proyecto de vida. Lo que hagas hoy debería acercarte a eso, no solo aliviar 20 minutos."
  }];
  if(!latest){
    recs.push({ title:"Parte con línea base", text:"Registra al menos 3 días seguidos. Con eso el panel ya te mostrará una lectura mucho más útil." });
  } else {
    if(latest.consumo === "si") recs.push({ title:"Día de recuperación inteligente", text:"Hoy conviene bajar exigencia extra, hidratarte, comer bien y evitar quedarte solo con disparadores. Vuelve al plan hoy mismo." });
    else recs.push({ title:"Refuerza la racha", text:`Llevas ${state.streak} día(s) sin consumo. Mantén rituales de tarde-noche sin alcohol ni cannabis para cuidar sueño y claridad mental.` });
    if(latest.ansiedad >= 7) recs.push({ title:"Ansiedad alta detectada", text:"Baja estimulación: menos pantalla, respiración, ducha tibia o 10–20 min de bici. Evita decidir cansado." });
    if(latest.sueno <= 4) recs.push({ title:"Protege la noche", text:"Si el sueño viene bajo, prioriza rutina estable, luz tenue y cero alcohol. Tu siguiente día depende mucho del descanso." });
    if((latest.bikeMinutes || 0) + (latest.weightsMinutes || 0) < 15) recs.push({ title:"Activa el cuerpo a favor tuyo", text:"Hoy te ayudaría incluso una versión mínima: 10 min de bici o 15 min de fuerza para descargar tensión y mejorar foco." });
    if(weekly.totalActivity >= 90) recs.push({ title:"Buen piso físico semanal", text:"Tu actividad está apoyando tu regulación. Mantén consistencia y usa el ejercicio como herramienta, no como castigo." });
    if((latest.cravingLevel || 0) >= 6) recs.push({ title:"Craving alto: respuesta táctica", text:"No te quedes quieto negociando. Cambia de ambiente y mete una acción física breve antes de decidir." });
    if(latest.enfoque >= 7 && latest.consumo === "no") recs.push({ title:"Ventana de alto rendimiento", text:"Hoy es buen día para cerrar algo concreto del liceo o de tus proyectos. Usa ese impulso en algo que quede terminado." });
  }
  recs.slice(0,6).forEach(rec => wrap.insertAdjacentHTML("beforeend", `<article class="rec-card"><h4>${rec.title}</h4><p>${rec.text}</p></article>`));
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
    ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + w, y); ctx.stroke();
    ctx.fillStyle = getCSS("--muted"); ctx.font = "12px Inter, sans-serif"; ctx.fillText(String(i), 12, y + 4);
  }
  if(!data.length){
    ctx.fillStyle = getCSS("--muted"); ctx.font = "600 16px Inter, sans-serif"; ctx.fillText("Aún no hay datos para graficar.", margin.left, margin.top + 22); return;
  }
  data.forEach((_, i) => {
    const x = margin.left + (i/(Math.max(data.length-1,1))) * w;
    ctx.fillStyle = getCSS("--muted"); ctx.font = "12px Inter, sans-serif"; ctx.fillText(`D${i+1}`, x - 8, margin.top + h + 20);
  });
  drawLine(ctx, data.map(x=>x.enfoque), "#4cc9f0", margin, w, h, true);
  drawLine(ctx, data.map(x=>x.sueno), "#22c55e", margin, w, h, true);
  drawLine(ctx, data.map(x=>x.ansiedad), "#ef4444", margin, w, h, true);
  drawBars(ctx, data.map(x=>((Number(x.bikeMinutes)||0)+(Number(x.weightsMinutes)||0))/3), "rgba(245,158,11,.22)", margin, w, h);
  drawLegend(ctx, cssWidth - 315, 26, [
    ["Enfoque", "#4cc9f0"], ["Sueño", "#22c55e"], ["Ansiedad", "#ef4444"], ["Actividad", "#f59e0b"]
  ]);
}
function drawLine(ctx, values, color, margin, w, h, points=false){
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
  values.forEach((value, i) => {
    const x = margin.left + (i/(Math.max(values.length-1,1))) * w;
    const y = margin.top + h - (value/10) * h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }); ctx.stroke();
  if(points){
    values.forEach((value, i) => {
      const x = margin.left + (i/(Math.max(values.length-1,1))) * w;
      const y = margin.top + h - (value/10) * h;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,y,4.5,0,Math.PI*2); ctx.fill();
    });
  }
}
function drawBars(ctx, values, color, margin, w, h){
  ctx.fillStyle = color;
  const barWidth = Math.max(18, w / Math.max(values.length * 3, 1));
  values.forEach((value, i) => {
    const x = margin.left + (i/(Math.max(values.length-1,1))) * w - barWidth/2;
    const barHeight = (Math.min(value,10)/10) * h;
    const y = margin.top + h - barHeight;
    ctx.fillRect(x, y, barWidth, barHeight);
  });
}
function drawLegend(ctx, x, y, items){
  items.forEach((item, idx) => {
    ctx.fillStyle = item[1]; ctx.fillRect(x, y + idx*22, 14, 14);
    ctx.fillStyle = getCSS("--text"); ctx.font = "12px Inter, sans-serif"; ctx.fillText(item[0], x + 22, y + 12 + idx*22);
  });
}
function requestNotifications(){
  if(!("Notification" in window)){ toast("Este navegador no soporta notificaciones."); return; }
  Notification.requestPermission().then(permission => {
    state.notifications.enabled = permission === "granted"; saveState();
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
    if(now === med.alertBefore && state.notifications.lastSent !== beforeKey){ sendNotification("⏰ Recordatorio previo", `${med.name} en 10 minutos.`); state.notifications.lastSent = beforeKey; saveState(); }
    if(now === med.time && state.notifications.lastSent !== atKey){ sendNotification("💊 Hora de medicación", `Tomar ${med.name}.`); state.notifications.lastSent = atKey; saveState(); }
  });
}
function sendNotification(title, body){ try{ new Notification(title, { body, icon: "assets/icon.svg" }); }catch(e){ console.error(e); } }
function getNextMedication(){ const now = timeNow(); return MEDS.find(m => m.time >= now) || MEDS[0]; }
function timeNow(){ return new Date().toTimeString().slice(0,5); }
function startCravingProtocol(){
  clearInterval(cravingInterval); cravingRemaining = 600; updateCravingUI(); highlightStep(0);
  document.getElementById("timerState").textContent = "Fase 1: espera sin decidir";
  document.getElementById("timerHint").textContent = "Tu trabajo ahora es no responder en automático.";
  cravingInterval = setInterval(() => {
    cravingRemaining--;
    if(cravingRemaining === 420){ highlightStep(1); document.getElementById("timerState").textContent = "Fase 2: cambia de ambiente"; document.getElementById("timerHint").textContent = "Muévete del lugar donde apareció el impulso."; }
    else if(cravingRemaining === 240){ highlightStep(2); document.getElementById("timerState").textContent = "Fase 3: mueve el cuerpo"; document.getElementById("timerHint").textContent = "Camina, usa la bici o haz una tarea física breve."; }
    else if(cravingRemaining === 60){ highlightStep(3); document.getElementById("timerState").textContent = "Fase 4: decide con cabeza fría"; document.getElementById("timerHint").textContent = "El impulso ya bajó. Elige según tu meta, no según el impulso."; }
    if(cravingRemaining <= 0){ clearInterval(cravingInterval); document.getElementById("timerState").textContent = "Protocolo completo"; document.getElementById("timerHint").textContent = "Buen trabajo. Ahora vuelve a una acción útil y concreta."; cravingRemaining = 0; }
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
function highlightStep(index){ document.querySelectorAll("#cravingSteps li").forEach((li, i) => li.classList.toggle("active", i === index)); }
function toggleTheme(){ state.settings.theme = state.settings.theme === "dark" ? "light" : "dark"; saveState(); applyTheme(); drawTrendChart(); }
function applyTheme(){ document.documentElement.setAttribute("data-theme", state.settings.theme); document.documentElement.style.setProperty("--font-scale", String(state.settings.fontScale || 1)); }
function updateFont(delta){ const next = Math.max(0.9, Math.min(1.2, (state.settings.fontScale || 1) + delta)); state.settings.fontScale = Number(next.toFixed(2)); saveState(); applyTheme(); }
function exportState(){ const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "sistema-control-personal-backup.json"; link.click(); URL.revokeObjectURL(link.href); }
function importState(e){
  const file = e.target.files?.[0]; if(!file) return;
  const reader = new FileReader(); reader.onload = () => {
    try{ state = { ...defaultState, ...JSON.parse(reader.result) }; saveState(); applyTheme(); renderAll(); toast("Respaldo importado correctamente."); }
    catch{ toast("El archivo no es válido."); }
  }; reader.readAsText(file);
}
function loadExampleData(){
  state.entries = [
    { date: "2026-04-22 22:10", consumo: "no", enfoque: 8, sueno: 7, ansiedad: 4, bikeMinutes: 20, weightsMinutes: 15, energy: 7, cravingLevel: 2, notes: "Día estable, avancé en proyectos y cerré tareas del liceo."},
    { date: "2026-04-21 21:42", consumo: "no", enfoque: 6, sueno: 6, ansiedad: 5, bikeMinutes: 15, weightsMinutes: 0, energy: 6, cravingLevel: 3, notes: "Algo cansado, pero sin consumo."},
    { date: "2026-04-20 23:05", consumo: "si", enfoque: 3, sueno: 4, ansiedad: 7, bikeMinutes: 0, weightsMinutes: 0, energy: 3, cravingLevel: 8, notes: "Hubo disparador en la tarde."},
    { date: "2026-04-19 21:10", consumo: "no", enfoque: 7, sueno: 7, ansiedad: 3, bikeMinutes: 30, weightsMinutes: 20, energy: 8, cravingLevel: 1, notes: "Buen enfoque y buen bloque de entrenamiento."}
  ];
  state.streak = 2; saveState(); renderAll(); toast("Se cargó un ejemplo para que veas el panel.");
}
function registerServiceWorker(){ if("serviceWorker" in navigator){ navigator.serviceWorker.register("service-worker.js").catch(console.error); } }
function toast(message){
  const node = document.createElement("div"); node.textContent = message;
  Object.assign(node.style, { position:"fixed", right:"18px", bottom:"18px", zIndex:9999, background:"rgba(10,18,34,.94)", color:"white", padding:"12px 16px", borderRadius:"14px", border:"1px solid rgba(255,255,255,.12)", boxShadow:"0 20px 40px rgba(0,0,0,.35)", fontWeight:"700" });
  document.body.appendChild(node); setTimeout(() => node.remove(), 2200);
}
function getCSS(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
