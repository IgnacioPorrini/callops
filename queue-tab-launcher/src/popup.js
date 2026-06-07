/**
 * popup.js — Queue Tab Launcher v1.8.0
 * @author Ignacio
 * @built-with Claude Sonnet 4.6 (Anthropic)
 */

// ── DOM refs ──────────────────────────────────────────────────────────
const fileInput      = document.getElementById("fileInput");
const dropZone       = document.getElementById("dropZone");
const statusDot      = document.getElementById("statusDot");
const queueBtns      = document.getElementById("queueBtns");
const queueBadge     = document.getElementById("queueBadge");
const selHint        = document.getElementById("selHint");
const bodyQueues     = document.getElementById("bodyQueues");
const bodySelectors  = document.getElementById("bodySelectors");
const chevQueues     = document.getElementById("chevQueues");
const chevSelectors  = document.getElementById("chevSelectors");
const btnCallNotes   = document.getElementById("btnCallNotes");
const btnVerify      = document.getElementById("btnVerify");
const btnReconfig    = document.getElementById("btnReconfig");
const btnClear       = document.getElementById("btnClear");
const btnManualTrigger   = document.getElementById("btnManualTrigger");
const btnExportConfig    = document.getElementById("btnExportConfig");
const btnEditQueues      = document.getElementById("btnEditQueues");
const queueSearch        = document.getElementById("queueSearch");
const queueSearchClear   = document.getElementById("queueSearchClear");
const queueSearchEmpty   = document.getElementById("queueSearchEmpty");
const tplJson        = document.getElementById("tplJson");
const tplCsv         = document.getElementById("tplCsv");
const logBox         = document.getElementById("logBox");
const toast          = document.getElementById("toast");
const opView         = document.getElementById("opView");
const setupView      = document.getElementById("setupView");

// Selector picker refs
const sdotQueue  = document.getElementById("sdotQueue");
const sdotPhone  = document.getElementById("sdotPhone");
const sdotName   = document.getElementById("sdotName");
const svalQueue  = document.getElementById("svalQueue");
const svalPhone  = document.getElementById("svalPhone");
const svalName   = document.getElementById("svalName");
const sbtnQueue  = document.getElementById("sbtnQueue");
const sbtnPhone  = document.getElementById("sbtnPhone");
const sbtnName   = document.getElementById("sbtnName");
const sclearQueue= document.getElementById("sclearQueue");
const sclearPhone= document.getElementById("sclearPhone");
const sclearName = document.getElementById("sclearName");
const sdotNotes  = document.getElementById("sdotNotes");
const sinputNotes= document.getElementById("sinputNotes");
const sclearNotes= document.getElementById("sclearNotes");

// ── Preferencias ──────────────────────────────────────────────────────
const bodyPreferences   = document.getElementById("bodyPreferences");
const chevPreferences   = document.getElementById("chevPreferences");
const prefAutoOpen      = document.getElementById("prefAutoOpen");
const prefAutoFocus     = document.getElementById("prefAutoFocus");
const prefSound         = document.getElementById("prefSound");
const prefNotif         = document.getElementById("prefNotif");

let preferences = {
  auto_open_call_notes: false,
  auto_focus_call_notes: false,
  play_sound_on_queue: false,
  show_notification_on_queue: false,
};

// Estado picker activo: 'queue' | 'phone' | 'name' | null
let activePicking = null;

// ── View helpers ──────────────────────────────────────────────────────
function showOpView()    { opView.style.display = "flex";  setupView.style.display = "none"; }
function showSetupView() { opView.style.display = "none";  setupView.style.display = "flex"; }

// ── Toggle sections ───────────────────────────────────────────────────
function initToggles() {
  document.getElementById("hdrQueues").addEventListener("click", () => {
    const open = bodyQueues.style.display !== "none";
    bodyQueues.style.display  = open ? "none" : "block";
    chevQueues.classList.toggle("open", !open);
  });
  document.getElementById("hdrSelectors").addEventListener("click", () => {
    const open = bodySelectors.style.display !== "none";
    bodySelectors.style.display  = open ? "none" : "block";
    chevSelectors.classList.toggle("open", !open);
  });
  document.getElementById("hdrPreferences").addEventListener("click", () => {
    const open = bodyPreferences.style.display !== "none";
    bodyPreferences.style.display  = open ? "none" : "block";
    chevPreferences.classList.toggle("open", !open);
  });
}
initToggles();

