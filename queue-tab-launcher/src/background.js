/**
 * background.js — Queue Tab Launcher v1.6.0
 * Service Worker: detecta colas, muestra banner, abre pestañas.
 * Integración Call Notes: inyecta datos de llamada (cola, teléfono, nombre).
 *
 * @author Ignacio
 * @built-with Claude Sonnet 4.6 (Anthropic)
 */

// ── Atajo de teclado Alt+Shift+Q → trigger manual ─────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === "manual-trigger") triggerManualDetection();
});

async function triggerManualDetection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "QTL_MANUAL_TRIGGER" });
    if (res?.ok) {
      notifyPopup({ type: "LOG", level: "ok", text: `Trigger manual: "${res.queueName}"` });
    } else {
      notifyPopup({ type: "LOG", level: "warn", text: `Trigger manual: ${res?.reason || "sin datos en el selector"}` });
    }
  } catch {
    notifyPopup({ type: "LOG", level: "warn", text: "Trigger manual: content script no responde — refrescá la pestaña" });
  }
}

// ── Mensaje entrante desde content.js / popup ─────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "QUEUE_DETECTED") {
    handleQueueDetected(message.queueName, message.phone, message.callerName, sender.tab);
    sendResponse({ ok: true });
  }
  if (message.type === "OPEN_TABS") {
    openTabs(message.tabs, message.callData);
    sendResponse({ ok: true });
  }
  if (message.type === "OPEN_QUEUE_TABS") {
    handleOpenQueueTabs(message.queueName);
    sendResponse({ ok: true });
  }
  if (message.type === "OPEN_SINGLE_TAB") {
    const url = buildUrl(message.url, message.callData || {});
    chrome.tabs.create({ url, active: true }).catch(() => {});
    sendResponse({ ok: true });
  }

  // ── Abrir todos los links desde Call Notes ────────────────────────────
  if (message.type === "QTL_OPEN_ALL") {
    (async () => {
      for (const url of message.urls || []) {
        await chrome.tabs.create({ url, active: false }).catch(() => {});
        await sleep(200);
      }
    })();
    sendResponse({ ok: true });
  }

  // ── Trigger manual desde popup ───────────────────────────────────────
  if (message.type === "QTL_MANUAL_TRIGGER") {
    triggerManualDetection();
    sendResponse({ ok: true });
  }

  // ── Picker: reenviar al content script de la pestaña activa ──────────
  if (message.type === "QTL_START_PICKER") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
    });
    sendResponse({ ok: true });
  }

  if (message.type === "QTL_CANCEL_PICKER") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
    });
    sendResponse({ ok: true });
  }

  // ── Picker: elemento capturado → guardar en config ────────────────────
  if (message.type === "QTL_PICKER_CAPTURED") {
    handlePickerCaptured(message.target, message.selector);
    sendResponse({ ok: true });
  }

  // ── Picker: cancelado desde la página ─────────────────────────────────
  if (message.type === "QTL_PICKER_CANCELLED") {
    notifyPopup({ type: "QTL_PICKER_CANCELLED" });
    sendResponse({ ok: true });
  }

  return true;
});

// ── Call Notes: inyectar si está abierta, abrir con datos si no lo está ─
async function handleCallNotes(callNotesUrl, callData) {
  if (!callNotesUrl) return;
  const existing = await findExistingTab(callNotesUrl);
  if (existing) {
    await injectCallData(existing.id, callData);
  } else {
    const url = buildUrl(callNotesUrl, callData);
    try {
      await chrome.tabs.create({ url, active: false });
    } catch (e) {
      console.warn("[QTL] No se pudo abrir call-notes:", e);
    }
  }
}

// ── Apertura manual desde el popup (sin llamada activa) ───────────────
async function handleOpenQueueTabs(queueName) {
  const { config } = await chrome.storage.local.get("config");
  if (!config) return;

  const queueConfig = config.queues.find(
    (q) => q.name.trim().toLowerCase() === queueName.trim().toLowerCase()
  );

  if (!queueConfig) {
    notifyPopup({ type: "LOG", level: "warn", text: `Cola no encontrada: "${queueName}"` });
    return;
  }

  notifyPopup({ type: "LOG", level: "ok", text: `Abriendo manualmente: "${queueName}"` });
  const callData = { queue: queueName };
  await Promise.all([
    handleCallNotes(config.call_notes_url, callData),
    openTabs(queueConfig.tabs, callData),
  ]);
}

