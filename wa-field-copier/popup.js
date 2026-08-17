// popup.js

let templates = [];
let activeEditIdx = null;
let extracted = '';

// ── Storage (sync con fallback a local) ───────────────────────────────────────
async function loadTemplates() {
  try {
    const { waTemplates } = await chrome.storage.sync.get('waTemplates');
    if (waTemplates?.length) return waTemplates;
  } catch { /* quota o sin permisos */ }

  // Migrar desde local si sync está vacío
  const { waTemplates: local = [] } = await chrome.storage.local.get('waTemplates');
  if (local.length) {
    try { await chrome.storage.sync.set({ waTemplates: local }); } catch { }
  }
  return local;
}

async function save() {
  try {
    await chrome.storage.sync.set({ waTemplates: templates });
  } catch {
    // Si supera la cuota de sync (100KB), caer a local
    setStatus('edit', 'Sync lleno, guardado localmente.', '');
  }
  // Siempre guardar en local como respaldo
  await chrome.storage.local.set({ waTemplates: templates });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  templates = await loadTemplates();
  renderUseScreen();
  renderEditScreen();
  await checkPickerResult();
  bindTabs();
})();

// ── Tabs ──────────────────────────────────────────────────────────────────────
function bindTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('visible', s.id === 'screen-' + name));
}

// ── USE screen ────────────────────────────────────────────────────────────────
function renderUseScreen() {
  const sel = document.getElementById('useSelect');
  sel.innerHTML = '';
  if (!templates.length) {
    sel.innerHTML = '<option value="">— Sin plantillas —</option>';
    return;
  }
  templates.forEach((t, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = t.name;
    sel.appendChild(o);
  });
}

document.getElementById('btnExtract').addEventListener('click', async () => {
  const idx = parseInt(document.getElementById('useSelect').value);
  const tpl = templates[idx];

  if (!tpl)              return setStatus('use', 'Seleccioná una plantilla.', 'err');
  if (!tpl.fields?.length) return setStatus('use', 'La plantilla no tiene campos. Configurala en Editar.', 'err');

  const emptySelectors = tpl.fields.filter(f => !f.selector?.trim());
  if (emptySelectors.length) return setStatus('use', `${emptySelectors.length} campo(s) sin selector. Completalos en Editar.`, 'err');

  setStatus('use', 'Extrayendo…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) return setStatus('use', 'No se encontró la pestaña activa.', 'err');

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fields) => {
        return fields.map(field => {
          try {
            if (!field.selector) return '';
            const el = document.querySelector(field.selector);
            if (!el) return '[no encontrado: ' + field.selector + ']';
            const attr = field.attr || 'text';
            if (attr === 'text')  return (el.innerText || el.textContent || '').trim();
            if (attr === 'href')  return el.href || el.getAttribute('href') || '';
            if (attr === 'src')   return el.src  || el.getAttribute('src')  || '';
            if (attr === 'value') return el.value || '';
            return el.getAttribute(attr) || '';
          } catch(e) {
            return '[error: ' + e.message + ']';
          }
        });
      },
      args: [tpl.fields]
    });

    const values = results?.[0]?.result;
    if (!values) return setStatus('use', 'Error al ejecutar en la página.', 'err');

    let msg = tpl.format || '';
    tpl.fields.forEach((f, i) => {
      if (f.key) msg = msg.split('{{' + f.key + '}}').join(values[i] ?? '');
    });

    extracted = msg;
    const preview = document.getElementById('usePreview');
    preview.textContent = msg || '(mensaje vacío — revisá que el formato tenga {{claves}} y los selectores sean correctos)';
    preview.classList.remove('dim');
    document.getElementById('btnCopy').disabled = false;
    setStatus('use', '✓ Listo', 'ok');

  } catch (err) {
    console.error('WACopier extract error:', err);
    setStatus('use', 'Error: ' + err.message, 'err');
  }
});