// ── Cargar preferencias ────────────────────────────────────────────────
async function loadPreferences() {
  const stored = await chrome.storage.local.get("preferences");
  if (stored.preferences) {
    preferences = { ...preferences, ...stored.preferences };
  }
  renderPreferences();
}

function renderPreferences() {
  prefAutoOpen.checked  = preferences.auto_open_call_notes;
  prefAutoFocus.checked = preferences.auto_focus_call_notes;
  prefSound.checked     = preferences.play_sound_on_queue;
  prefNotif.checked     = preferences.show_notification_on_queue;
}

async function savePreferences() {
  preferences = {
    auto_open_call_notes:      prefAutoOpen.checked,
    auto_focus_call_notes:     prefAutoFocus.checked,
    play_sound_on_queue:       prefSound.checked,
    show_notification_on_queue: prefNotif.checked,
  };
  await chrome.storage.local.set({ preferences });
}

// Listeners de preferencias
prefAutoOpen.addEventListener("change", savePreferences);
prefAutoFocus.addEventListener("change", savePreferences);
prefSound.addEventListener("change", savePreferences);
prefNotif.addEventListener("change", savePreferences);

// ── Init ──────────────────────────────────────────────────────────────
(async function init() {
  await loadPreferences();
  const { config } = await chrome.storage.local.get("config");
  if (config) {
    renderLoadedConfig(config);
    // Auto-focus en el buscador al abrir el popup con Alt+Q
    setTimeout(() => queueSearch?.focus(), 80);
  } else {
    showSetupView();
  }
  loadLogs();
  checkFileAccess();
})();

async function checkFileAccess() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith("file://")) {
    document.getElementById("fileWarn").classList.add("show");
  }
}

document.getElementById("goExtSettings").addEventListener("click", () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});

// (el listener de mensajes está unificado más abajo, junto al picker)

// ── Drag & drop ───────────────────────────────────────────────────────
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

// ── File processing ───────────────────────────────────────────────────
async function processFile(file) {
  const ext  = file.name.split(".").pop().toLowerCase();
  const text = await file.text();
  let config = null;

  try {
    if (ext === "json") {
      config = JSON.parse(text);
    } else if (ext === "csv") {
      config = parseCSV(text);
    } else {
      showToast("Formato no soportado (.json o .csv)", "err");
      return;
    }

    const err = validateConfig(config);
    if (err) { showToast(err, "err"); appendLog("err", err); return; }

    // Extraer preferencias si vienen en el JSON
    const loadedPrefs = config.preferences || null;
    const configToSave = { ...config };
    delete configToSave.preferences; // No guardar preferencias dentro de config

    await chrome.storage.local.set({
      config: configToSave,
      ...(loadedPrefs && { preferences: loadedPrefs })
    });

    // Recargar preferencias si vinieron en el JSON
    if (loadedPrefs) {
      await loadPreferences();
    }

    renderLoadedConfig(configToSave);
    appendLog("ok", `Config cargada: "${file.name}" — ${configToSave.queues.length} cola(s)${loadedPrefs ? " + preferencias" : ""}`);
    showToast("✓ Configuración cargada", "ok");

  } catch (e) {
    showToast("Error al parsear el archivo", "err");
    appendLog("err", e.message);
  }
}

// ── Config validation ─────────────────────────────────────────────────
function validateConfig(c) {
  // selector es opcional: se puede configurar después con el picker
  if (!c.selector) appendLog("warn", "Sin selector de cola — configuralo con ⌖ Capturar");
  if (!Array.isArray(c.queues) || c.queues.length === 0) return "Falta campo 'queues' (array)";
  for (const q of c.queues) {
    if (!q.name) return "Una cola no tiene campo 'name'";
    if (!Array.isArray(q.tabs) || q.tabs.length === 0) return `Cola "${q.name}" no tiene 'tabs'`;
    for (const t of q.tabs) {
      if (!t.url) return `Una pestaña de "${q.name}" no tiene 'url'`;
    }
  }
  return null;
}