// ── Cola detectada → inyectar call-notes + mostrar banner ────────────
async function handleQueueDetected(queueName, phone, callerName, sourceTab) {
  const { config, preferences } = await chrome.storage.local.get(["config", "preferences"]);
  if (!config) {
    console.warn("[QTL] Sin configuración.");
    return;
  }

  const queueConfig = config.queues.find(
    (q) => q.name.trim().toLowerCase() === queueName.trim().toLowerCase()
  );

  if (!queueConfig) {
    console.warn(`[QTL] Cola no mapeada: "${queueName}"`);
    notifyPopup({ type: "LOG", level: "warn", text: `Cola no mapeada: "${queueName}"` });
    return;
  }

  console.log(`[QTL] Cola: "${queueName}" → mostrando banner`);
  notifyPopup({ type: "LOG", level: "ok", text: `Cola detectada: "${queueName}"` });

  const callData = {
    queue: queueName,
    phone: phone || null,
    name:  callerName || null,
    tabs:  queueConfig.tabs || [],   // links de la cola → Call Notes
  };

  // Call Notes: abrir solo si la preferencia está habilitada
  const autoOpen = preferences?.auto_open_call_notes !== false; // default true
  if (autoOpen) {
    handleCallNotes(config.call_notes_url, callData);
  }

  showBannerOnTab(sourceTab, queueConfig, callData);
}

// ── Inyectar banner en la página activa ───────────────────────────────
async function showBannerOnTab(tab, queueConfig, callData) {
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectBanner,
      args: [queueConfig, callData],
    });
  } catch (e) {
    console.error("[QTL] Error inyectando banner:", e);
    openTabs(queueConfig.tabs, callData);
  }
}

