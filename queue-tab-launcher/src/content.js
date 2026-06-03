/**
 * content.js — Queue Tab Launcher v1.6.0
 * Content Script: observa el DOM, detecta colas, inyecta datos en Call Notes.
 *
 * @author Ignacio
 * @built-with Claude Sonnet 4.6 (Anthropic)
 */

let config    = null;
let observer  = null;
let lastQueue = null; // última cola enviada — null = sin llamada activa

// ── Variables del picker ──────────────────────────────────────────────
let pickerMode    = false;
let pickerTarget  = null; // 'queue' | 'phone' | 'name'
let pickerOverlay = null;
let pickerHighEl  = null; // elemento actualmente resaltado

// Colores por target (coinciden con el diseño del popup)
const PICKER_COLORS = {
  queue: "#ff4d6d",
  phone: "#7b61ff",
  name:  "#00d68f",
};
const PICKER_LABELS = {
  queue: "🎯 Hacé clic en el elemento que muestra el nombre de la cola",
  phone: "📞 Hacé clic en el elemento que muestra el teléfono",
  name:  "👤 Hacé clic en el elemento que muestra el nombre del llamante",
};

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get("config");
  config = stored.config || null;

  if (config?.selector) startObserver();

  // Reaccionar a cambios de configuración en caliente
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.config) {
      config = changes.config.newValue || null;
      restartObserver();
    }
  });
}

// ── MutationObserver ──────────────────────────────────────────────────
function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => checkQueue());
  observer.observe(document.body, {
    childList:     true,
    subtree:       true,
    characterData: true,
  });

  checkQueue(); // verificación inmediata al cargar
}

function restartObserver() {
  if (observer) { observer.disconnect(); observer = null; }
  if (config?.selector) startObserver();
}

// ── Detección de cola ─────────────────────────────────────────────────
function readText(selector) {
  if (!selector) return null;
  try {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() || null : null;
  } catch { return null; }
}

function checkQueue() {
  if (!config?.selector) return;

  const queueName = readText(config.selector);

  // Sin llamada activa → resetear para que la próxima llegue limpia
  if (!queueName) {
    lastQueue = null;
    return;
  }

  // Enviar solo si la cola cambió respecto a la última detectada
  if (queueName === lastQueue) return;

  lastQueue = queueName;

  const phone      = readText(config.phone_selector) || null;
  const callerName = readText(config.name_selector)  || null;

  chrome.runtime.sendMessage({
    type: "QUEUE_DETECTED",
    queueName,
    phone,
    callerName,
  }).catch(() => {});
}

// ── Picker: arrancar modo captura ─────────────────────────────────────
function startPickerMode(target) {
  if (pickerMode) stopPickerMode();
  pickerMode   = true;
  pickerTarget = target;

  const color = PICKER_COLORS[target] || "#7b61ff";
  const label = PICKER_LABELS[target] || "Hacé clic en el elemento";

  pickerOverlay = document.createElement("div");
  pickerOverlay.id = "__qtl_picker_overlay__";
  pickerOverlay.innerHTML = `
    <span style="font-size:12px;font-weight:600;font-family:'DM Mono','Courier New',monospace;">${label}</span>
    <button id="__qtl_picker_cancel__" style="
      margin-left:14px;padding:3px 11px;border-radius:5px;
      background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
      color:#fff;cursor:pointer;font-size:11px;font-family:inherit;">
      Cancelar
    </button>`;
  Object.assign(pickerOverlay.style, {
    position:"fixed", top:"0", left:"0", right:"0", zIndex:"2147483647",
    background:`linear-gradient(90deg,#0d0d15,${color}22)`,
    borderBottom:`2px solid ${color}`,
    color:"#fff", padding:"10px 18px",
    display:"flex", alignItems:"center",
    fontFamily:"'DM Mono','Courier New',monospace",
    boxShadow:"0 2px 20px rgba(0,0,0,0.5)",
  });
  document.body.appendChild(pickerOverlay);

  document.getElementById("__qtl_picker_cancel__").addEventListener("click", (e) => {
    e.stopPropagation();
    stopPickerMode();
    chrome.runtime.sendMessage({ type: "QTL_PICKER_CANCELLED" });
  });

  document.body.style.cursor = "crosshair";
  document.addEventListener("mouseover", onPickerMouseOver, true);
  document.addEventListener("mouseout",  onPickerMouseOut,  true);
  document.addEventListener("click",     onPickerClick,     true);
}

function stopPickerMode() {
  pickerMode   = false;
  pickerTarget = null;
  document.body.style.cursor = "";
  if (pickerOverlay) { pickerOverlay.remove(); pickerOverlay = null; }
  clearPickerHighlight();
  document.removeEventListener("mouseover", onPickerMouseOver, true);
  document.removeEventListener("mouseout",  onPickerMouseOut,  true);
  document.removeEventListener("click",     onPickerClick,     true);
}