// ── Selector UI ───────────────────────────────────────────────────────
function renderSelectorUI(config) {
  const FIELDS = [
    { key: "selector",       dot: sdotQueue,  val: svalQueue,  btn: sbtnQueue,  clr: sclearQueue, dotClass: "set-queue" },
    { key: "phone_selector", dot: sdotPhone,  val: svalPhone,  btn: sbtnPhone,  clr: sclearPhone, dotClass: "set-phone" },
    { key: "name_selector",  dot: sdotName,   val: svalName,   btn: sbtnName,   clr: sclearName,  dotClass: "set-name"  },
  ];

  FIELDS.forEach(({ key, dot, val, btn, clr, dotClass }) => {
    const sel = config?.[key] || null;
    dot.className = "sel-dot" + (sel ? ` ${dotClass}` : "");
    if (sel) {
      val.textContent = sel;
      val.className   = "sel-value";
    } else {
      val.textContent = "sin configurar";
      val.className   = "sel-value empty";
    }
    clr.disabled = !sel;
  });

  // Hint en el header colapsado (muestra el selector de cola o aviso)
  const qSel = config?.selector || null;
  if (qSel) {
    selHint.textContent = qSel;
    selHint.className   = "toggle-hint";
  } else {
    selHint.textContent = "sin configurar";
    selHint.className   = "toggle-hint empty";
  }
}

// ── Call Notes URL ────────────────────────────────────────────────────
function renderNotesUrl(config) {
  const url = config?.call_notes_url || "";
  sinputNotes.value   = url;
  sdotNotes.className = "sel-dot" + (url ? " set-name" : "");
  sclearNotes.disabled = !url;
}

async function saveNotesUrl(value) {
  const { config } = await chrome.storage.local.get("config");
  if (!config) return;
  const trimmed = value.trim();
  if (trimmed) {
    config.call_notes_url = trimmed;
  } else {
    delete config.call_notes_url;
  }
  await chrome.storage.local.set({ config });
  renderNotesUrl(config);
  if (trimmed) appendLog("ok", `call_notes_url actualizado`);
}

sinputNotes.addEventListener("blur",    (e) => saveNotesUrl(e.target.value));
sinputNotes.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.target.blur(); } });

sclearNotes.addEventListener("click", async () => {
  await saveNotesUrl("");
  showToast("Call Notes URL eliminado", "");
});

// ── Picker: iniciar captura ───────────────────────────────────────────
function startPicker(target) {
  activePicking = target;
  // Marcar el botón como "esperando"
  const btn = target === "queue" ? sbtnQueue : target === "phone" ? sbtnPhone : sbtnName;
  const dot = target === "queue" ? sdotQueue : target === "phone" ? sdotPhone : sdotName;
  btn.textContent = "✕ Cancelar";
  btn.classList.add("picking");
  dot.classList.add("picking");

  chrome.runtime.sendMessage({ type: "QTL_START_PICKER", target }, () => window.close());
}

function cancelPicker() {
  if (!activePicking) return;
  chrome.runtime.sendMessage({ type: "QTL_CANCEL_PICKER" });
  activePicking = null;
}

// ── Picker buttons ────────────────────────────────────────────────────
sbtnQueue.addEventListener("click", () => {
  if (activePicking === "queue") { cancelPicker(); return; }
  startPicker("queue");
});
sbtnPhone.addEventListener("click", () => {
  if (activePicking === "phone") { cancelPicker(); return; }
  startPicker("phone");
});
sbtnName.addEventListener("click", () => {
  if (activePicking === "name") { cancelPicker(); return; }
  startPicker("name");
});

// ── Picker: limpiar selector ──────────────────────────────────────────
sclearQueue.addEventListener("click", () => clearSelector("selector"));
sclearPhone.addEventListener("click", () => clearSelector("phone_selector"));
sclearName .addEventListener("click", () => clearSelector("name_selector"));