// ── Banner (se ejecuta en la página) ─────────────────────────────────
function injectBanner(queueConfig, callData) {
  const existing = document.getElementById("qtl-banner");
  if (existing) existing.remove();

  const { queue, phone, name } = callData;
  const tabs = queueConfig.tabs;

  const banner = document.createElement("div");
  banner.id = "qtl-banner";
  banner.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 999999;
    width: 320px; background: #1a1a1a;
    border: 1px solid #2c3040; border-left: 3px solid #4f8ef7;
    border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font-family: 'DM Mono','IBM Plex Mono','Courier New', monospace;
    overflow: hidden; animation: qtl-in 0.25s ease;
  `;

  // Build caller info rows
  const infoRows = [
    phone ? `<div class="qtl-info-row"><span class="qtl-info-lbl">Teléfono</span><span class="qtl-info-val">${phone}</span></div>` : '',
    name  ? `<div class="qtl-info-row"><span class="qtl-info-lbl">Nombre</span><span class="qtl-info-val">${name}</span></div>`  : '',
    queue ? `<div class="qtl-info-row"><span class="qtl-info-lbl">Cola</span><span class="qtl-info-val qtl-queue-val">${queue}</span></div>` : '',
  ].filter(Boolean).join('');

  banner.innerHTML = `
    <style>
      @keyframes qtl-in { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
      #qtl-banner * { box-sizing:border-box; margin:0; padding:0; }
      #qtl-banner .qtl-head { padding:11px 14px 9px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #2c3040; }
      #qtl-banner .qtl-logo { font-size:10px; letter-spacing:.1em; color:#4f8ef7; text-transform:uppercase; font-weight:600; display:flex; align-items:center; gap:6px; }
      #qtl-banner .qtl-logo-dot { width:6px;height:6px;border-radius:50%;background:#4f8ef7;box-shadow:0 0 6px #4f8ef7; }
      #qtl-banner .qtl-head { user-select:none; }
      #qtl-banner .qtl-close { background:none;border:none;color:#555;font-size:14px;cursor:pointer;padding:0 2px;line-height:1; }
      #qtl-banner .qtl-close:hover { color:#aaa; }
      #qtl-banner .qtl-body { padding:12px 14px 14px; }
      #qtl-banner .qtl-call-info { background:#111318; border:1px solid #2c3040; border-radius:7px; padding:8px 10px; margin-bottom:12px; }
      #qtl-banner .qtl-info-row { display:flex; justify-content:space-between; align-items:center; padding:3px 0; border-bottom:1px solid #1f2330; }
      #qtl-banner .qtl-info-row:last-child { border-bottom:none; }
      #qtl-banner .qtl-info-lbl { font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:#555d75; }
      #qtl-banner .qtl-info-val { font-size:11px; color:#e2e5f0; font-weight:500; }
      #qtl-banner .qtl-queue-val { color:#4f8ef7; }
      #qtl-banner .qtl-tabs-label { font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:#555d75; margin-bottom:5px; }
      #qtl-banner .qtl-tab-row { display:flex; align-items:center; gap:6px; padding:3px 0; font-size:10px; color:#555d75; }
      #qtl-banner .qtl-tab-dot { width:4px;height:4px;border-radius:50%;background:#4f8ef7;flex-shrink:0; }
      #qtl-banner .qtl-tab-url { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1; }
      #qtl-banner .qtl-tab-open { background:none;border:1px solid #2c3040;border-radius:3px;color:#4f8ef7;font-size:9px;cursor:pointer;padding:2px 6px;flex-shrink:0;transition:all .15s;font-family:inherit; }
      #qtl-banner .qtl-tab-open:hover { background:#4f8ef7;color:white;border-color:#4f8ef7; }
      #qtl-banner .qtl-tabs { margin-bottom:12px; }
      #qtl-banner .qtl-btn-row { display:flex; gap:6px; }
      #qtl-banner .qtl-btn { flex:1;padding:8px 0;border-radius:6px;border:none;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:filter .15s; }
      #qtl-banner .qtl-btn:hover { filter:brightness(1.15); }
      #qtl-banner .qtl-open { background:#4f8ef7; color:white; }
      #qtl-banner .qtl-dismiss { background:#1f2330; color:#555d75; border:1px solid #2c3040; }
    </style>

    <div class="qtl-head">
      <span class="qtl-logo">
        <span class="qtl-logo-dot"></span>
        Llamada entrante
      </span>
      <button class="qtl-close" id="qtl-close">✕</button>
    </div>

    <div class="qtl-body">
      ${infoRows ? `<div class="qtl-call-info">${infoRows}</div>` : ''}

      <div class="qtl-tabs">
        <div class="qtl-tabs-label">Pestañas a abrir</div>
        ${tabs.map((t, i) => {
          const label = t.title || (() => {
            try { const u = new URL(t.url); return u.hostname + u.pathname; } catch { return t.url; }
          })();
          return `<div class="qtl-tab-row">
            <span class="qtl-tab-dot"></span>
            <span class="qtl-tab-url" title="${t.url}">${label}</span>
            <button class="qtl-tab-open" data-idx="${i}">▶</button>
          </div>`;
        }).join('')}
      </div>

      <div class="qtl-btn-row">
        <button class="qtl-btn qtl-open" id="qtl-open">▶ Abrir pestañas</button>
        <button class="qtl-btn qtl-dismiss" id="qtl-dismiss">Ignorar</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Sin auto-cierre — el agente lo cierra manualmente
  document.getElementById("qtl-close").onclick   = () => banner.remove();
  document.getElementById("qtl-dismiss").onclick = () => banner.remove();
  document.getElementById("qtl-open").onclick    = () => {
    banner.remove();
    chrome.runtime.sendMessage({ type: "OPEN_TABS", tabs, callData: { queue, phone, name } });
  };

  // Botones individuales por pestaña
  banner.querySelectorAll(".qtl-tab-open").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      chrome.runtime.sendMessage({
        type: "OPEN_SINGLE_TAB",
        url: tabs[idx].url,
        callData: { queue, phone, name },
      });
    });
  });

  // ── Drag: mover el banner libremente dentro del viewport ──────────────
  const head = banner.querySelector(".qtl-head");
  head.style.cursor = "move";
  let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

  head.addEventListener("mousedown", (e) => {
    if (e.target.closest("#qtl-close")) return;
    isDragging = true;
    const rect = banner.getBoundingClientRect();
    // Pasar de posicionamiento right→left para que el drag sea predecible
    banner.style.right = "auto";
    banner.style.left  = rect.left + "px";
    banner.style.top   = rect.top  + "px";
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const bw = banner.offsetWidth;
    const bh = banner.offsetHeight;
    const newLeft = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth  - bw));
    const newTop  = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - bh));
    banner.style.left = newLeft + "px";
    banner.style.top  = newTop  + "px";
  });

  document.addEventListener("mouseup", () => { isDragging = false; });
}

// ── Tab IDs persistidos en session storage (sobrevive al reinicio del SW) ─
async function getQtlTabIds() {
  const { qtlTabIds } = await chrome.storage.session.get("qtlTabIds");
  return Array.isArray(qtlTabIds) ? qtlTabIds : [];
}

async function setQtlTabIds(ids) {
  await chrome.storage.session.set({ qtlTabIds: ids });
}