// ── Picker: highlight al hover ────────────────────────────────────────
function onPickerMouseOver(e) {
  if (!pickerMode || pickerOverlay?.contains(e.target)) return;
  clearPickerHighlight();
  pickerHighEl = e.target;
  pickerHighEl.__qtlOldOutline = pickerHighEl.style.outline;
  pickerHighEl.__qtlOldOffset  = pickerHighEl.style.outlineOffset;
  const color = PICKER_COLORS[pickerTarget] || "#7b61ff";
  pickerHighEl.style.outline       = `2px solid ${color}`;
  pickerHighEl.style.outlineOffset = "2px";
}

function onPickerMouseOut() {
  if (pickerMode) clearPickerHighlight();
}

function clearPickerHighlight() {
  if (!pickerHighEl) return;
  pickerHighEl.style.outline       = pickerHighEl.__qtlOldOutline || "";
  pickerHighEl.style.outlineOffset = pickerHighEl.__qtlOldOffset  || "";
  pickerHighEl = null;
}

// ── Picker: click → capturar selector ────────────────────────────────
function onPickerClick(e) {
  if (!pickerMode || pickerOverlay?.contains(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  const el       = e.target;
  const selector = buildSelector(el);
  const target   = pickerTarget;
  stopPickerMode();
  chrome.runtime.sendMessage({ type: "QTL_PICKER_CAPTURED", target, selector });
  showPickerToast(`✓ Selector capturado`);
}

// ── buildSelector: CSS selector más específico posible ────────────────
function buildSelector(el) {
  if (el.id) {
    const esc = CSS.escape(el.id);
    if (document.querySelectorAll(`#${esc}`).length === 1) return `#${esc}`;
  }
  const aria = el.getAttribute("aria-label");
  if (aria) {
    const s = `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
    if (document.querySelectorAll(s).length === 1) return s;
  }
  const tid = el.getAttribute("data-testid");
  if (tid) {
    const s = `[data-testid="${tid}"]`;
    if (document.querySelectorAll(s).length === 1) return s;
  }
  if (el.classList.length > 0) {
    const cls = el.tagName.toLowerCase() + "." + [...el.classList].map(c => CSS.escape(c)).join(".");
    if (document.querySelectorAll(cls).length === 1) return cls;
  }
  return buildPathSelector(el);
}

function buildPathSelector(el) {
  const parts = [];
  let cur = el;
  while (cur && cur !== document.body) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
    const sibs = Array.from(cur.parentElement?.children || []).filter(s => s.tagName === cur.tagName);
    if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
    parts.unshift(part);
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

// ── Toast ligero del picker ───────────────────────────────────────────
function showPickerToast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position:"fixed", bottom:"20px", left:"50%",
    transform:"translateX(-50%) translateY(8px)",
    zIndex:"2147483647",
    background:"#0d0d15", color:"#00d68f",
    border:"1px solid rgba(0,214,143,0.3)",
    padding:"7px 15px", borderRadius:"7px",
    fontFamily:"'DM Mono','Courier New',monospace", fontSize:"11px",
    boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
    opacity:"0", transition:"opacity 0.25s,transform 0.25s", whiteSpace:"nowrap",
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(0)"; });
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 2500);
}

// ── Mensajes entrantes ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // Ping desde popup
  if (message.type === "QTL_PING") {
    sendResponse({ ok: true, listening: !!(config?.selector) });
    return true;
  }

  // Iniciar modo picker
  if (message.type === "QTL_START_PICKER") {
    startPickerMode(message.target);
    sendResponse({ ok: true });
    return true;
  }

  // Trigger manual — lee los selectores del DOM y dispara como detección real
  if (message.type === "QTL_MANUAL_TRIGGER") {
    if (!config?.selector) {
      sendResponse({ ok: false, reason: "sin config cargada" });
      return true;
    }
    const queueName = readText(config.selector);
    if (!queueName) {
      sendResponse({ ok: false, reason: `selector "${config.selector}" vacío o no encontrado` });
      showPickerToast("⚠ No se encontró cola en la página");
      return true;
    }
    // Forzar re-envío reseteando el estado
    lastQueue = null;
    checkQueue();
    showPickerToast(`⚡ Trigger manual: ${queueName}`);
    sendResponse({ ok: true, queueName });
    return true;
  }

  // Cancelar picker (desde popup)
  if (message.type === "QTL_CANCEL_PICKER") {
    stopPickerMode();
    sendResponse({ ok: true });
    return true;
  }

  // Background → inyectar datos de llamada en call-notes.html
  if (message.type === "QTL_INJECT_CALL") {
    window.postMessage({
      type:  "QTL_NEW_CALL",
      queue: message.queue || null,
      phone: message.phone || null,
      name:  message.name  || null,
      tabs:  message.tabs  || [],
    }, "*");
    sendResponse({ ok: true });
    return true;
  }
});

// ── Mensajes desde la página (call-notes → content → background) ──────
// Usamos CustomEvent sobre document: la página y el content script comparten
// el mismo DOM aunque corran en mundos JS aislados.
document.addEventListener("__qtl_open_all__", (e) => {
  const urls = e.detail?.urls;
  if (!Array.isArray(urls) || !urls.length) return;
  chrome.runtime.sendMessage({ type: "QTL_OPEN_ALL", urls }).catch(() => {});
});

// ── Arranque ──────────────────────────────────────────────────────────
init();
console.log("[QTL] Content script activo v1.3.4");