async function clearSelector(field) {
  const { config } = await chrome.storage.local.get("config");
  if (!config) return;
  delete config[field];
  await chrome.storage.local.set({ config });
  renderSelectorUI(config);
  // Actualizar strip si borran el selector principal
  if (field === "selector") {
    stripText.innerHTML = `Sin selector de cola configurado`;
  }
  appendLog("warn", `Selector "${field}" eliminado`);
  showToast("Selector eliminado", "");
}

// ── Mensajes entrantes desde background (picker capturado/cancelado) ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOG") appendLog(msg.level, msg.text);

  if (msg.type === "QTL_PICKER_CAPTURED") {
    activePicking = null;
    chrome.storage.local.get("config", ({ config }) => {
      if (config) renderSelectorUI(config);
    });
    appendLog("ok", `Selector ${msg.target} capturado: ${msg.selector}`);
    showToast("✓ Selector guardado", "ok");
  }

  if (msg.type === "QTL_PICKER_CANCELLED") {
    activePicking = null;
    chrome.storage.local.get("config", ({ config }) => {
      if (config) renderSelectorUI(config);
    });
  }
});

// ── Exportar config ───────────────────────────────────────────────────
btnExportConfig.addEventListener("click", async () => {
  const { config, preferences: storedPrefs } = await chrome.storage.local.get(["config", "preferences"]);
  if (!config) { showToast("Sin configuración para exportar", ""); return; }
  const exportData = {
    ...config,
    preferences: storedPrefs || preferences,
  };
  downloadFile("qtl-config.json", JSON.stringify(exportData, null, 2), "application/json");
  showToast("✓ Config + preferencias exportadas", "ok");
  appendLog("ok", "Configuración y preferencias exportadas como JSON");
});

// ── Render config cargada ─────────────────────────────────────────────
function renderLoadedConfig(config) {
  statusDot.className = "status-dot active";

  renderSelectorUI(config);
  renderNotesUrl(config);

  // Resetear buscador al cargar nueva config
  queueSearch.value = "";
  filterQueues("");

  queueBtns.innerHTML = "";
  for (const q of config.queues) {
    const tabCount = q.tabs.length;
    const queueItem = document.createElement("div");
    queueItem.className = "queue-item";

    const header = document.createElement("button");
    header.className = "queue-item-header";
    header.innerHTML = `
      <div>
        <div class="queue-launch-btn-name">${q.name}</div>
        <div class="queue-launch-btn-meta">${tabCount} pestaña${tabCount !== 1 ? "s" : ""}</div>
      </div>
      <div class="queue-item-toggle">
        <span class="queue-item-toggle-chevron">▾</span>
        <span class="queue-launch-btn-arrow">▶</span>
      </div>
    `;

    // Click en header para abrir todas las pestañas
    header.addEventListener("click", (e) => {
      // Si es click en el chevron, expandir/colapsar (accordion)
      if (e.target.closest(".queue-item-toggle-chevron")) {
        e.stopPropagation();
        const linksList = queueItem.querySelector(".queue-links-list");
        const chevron = header.querySelector(".queue-item-toggle-chevron");
        const isExpanded = !linksList.classList.contains("collapsed");

        // Accordion: Colapsar todos primero
        document.querySelectorAll("#queueBtns .queue-item").forEach(item => {
          const list = item.querySelector(".queue-links-list");
          const chev = item.querySelector(".queue-item-toggle-chevron");
          const hdr = item.querySelector(".queue-item-header");
          if (list) {
            list.classList.add("collapsed");
            chev.classList.remove("open");
            hdr.classList.remove("expanded");
          }
        });

        // Si no estaba expandido, expandir este
        if (!isExpanded) {
          linksList.classList.remove("collapsed");
          header.classList.add("expanded");
          chevron.classList.add("open");
        }
        return;
      }
      // Else, abrir todas las pestañas
      chrome.runtime.sendMessage({ type: "OPEN_QUEUE_TABS", queueName: q.name });
      appendLog("ok", `Abriendo manualmente: "${q.name}"`);
      showToast(`Abriendo: ${q.name}`, "ok");
    });

    queueItem.appendChild(header);

    // Crear lista de links
    if (q.tabs.length > 0) {
      const linksList = document.createElement("div");
      linksList.className = "queue-links-list collapsed"; // Colapsado por defecto

      for (const tab of q.tabs) {
        const linkItem = document.createElement("div");
        linkItem.className = "queue-link-item";
        const title = tab.title || new URL(tab.url).hostname;
        linkItem.innerHTML = `
          <span class="queue-link-label">${title}</span>
          <span class="queue-link-icon">↗</span>
        `;
        linkItem.addEventListener("click", () => {
          chrome.tabs.create({ url: tab.url });
          appendLog("ok", `Abriendo link: "${title}" de "${q.name}"`);
        });
        linksList.appendChild(linkItem);
      }

      queueItem.appendChild(linksList);
    }

    queueBtns.appendChild(queueItem);
  }

  // Badge con total de colas
  const total = config.queues?.length || 0;
  queueBadge.textContent = `${total} cola${total !== 1 ? "s" : ""}`;

  showOpView();
}