// ── Abrir pestañas de la cola ─────────────────────────────────────────
async function openTabs(tabs, callData = {}) {
  // Cerrar pestañas de la cola anterior (solo las no persistentes)
  const prevIds = await getQtlTabIds();
  if (prevIds.length) {
    await Promise.all(prevIds.map(id => chrome.tabs.remove(id).catch(() => {})));
  }

  const newIds = [];
  for (let i = 0; i < tabs.length; i++) {
    const tabConfig = tabs[i];

    if (tabConfig.persistent) {
      // Pestaña persistente: reutilizar e inyectar, nunca se cierra automáticamente
      const existing = await findExistingTab(tabConfig.url);
      if (existing) {
        await chrome.tabs.update(existing.id, { active: tabConfig.active === true });
        await sleep(200);
        await injectCallData(existing.id, callData);
      } else {
        // No está abierta: abrir con datos en URL para que call-notes los levante al cargar
        const url = buildUrl(tabConfig.url, callData);
        await chrome.tabs.create({ url, active: tabConfig.active === true });
      }
    } else {
      // Pestaña específica de cola: abrir siempre nueva con datos en la URL
      const url = buildUrl(tabConfig.url, callData);
      const newTab = await chrome.tabs.create({ url, active: tabConfig.active === true });

      // El primer tab (índice 0) es el sistema de gestión: no se trackea,
      // así el agente puede terminar su tarea aunque llegue una nueva cola
      if (i > 0) {
        newIds.push(newTab.id);
      }
    }

    await sleep(350);
  }

  await setQtlTabIds(newIds);

  const label = callData.queue || callData.phone || 'nueva';
  notifyPopup({ type: "LOG", level: "ok", text: `Pestañas abiertas — llamada: ${label}` });
}

// ── Buscar pestaña persistente por URL base (origin + pathname) ────────
async function findExistingTab(baseUrl) {
  try {
    const allTabs = await chrome.tabs.query({});
    return allTabs.find(t => {
      if (!t.url) return false;
      try {
        const tabBase = new URL(t.url);
        const cfgBase = new URL(baseUrl);
        return tabBase.origin === cfgBase.origin && tabBase.pathname === cfgBase.pathname;
      } catch { return false; }
    }) || null;
  } catch { return null; }
}

// ── Construir URL con params de llamada ────────────────────────────────
function buildUrl(baseUrl, callData) {
  const tabsJson = callData.tabs?.length ? JSON.stringify(callData.tabs) : null;
  try {
    const url = new URL(baseUrl);
    if (callData.queue) url.searchParams.set('queue', callData.queue);
    if (callData.phone) url.searchParams.set('phone', callData.phone);
    if (callData.name)  url.searchParams.set('name',  callData.name);
    if (tabsJson)       url.searchParams.set('tabs',  tabsJson);
    return url.toString();
  } catch {
    // Si no es URL válida (ej. file://) agregar params manualmente
    const sep = baseUrl.includes('?') ? '&' : '?';
    const parts = [];
    if (callData.queue) parts.push(`queue=${encodeURIComponent(callData.queue)}`);
    if (callData.phone) parts.push(`phone=${encodeURIComponent(callData.phone)}`);
    if (callData.name)  parts.push(`name=${encodeURIComponent(callData.name)}`);
    if (tabsJson)       parts.push(`tabs=${encodeURIComponent(tabsJson)}`);
    return parts.length ? `${baseUrl}${sep}${parts.join('&')}` : baseUrl;
  }
}

// ── Inyectar datos en pestaña ya abierta (Call Notes) ─────────────────
// Usa sendMessage → content.js → postMessage. No requiere permiso de scripting
// sobre file://, funciona siempre que el content script esté activo en la pestaña.
async function injectCallData(tabId, callData) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type:  "QTL_INJECT_CALL",
      queue: callData.queue || null,
      phone: callData.phone || null,
      name:  callData.name  || null,
      tabs:  callData.tabs  || [],
    });
  } catch (e) {
    console.warn("[QTL] No se pudo inyectar en call-notes:", e);
  }
}

// ── Picker: guardar selector en config y notificar ────────────────────
async function handlePickerCaptured(target, selector) {
  const FIELD_MAP = {
    queue: "selector",
    phone: "phone_selector",
    name:  "name_selector",
  };
  const field = FIELD_MAP[target];
  if (!field) return;

  const { config } = await chrome.storage.local.get("config");
  if (!config) return;

  config[field] = selector;
  await chrome.storage.local.set({ config });

  console.log(`[QTL] Selector "${field}" actualizado: ${selector}`);
  notifyPopup({ type: "QTL_PICKER_CAPTURED", target, selector });
  notifyPopup({ type: "LOG", level: "ok", text: `Selector ${target} → ${selector}` });
}

function notifyPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("[QTL] Background activo v1.5.0");