document.getElementById('btnCopy').addEventListener('click', async () => {
  if (!extracted) return;
  try { await navigator.clipboard.writeText(extracted); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = extracted;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  setStatus('use', '✓ ¡Copiado!', 'ok');
  setTimeout(() => setStatus('use', ''), 2000);
});

// ── EDIT screen ───────────────────────────────────────────────────────────────
function renderEditScreen() {
  const sel = document.getElementById('editSelect');
  sel.innerHTML = '';

  if (!templates.length) {
    document.getElementById('editForm').style.display = 'none';
    document.getElementById('editEmpty').style.display = 'block';
    return;
  }

  document.getElementById('editEmpty').style.display = 'none';
  templates.forEach((t, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = t.name;
    sel.appendChild(o);
  });

  if (activeEditIdx === null || activeEditIdx >= templates.length) activeEditIdx = 0;
  sel.value = activeEditIdx;
  loadEditForm(templates[activeEditIdx]);
}

document.getElementById('editSelect').addEventListener('change', () => {
  syncFormToTemplate();
  activeEditIdx = parseInt(document.getElementById('editSelect').value);
  loadEditForm(templates[activeEditIdx]);
});

function loadEditForm(tpl) {
  if (!tpl) return;
  document.getElementById('editForm').style.display = 'block';
  document.getElementById('tplName').value   = tpl.name   || '';
  document.getElementById('tplFormat').value = tpl.format || '';
  renderFields(tpl.fields || []);
  setStatus('edit', '');
}

// ── Fields ────────────────────────────────────────────────────────────────────
function renderFields(fields) {
  const list = document.getElementById('fieldsList');
  list.innerHTML = '';

  fields.forEach((field, i) => {
    const card = document.createElement('div');
    card.className = 'field-card';
    card.innerHTML = `
      <div class="field-row">
        <div class="field-group" style="max-width:115px">
          <div class="field-lbl">CLAVE  <span style="color:var(--green);font-weight:600">{{···}}</span></div>
          <input type="text" class="f-key" placeholder="ej: tel" value="${esc(field.key)}">
        </div>
        <div class="field-group">
          <div class="field-lbl">EXTRAER</div>
          <select class="mini f-attr">
            <option value="text"${field.attr==='text'||!field.attr?' selected':''}>Texto</option>
            <option value="href"${field.attr==='href'?' selected':''}>Enlace (href)</option>
            <option value="src"${field.attr==='src'?' selected':''}>Imagen (src)</option>
            <option value="value"${field.attr==='value'?' selected':''}>Value</option>
          </select>
        </div>
        <button class="btn-del-field" title="Eliminar">✕</button>
      </div>
      <div class="field-row">
        <div class="field-group">
          <div class="field-lbl">SELECTOR CSS</div>
          <div class="sel-row">
            <input type="text" class="f-sel" placeholder="ej: #precio  o  h1.titulo" value="${esc(field.selector)}">
            <button class="btn-capture">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
              Capturar
            </button>
          </div>
          <div class="preview-tag ${field.preview?'ok':''}">${field.preview ? '↳ '+esc(field.preview) : 'Sin capturar aún'}</div>
        </div>
      </div>`;

    card.querySelector('.f-key').addEventListener('input',    e => { field.key      = e.target.value; });
    card.querySelector('.f-attr').addEventListener('change',  e => { field.attr     = e.target.value; });
    card.querySelector('.f-sel').addEventListener('input',    e => { field.selector = e.target.value; });
    card.querySelector('.btn-del-field').addEventListener('click', () => { fields.splice(i,1); renderFields(fields); });
    card.querySelector('.btn-capture').addEventListener('click', () => startCapture(i));

    list.appendChild(card);
  });
}

document.getElementById('btnAddField').addEventListener('click', () => {
  const tpl = templates[activeEditIdx];
  if (!tpl) return;
  if (!tpl.fields) tpl.fields = [];
  tpl.fields.push({ key:'', selector:'', attr:'text', preview:'' });
  renderFields(tpl.fields);
  document.querySelectorAll('.f-key').forEach((el,i,arr) => { if(i===arr.length-1) el.focus(); });
});

// ── Capture ───────────────────────────────────────────────────────────────────
function startCapture(fieldIdx) {
  syncFormToTemplate();
  chrome.runtime.sendMessage({ type:'START_PICKER', fieldIndex:fieldIdx, templateIdx:activeEditIdx });
  window.close();
}

async function checkPickerResult() {
  const { pickerResult, pickerPending } = await chrome.storage.local.get(['pickerResult','pickerPending']);

  if (pickerPending) {
    document.getElementById('pickerBanner').classList.add('visible');
    switchTab('edit');
  }

  if (pickerResult) {
    await chrome.storage.local.remove('pickerResult');
    chrome.action.setBadgeText({ text:'' });
    const { selector, preview, fieldIndex, templateIdx } = pickerResult;
    if (templates[templateIdx]?.fields?.[fieldIndex] !== undefined) {
      templates[templateIdx].fields[fieldIndex].selector = selector;
      templates[templateIdx].fields[fieldIndex].preview  = preview;
      activeEditIdx = templateIdx;
      await save();
      switchTab('edit');
      renderEditScreen();
      setStatus('edit', '✓ Elemento capturado (campo ' + (fieldIndex+1) + ')', 'ok');
    }
  }
}

// ── New / Duplicate / Delete ──────────────────────────────────────────────────
document.getElementById('btnNewTpl').addEventListener('click', async () => {
  templates.push({ name:'Nueva plantilla', format:'', fields:[] });
  activeEditIdx = templates.length - 1;
  await save();
  renderEditScreen();
  renderUseScreen();
  document.getElementById('tplName').focus();
  document.getElementById('tplName').select();
});

document.getElementById('btnDupTpl').addEventListener('click', async () => {
  if (activeEditIdx === null || !templates.length) return;
  syncFormToTemplate();
  const src  = templates[activeEditIdx];
  const copy = JSON.parse(JSON.stringify(src)); // deep clone
  copy.name  = 'Copia de ' + src.name;
  // Limpiar previews — son específicos de la máquina donde se capturaron
  copy.fields.forEach(f => { f.preview = ''; });
  templates.push(copy);
  activeEditIdx = templates.length - 1;
  await save();
  renderEditScreen();
  renderUseScreen();
  document.getElementById('tplName').focus();
  document.getElementById('tplName').select();
  setStatus('edit', '✓ Plantilla duplicada', 'ok');
  setTimeout(() => setStatus('edit', ''), 2000);
});

document.getElementById('btnDelTpl').addEventListener('click', async () => {
  if (activeEditIdx === null || !templates.length) return;
  if (!confirm('¿Eliminar "' + templates[activeEditIdx].name + '"?')) return;
  templates.splice(activeEditIdx, 1);
  activeEditIdx = templates.length ? 0 : null;
  await save();
  renderEditScreen();
  renderUseScreen();
});

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById('btnSave').addEventListener('click', async () => {
  if (activeEditIdx === null) return;
  syncFormToTemplate();
  await save();
  renderUseScreen();
  document.querySelectorAll('#editSelect option').forEach((o,i) => { o.textContent = templates[i]?.name || o.textContent; });
  setStatus('edit', '✓ Guardado', 'ok');
  setTimeout(() => setStatus('edit',''), 2000);
});

function syncFormToTemplate() {
  if (activeEditIdx === null || !templates[activeEditIdx]) return;
  const tpl = templates[activeEditIdx];
  const nameEl   = document.getElementById('tplName');
  const formatEl = document.getElementById('tplFormat');
  if (nameEl)   tpl.name   = nameEl.value.trim() || 'Sin nombre';
  if (formatEl) tpl.format = formatEl.value;
  document.querySelectorAll('.field-card').forEach((card, i) => {
    if (!tpl.fields[i]) return;
    const k = card.querySelector('.f-key');
    const a = card.querySelector('.f-attr');
    const s = card.querySelector('.f-sel');
    if (k) tpl.fields[i].key      = k.value;
    if (a) tpl.fields[i].attr     = a.value;
    if (s) tpl.fields[i].selector = s.value;
  });
}

// ── Export / Import ───────────────────────────────────────────────────────────
document.getElementById('btnExport').addEventListener('click', () => {
  syncFormToTemplate();
  if (!templates.length) return setStatus('edit', 'No hay plantillas para exportar.', 'err');

  // Limpiar previews antes de exportar — son datos de la máquina local
  const clean = templates.map(t => ({
    ...t,
    fields: t.fields.map(({ preview: _p, ...f }) => f)
  }));

  const json = JSON.stringify({ waTemplates: clean }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href     = url;
  a.download = `wa-copier-plantillas-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('edit', `✓ ${templates.length} plantilla(s) exportada(s)`, 'ok');
  setTimeout(() => setStatus('edit', ''), 2500);
});

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importFile').value = '';
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text     = await file.text();
    const data     = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : (data.waTemplates ?? []);

    if (!incoming.length) return setStatus('edit', 'El archivo no contiene plantillas válidas.', 'err');

    const existingNames = new Set(templates.map(t => t.name));
    const dups    = incoming.filter(t =>  existingNames.has(t.name));
    const newOnes = incoming.filter(t => !existingNames.has(t.name));

    let replaceExisting = false;
    if (dups.length) {
      replaceExisting = confirm(
        `${dups.length} plantilla(s) ya existen con el mismo nombre:\n` +
        dups.map(d => `  • ${d.name}`).join('\n') +
        '\n\nAceptar = reemplazarlas\nCancelar = solo agregar las nuevas'
      );
    }

    if (replaceExisting) {
      dups.forEach(incoming => {
        const idx = templates.findIndex(t => t.name === incoming.name);
        if (idx !== -1) templates[idx] = { ...incoming, fields: incoming.fields.map(f => ({ ...f, preview: '' })) };
      });
    }

    const toAdd = newOnes.map(t => ({ ...t, fields: t.fields.map(f => ({ ...f, preview: '' })) }));
    templates.push(...toAdd);
    activeEditIdx = templates.length - 1;
    await save();
    renderEditScreen();
    renderUseScreen();

    const parts = [];
    if (toAdd.length)       parts.push(`${toAdd.length} nueva(s)`);
    if (replaceExisting)    parts.push(`${dups.length} reemplazada(s)`);
    else if (dups.length)   parts.push(`${dups.length} omitida(s) por duplicado`);
    setStatus('edit', '✓ ' + parts.join(', '), 'ok');
    setTimeout(() => setStatus('edit', ''), 3000);

  } catch {
    setStatus('edit', 'Archivo inválido. ¿Es un JSON de WA Copier?', 'err');
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(screen, msg, type) {
  const el = document.getElementById(screen==='use' ? 'useStatus' : 'editStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status' + (type ? ' '+type : '');
}
function esc(s) {
  return (s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