// ── Call Notes ────────────────────────────────────────────────────────
btnCallNotes.addEventListener("click", async () => {
  const { config } = await chrome.storage.local.get("config");
  if (!config?.call_notes_url) {
    showToast("call_notes_url no configurado", "warn");
    appendLog("warn", "call_notes_url no definido en config");
    return;
  }
  chrome.tabs.create({ url: config.call_notes_url });
});

// ── Verificar ─────────────────────────────────────────────────────────
btnVerify.addEventListener("click", async () => {
  btnVerify.textContent = "...";
  btnVerify.disabled    = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("no tab");

    const response = await chrome.tabs.sendMessage(tab.id, { type: "QTL_PING" });

    if (response?.ok) {
      const listening = response.listening ? "escuchando" : "inyectado (sin config)";
      btnVerify.textContent = "✓ Activo";
      showToast("✓ Script activo en esta pestaña", "ok");
      let host = tab.url;
      try { host = new URL(tab.url).hostname || tab.url; } catch {}
      appendLog("ok", `Content script ${listening}: ${host}`);
    } else {
      throw new Error("bad response");
    }

  } catch {
    btnVerify.textContent = "⚠ Sin respuesta";
    showToast("⚠ Refrescá la pestaña del sistema", "warn");
    appendLog("warn", "Sin respuesta — refrescá la pestaña del sistema");
  }

  setTimeout(() => {
    btnVerify.textContent = "Verificar";
    btnVerify.disabled    = false;
  }, 2500);
});

// ── Reconfig ──────────────────────────────────────────────────────────
btnReconfig.addEventListener("click", () => {
  showSetupView();
  appendLog("warn", "Modo reconfiguración activo.");
});

// ── Clear ─────────────────────────────────────────────────────────────
btnClear.addEventListener("click", async () => {
  await chrome.storage.local.remove("config");
  statusDot.className = "status-dot";
  showSetupView();
  appendLog("warn", "Configuración eliminada.");
  showToast("Configuración eliminada", "");
});

// ── Template downloads ────────────────────────────────────────────────
tplJson.addEventListener("click", () => {
  const template = {
    selector: ".queue-name-selector",
    call_notes_url: "file:///C:/ruta/a/call-notes.html",
    queues: [
      {
        name: "Cola Ventas",
        campaign: "VENTAS_Q1",
        tabs: [
          { url: "https://sistema.empresa.com/gestion",         title: "Sistema de gestión", active: true },
          { url: "https://sistema.empresa.com/campana/ventas",  title: "Campaña Ventas",     active: false },
          { url: "https://crm.empresa.com/cliente",             title: "CRM Cliente",        active: false },
        ],
      },
      {
        name: "Cola Soporte",
        campaign: "SOPORTE_GENERAL",
        tabs: [
          { url: "https://sistema.empresa.com/gestion",         title: "Sistema de gestión", active: true },
          { url: "https://sistema.empresa.com/campana/soporte", title: "Campaña Soporte",    active: false },
          { url: "https://crm.empresa.com/tickets",             title: "Tickets",            active: false },
        ],
      },
    ],
  };
  downloadFile("qtl-config.json", JSON.stringify(template, null, 2), "application/json");
});

