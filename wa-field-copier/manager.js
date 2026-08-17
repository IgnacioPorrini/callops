// manager.js — template editor logic

let templates = [];
let activeIdx = null;
let pickingFieldIdx = null;

const ATTR_OPTIONS = [
  { value: 'text', label: 'Texto (innerText)' },
  { value: 'href', label: 'Enlace (href)' },
  { value: 'src', label: 'Fuente (src)' },
  { value: 'value', label: 'Valor (value)' },
];

async function init() {
  const { waTemplates = [] } = await chrome.storage.local.get('waTemplates');
  templates = waTemplates;
  renderSidebar();

  // Listen for picker results from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PICKER_RESULT' && pickingFieldIdx !== null) {
      const input = document.querySelector(`[data-field-selector="${pickingFieldIdx}"]`);
      if (input) input.value = msg.selector;

      // Stop pulsing button
      const btn = document.querySelector(`[data-pick-btn="${pickingFieldIdx}"]`);
      if (btn) {
        btn.classList.remove('picking');
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> Seleccionar`;
      }
      pickingFieldIdx = null;
    }
  });
}

function renderSidebar() {
  const list = document.getElementById('templateList');
  list.innerHTML = '';

  if (templates.length === 0) {
    list.innerHTML = '<div style="padding:16px 10px;color:var(--text-dim);font-size:12px;text-align:center">Sin plantillas aún</div>';
    return;
  }

  templates.forEach((tpl, i) => {
    const item = document.createElement('div');
    item.className = 'tpl-item' + (i === activeIdx ? ' active' : '');
    item.innerHTML = `
      <div>
        <div class="tpl-name">${escHtml(tpl.name)}</div>
        <div class="tpl-count">${tpl.fields.length} campo${tpl.fields.length !== 1 ? 's' : ''}</div>
      </div>
      <button class="tpl-del" data-del="${i}" title="Eliminar">✕</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.dataset.del !== undefined) return;
      selectTemplate(i);
    });
    item.querySelector('.tpl-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTemplate(i);
    });
    list.appendChild(item);
  });
}

function selectTemplate(idx) {
  activeIdx = idx;
  renderSidebar();
  renderEditor(templates[idx]);
  document.getElementById('editorFooter').style.display = 'flex';
  setSaveStatus('');
}

function renderEditor(tpl) {
  const container = document.getElementById('editorInner');
  container.innerHTML = `
    <div class="section-title">Nombre de la plantilla</div>
    <input type="text" id="tplName" value="${escHtml(tpl.name)}" placeholder="Ej: Publicación de propiedad">

    <div class="section-title" style="margin-top:20px">Formato del mensaje</div>
    <textarea id="tplFormat" placeholder="Usá {{clave}} para insertar campos. Ej:&#10;🏠 *{{titulo}}*&#10;📍 {{direccion}}&#10;🔗 {{enlace}}">${escHtml(tpl.format)}</textarea>
    <div class="format-hint">
      Usá <code>{{clave}}</code> para cada campo. Podés usar emojis, saltos de línea y texto fijo.
      El formato se respeta tal cual al copiar.
    </div>

    <div class="section-title" style="margin-top:24px">Campos a extraer</div>
    <div class="fields-list" id="fieldsList"></div>
    <button class="btn-add-field" id="btnAddField">+ Agregar campo</button>
  `;

  renderFields(tpl.fields);

  document.getElementById('btnAddField').addEventListener('click', () => {
    tpl.fields.push({ key: '', selector: '', attr: 'text' });
    renderFields(tpl.fields);
  });
}

