// background.js — service worker

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── START_PICKER: inject overlay into active tab ──────────────────────────
  if (msg.type === 'START_PICKER') {
    chrome.storage.local.set({
      pickerPending: { fieldIndex: msg.fieldIndex, templateIdx: msg.templateIdx }
    });
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: injectPicker,
        args: [msg.fieldIndex, msg.templateIdx]
      }).catch(err => console.error('picker inject error:', err));
    });
    sendResponse({ ok: true });
    return false;
  }

  // ── PICKER_DONE: save result, set badge ───────────────────────────────────
  if (msg.type === 'PICKER_DONE') {
    chrome.storage.local.set({
      pickerResult: {
        selector:    msg.selector,
        preview:     msg.preview,
        fieldIndex:  msg.fieldIndex,
        templateIdx: msg.templateIdx
      },
      pickerPending: null
    });
    chrome.action.setBadgeText({ text: '●' });
    chrome.action.setBadgeBackgroundColor({ color: '#25D366' });
    sendResponse({ ok: true });
    return false;
  }

  // ── PICKER_CANCELLED ──────────────────────────────────────────────────────
  if (msg.type === 'PICKER_CANCELLED') {
    chrome.storage.local.set({ pickerPending: null });
    sendResponse({ ok: true });
    return false;
  }

});

// ─────────────────────────────────────────────────────────────────────────────
// Injected into page: picker overlay
// Must be a self-contained function (no closures over outer scope)
// ─────────────────────────────────────────────────────────────────────────────
function injectPicker(fieldIndex, templateIdx) {
  // Remove stale overlay
  document.getElementById('__wapick__')?.remove();
  document.getElementById('__wapick_banner__')?.remove();
  document.getElementById('__wapick_hl__')?.remove();
  document.getElementById('__wapick_lbl__')?.remove();

  // Semi-transparent full-page overlay (catches mouse events)
  const overlay = document.createElement('div');
  overlay.id = '__wapick__';
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    zIndex: '2147483640', cursor: 'crosshair', background: 'rgba(0,0,0,0.25)'
  });

  // Instruction banner
  const banner = document.createElement('div');
  banner.id = '__wapick_banner__';
  banner.textContent = '🎯  Hacé clic en el elemento · ESC para cancelar';
  Object.assign(banner.style, {
    position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)',
    background: '#25D366', color: '#000', fontFamily: 'sans-serif', fontSize: '13px',
    fontWeight: '600', padding: '9px 18px', borderRadius: '999px',
    zIndex: '2147483647', pointerEvents: 'none', whiteSpace: 'nowrap',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
  });

  // Green highlight box
  const hl = document.createElement('div');
  hl.id = '__wapick_hl__';
  Object.assign(hl.style, {
    position: 'fixed', zIndex: '2147483639', pointerEvents: 'none',
    border: '2px solid #25D366', background: 'rgba(37,211,102,0.15)',
    borderRadius: '3px', boxSizing: 'border-box',
    top: '0', left: '0', width: '0', height: '0'
  });

  // Tag label
  const lbl = document.createElement('div');
  lbl.id = '__wapick_lbl__';
  Object.assign(lbl.style, {
    position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
    background: '#25D366', color: '#000', fontFamily: 'monospace', fontSize: '11px',
    padding: '1px 6px', borderRadius: '3px', display: 'none'
  });

  document.body.append(banner, hl, lbl, overlay);

  let hoveredEl = null;

  overlay.addEventListener('mousemove', (e) => {
    // Temporarily hide overlay to hit-test the real element underneath
    overlay.style.display = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.display = '';
    if (!el) return;
    hoveredEl = el;
    const r = el.getBoundingClientRect();
    Object.assign(hl.style, {
      left:   r.left + 'px',
      top:    r.top  + 'px',
      width:  r.width  + 'px',
      height: r.height + 'px'
    });
    lbl.textContent = '<' + el.nodeName.toLowerCase() + '>';
    lbl.style.display = 'block';
    lbl.style.left = r.left + 'px';
    lbl.style.top  = Math.max(0, r.top - 20) + 'px';
  });

  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hoveredEl) return;

    // Build CSS selector
    function getSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
        if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
        let seg = cur.nodeName.toLowerCase();
        // Try unique class combo on parent
        if (cur.className && typeof cur.className === 'string') {
          const classes = cur.className.trim().split(/\s+/).filter(Boolean);
          if (classes.length) {
            const candidate = seg + '.' + classes.map(c => CSS.escape(c)).join('.');
            try {
              if (!cur.parentElement || cur.parentElement.querySelectorAll(candidate).length === 1) {
                parts.unshift(candidate);
                break;
              }
            } catch(e) {}
          }
        }
        // nth-of-type
        let n = 1, s = cur.previousElementSibling;
        while (s) { if (s.nodeName === cur.nodeName) n++; s = s.previousElementSibling; }
        if (n > 1) seg += ':nth-of-type(' + n + ')';
        parts.unshift(seg);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    function getPreview(el) {
      return (el.innerText || el.textContent || el.value || el.getAttribute('href') || '')
        .trim().replace(/\s+/g, ' ').slice(0, 80);
    }

    const selector = getSelector(hoveredEl);
    const preview  = getPreview(hoveredEl);
    cleanup();
    chrome.runtime.sendMessage({ type: 'PICKER_DONE', selector, preview, fieldIndex, templateIdx });
  });

  function cleanup() {
    overlay.remove(); banner.remove(); hl.remove(); lbl.remove();
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({ type: 'PICKER_CANCELLED' });
    }
  }
  document.addEventListener('keydown', onEsc);
}