tplCsv.addEventListener("click", () => {
  const csv = [
    "queue_name,campaign,tab1_url,tab1_active,tab2_url,tab2_active,tab3_url,tab3_active,selector",
    "Cola Ventas,VENTAS_Q1,https://sistema.empresa.com/gestion,true,https://sistema.empresa.com/campana/ventas,false,https://crm.empresa.com/cliente,false,.queue-name-selector",
    "Cola Soporte,SOPORTE_GENERAL,https://sistema.empresa.com/gestion,true,https://sistema.empresa.com/campana/soporte,false,https://crm.empresa.com/tickets,false,.queue-name-selector",
  ].join("\n");
  downloadFile("qtl-config.csv", csv, "text/csv");
});

// ── CSV parser ────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV vacío o sin filas de datos");

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows    = lines.slice(1);
  let selector  = "";

  const queues = rows.map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const row  = {};
    headers.forEach((h, i) => (row[h] = vals[i] || ""));
    if (!selector && row.selector) selector = row.selector;

    const tabs = [];
    for (let i = 1; i <= 5; i++) {
      if (row[`tab${i}_url`]) {
        tabs.push({ url: row[`tab${i}_url`], active: row[`tab${i}_active`] === "true" });
      }
    }
    return { name: row.queue_name, campaign: row.campaign, tabs };
  });

  return { selector, queues };
}

// ── Buscador de colas ─────────────────────────────────────────────────
function filterQueues(query) {
  const q = query.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll("#queueBtns .queue-item").forEach(item => {
    const name = item.querySelector(".queue-launch-btn-name")?.textContent.toLowerCase() || "";
    const match = !q || name.includes(q);
    item.style.display = match ? "" : "none";
    if (match) visible++;
  });
  queueSearchClear.style.display = q ? "block" : "none";
  queueSearchEmpty.style.display = (q && visible === 0) ? "block" : "none";
}

queueSearch.addEventListener("input", (e) => filterQueues(e.target.value));

queueSearchClear.addEventListener("click", () => {
  queueSearch.value = "";
  filterQueues("");
  queueSearch.focus();
});

// ── Trigger manual ────────────────────────────────────────────────────
btnManualTrigger.addEventListener("click", async () => {
  btnManualTrigger.textContent = "...";
  btnManualTrigger.disabled = true;

  chrome.runtime.sendMessage({ type: "QTL_MANUAL_TRIGGER" });
  showToast("⚡ Trigger manual enviado", "ok");
  appendLog("ok", "Trigger manual disparado");

  setTimeout(() => {
    btnManualTrigger.textContent = "⚡";
    btnManualTrigger.disabled = false;
  }, 2000);
});

// ── Editor de colas (pestaña completa) ───────────────────────────────
const openEditor = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
  window.close();
};
btnEditQueues.addEventListener("click", openEditor);
document.getElementById("btnEditQueuesInline").addEventListener("click", openEditor);

// ── Log system ────────────────────────────────────────────────────────
const MAX_LOGS = 20;

async function loadLogs() {
  const { logs } = await chrome.storage.local.get("logs");
  if (logs?.length) {
    logBox.innerHTML = "";
    logs.forEach((l) => renderLog(l.level, l.text, l.time));
  }
}

function appendLog(level, text) {
  const entry = { level, text, time: new Date().toLocaleTimeString("es-UY") };
  renderLog(entry.level, entry.text, entry.time);
  chrome.storage.local.get("logs", ({ logs = [] }) => {
    chrome.storage.local.set({ logs: [...logs, entry].slice(-MAX_LOGS) });
  });
}

function renderLog(level, text, time) {
  const span = document.createElement("span");
  span.className  = `log-line log-${level}`;
  span.textContent = `[${time}] ${text}`;
  logBox.appendChild(span);
  if (logBox.children.length > MAX_LOGS) logBox.removeChild(logBox.firstChild);
  logBox.scrollTop = logBox.scrollHeight;
}

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type) {
  toast.textContent = msg;
  toast.className   = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.className = ""), 2500);
}

// ── Download helper ───────────────────────────────────────────────────
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