function renderFields(fields) {
  const list = document.getElementById('fieldsList');
  list.innerHTML = '';

  fields.forEach((field, i) => {
    const card = document.createElement('div');
    card.className = 'field-card';
    card.innerHTML = `
      <div class="field-card-row">
        <div class="field-group" style="max-width:140px">
          <div class="f-label">CLAVE <span style="color:var(--green)">{{clave}}</span></div>
          <input type="text" data-field-key="${i}" value="${escHtml(field.key)}" placeholder="ej: titulo">
        </div>
        <div class="field-group">
          <div class="f-label">ATRIBUTO</div>
          <select class="small" data-field-attr="${i}">
            ${ATTR_OPTIONS.map(o => `<option value="${o.value}"${field.attr === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <button class="btn-del-field" data-del-field="${i}" title="Eliminar campo">✕</button>
      </div>
      <div class="field-card-row">
        <div class="field-group">
          <div class="f-label">SELECTOR CSS</div>
          <input type="text" data-field-selector="${i}" value="${escHtml(field.selector)}" placeholder="ej: h1.title  o  #price">
        </div>
        <button class="btn-pick picking-inactive" data-pick-btn="${i}" title="Hacer clic en el elemento de la página">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          Seleccionar
        </button>
      </div>
    `;

    // Events
    card.querySelector(`[data-field-key="${i}"]`).addEventListener('input', e => { fields[i].key = e.target.value; });
    card.querySelector(`[data-field-selector="${i}"]`).addEventListener('input', e => { fields[i].selector = e.target.value; });
    card.querySelector(`[data-field-attr="${i}"]`).addEventListener('change', e => { fields[i].attr = e.target.value; });

    card.querySelector(`[data-del-field="${i}"]`).addEventListener('click', () => {
      fields.splice(i, 1);
      renderFields(fields);
    });

    card.querySelector(`[data-pick-btn="${i}"]`).addEventListener('click', (btn) => {
      const b = card.querySelector(`[data-pick-btn="${i}"]`);
      b.classList.add('picking');
      b.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> Hacé clic...`;
      pickingFieldIdx = i;
      chrome.runtime.sendMessage({ type: 'START_PICKER', fieldIndex: i });
    });

    list.appendChild(card);
  });
}

function gatherEditorData() {
  const tpl = templates[activeIdx];
  tpl.name = document.getElementById('tplName').value.trim() || 'Sin nombre';
  tpl.format = document.getElementById('tplFormat').value;
  // Fields already mutated in place via event listeners
  return tpl;
}

document.getElementById('btnNew').addEventListener('click', () => {
  const tpl = { name: 'Nueva plantilla', fields: [], format: '' };
  templates.push(tpl);
  activeIdx = templates.length - 1;
  renderSidebar();
  renderEditor(tpl);
  document.getElementById('editorFooter').style.display = 'flex';
  setSaveStatus('');
  document.getElementById('tplName').focus();
  document.getElementById('tplName').select();
});

document.getElementById('btnSave').addEventListener('click', async () => {
  if (activeIdx === null) return;
  gatherEditorData();
  await chrome.storage.local.set({ waTemplates: templates });
  renderSidebar();
  setSaveStatus('✓ Guardado', 'ok');
  setTimeout(() => setSaveStatus(''), 2500);
});

function deleteTemplate(idx) {
  if (!confirm(`¿Eliminar "${templates[idx].name}"?`)) return;
  templates.splice(idx, 1);
  if (activeIdx === idx) {
    activeIdx = null;
    document.getElementById('editorInner').innerHTML = `
      <div class="no-template">
        <div class="icon">📋</div>
        <p>Seleccioná una plantilla o creá una <strong>nueva</strong>.</p>
      </div>`;
    document.getElementById('editorFooter').style.display = 'none';
  } else if (activeIdx > idx) {
    activeIdx--;
  }
  chrome.storage.local.set({ waTemplates: templates });
  renderSidebar();
}

function setSaveStatus(msg, type = '') {
  const s = document.getElementById('saveStatus');
  if (!s) return;
  s.textContent = msg;
  s.className = 'save-status' + (type ? ' ' + type : '');
}

function escHtml(str) {
  return (str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

init();
