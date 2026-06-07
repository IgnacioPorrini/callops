/**
 * editor.js — Queue Tab Launcher v1.8.0
 * Página completa de edición de colas y pestañas.
 *
 * @author Ignacio
 * @built-with Claude Sonnet 4.6 (Anthropic)
 */

let savedConfig = null;

// ── Init ──────────────────────────────────────────────────────────────
(async function init() {
  const { config } = await chrome.storage.local.get("config");

  if (!config) {
    document.getElementById("queueList").innerHTML = `
      <div class="empty-state">
        Sin configuración cargada.<br>
        Cargá un archivo JSON desde el popup de la extensión.
      </div>`;
    return;
  }

  savedConfig = config;
  renderQueues(config.queues || []);
})();

// ── Render ────────────────────────────────────────────────────────────
function renderQueues(queues) {
  const list = document.getElementById("queueList");
  list.innerHTML = "";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "14px";
  queues.forEach((q, i) => list.appendChild(createQueueCard(q, i + 1)));
}

function createQueueCard(q = {}, num = 1) {
  const card = document.createElement("div");
  card.className = "queue-card";

  // ── Header ──
  const header = document.createElement("div");
  header.className = "queue-card-header";

  const numEl = document.createElement("span");
  numEl.className = "queue-num";
  numEl.textContent = `#${String(num).padStart(2, "0")}`;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "queue-name-input";
  nameInput.value = q.name || "";
  nameInput.placeholder = "Nombre de la cola";

  const moveUp = document.createElement("button");
  moveUp.type = "button";
  moveUp.className = "move-btn";
  moveUp.title = "Mover arriba";
  moveUp.textContent = "↑";
  moveUp.addEventListener("click", () => {
    const prev = card.previousElementSibling;
    if (prev) { card.parentNode.insertBefore(card, prev); renumber(); }
  });

  const moveDown = document.createElement("button");
  moveDown.type = "button";
  moveDown.className = "move-btn";
  moveDown.title = "Mover abajo";
  moveDown.textContent = "↓";
  moveDown.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (next) { card.parentNode.insertBefore(next, card); renumber(); }
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "del-queue-btn";
  delBtn.textContent = "✕ Eliminar cola";
  delBtn.addEventListener("click", () => {
    const cards = document.querySelectorAll("#queueList .queue-card");
    if (cards.length <= 1) { showToast("Se necesita al menos una cola", "err"); return; }
    card.remove();
    renumber();
  });

  header.append(numEl, nameInput, moveUp, moveDown, delBtn);

  // ── Body ──
  const body = document.createElement("div");
  body.className = "queue-card-body";

  // Cabecera de columnas
  const colRow = document.createElement("div");
  colRow.className = "col-labels";
  colRow.innerHTML = `
    <span class="col-lbl lbl-title">Título (opcional)</span>
    <span class="col-lbl lbl-url">URL de la pestaña *</span>
    <span class="col-lbl lbl-active" title="Abre en foco">Foco</span>
    <span class="col-lbl lbl-del"></span>
  `;
  body.appendChild(colRow);

  // Filas de pestañas
  (q.tabs || []).forEach(t => body.appendChild(createTabRow(t)));

  // Botón agregar pestaña
  const addTabBtn = document.createElement("button");
  addTabBtn.type = "button";
  addTabBtn.className = "add-tab-btn";
  addTabBtn.textContent = "+ Agregar pestaña";
  addTabBtn.addEventListener("click", () => {
    const row = createTabRow({ url: "", active: false });
    body.insertBefore(row, addTabBtn);
    row.querySelector(".url-input").focus();
  });
  body.appendChild(addTabBtn);

  card.append(header, body);
  return card;
}

function createTabRow(t = {}) {
  const row = document.createElement("div");
  row.className = "tab-row";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "tab-input title-input";
  titleInput.value = t.title || "";
  titleInput.placeholder = "Nombre visible";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.className = "tab-input url-input";
  urlInput.value = t.url || "";
  urlInput.placeholder = "https://";

  const activeWrap = document.createElement("label");
  activeWrap.className = "active-wrap";
  activeWrap.title = "Abre en foco al abrir la cola";
  const activeInput = document.createElement("input");
  activeInput.type = "checkbox";
  activeInput.checked = t.active === true;
  activeWrap.appendChild(activeInput);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "tab-del-btn";
  delBtn.title = "Eliminar pestaña";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", () => row.remove());

  row.append(titleInput, urlInput, activeWrap, delBtn);
  return row;
}

function renumber() {
  document.querySelectorAll("#queueList .queue-num").forEach((el, i) => {
    el.textContent = `#${String(i + 1).padStart(2, "0")}`;
  });
}

// ── Guardar ───────────────────────────────────────────────────────────
document.getElementById("btnSave").addEventListener("click", async () => {
  if (!savedConfig) { showToast("Sin configuración base", "err"); return; }

  // Leer config ACTUAL de storage ANTES de construir newQueues,
  // para usar como base de lookups (campaign, title fallback) y no pisar
  // cambios hechos desde el popup (selectores, call_notes_url, etc.)
  const { config: latestConfig } = await chrome.storage.local.get("config");
  const baseConfig = latestConfig || savedConfig;

  const newQueues = [];
  document.querySelectorAll("#queueList .queue-card").forEach(card => {
    const name = card.querySelector(".queue-name-input")?.value.trim();
    if (!name) return;

    const tabs = [];
    card.querySelectorAll(".tab-row").forEach(row => {
      const url   = row.querySelector(".url-input")?.value.trim();
      if (!url) return;
      const title  = row.querySelector(".title-input")?.value.trim() || "";
      const active = row.querySelector('input[type="checkbox"]')?.checked || false;
      const tab = { url, active };
      if (title) {
        tab.title = title;
      } else {
        // Fallback: si el input quedó vacío, preservar el título original por URL
        const origQ = (baseConfig.queues || []).find(q => q.name === name);
        const origTab = (origQ?.tabs || []).find(t => t.url === url);
        if (origTab?.title) tab.title = origTab.title;
      }
      tabs.push(tab);
    });

    const entry = { name, tabs };
    // Preservar campaign buscando por nombre (no por índice, permite reordenar)
    const oldQ = (baseConfig.queues || []).find(q => q.name === name);
    if (oldQ?.campaign) entry.campaign = oldQ.campaign;
    newQueues.push(entry);
  });

  if (!newQueues.length) { showToast("Agregá al menos una cola con URL", "err"); return; }

  baseConfig.queues = newQueues;
  savedConfig = { ...baseConfig }; // Actualizar referencia local

  await chrome.storage.local.set({ config: baseConfig });

  const btn = document.getElementById("btnSave");
  btn.textContent = "✓ Guardado";
  btn.classList.add("saved");
  showToast(`✓ ${newQueues.length} cola(s) guardadas`, "ok");

  setTimeout(() => {
    btn.textContent = "✓ Guardar cambios";
    btn.classList.remove("saved");
  }, 2500);
});

// ── Agregar cola ──────────────────────────────────────────────────────
document.getElementById("btnAddQueue").addEventListener("click", () => {
  const list = document.getElementById("queueList");
  const num  = list.querySelectorAll(".queue-card").length + 1;
  const card = createQueueCard({ name: "", tabs: [{ url: "", active: true }] }, num);
  list.appendChild(card);
  card.querySelector(".queue-name-input").focus();
  card.scrollIntoView({ behavior: "smooth", block: "center" });
});

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 2500);
}
