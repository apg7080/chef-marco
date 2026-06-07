/* nudge.js — in-browser element inspector + tweak panel for Chef Marco recipes.
   Activate by appending ?nudge to the URL. Click any element to select.
   Adjust spacing, sizing, color, weight via panel. Export diff to clipboard. */
(function () {
  if (!/[?&]nudge\b/.test(location.search)) return;

  var changes = new Map(); // key: stable selector → { props: {prop: value}, label }
  var current = null;
  var hoverEl = null;

  var css = `
    .nudge-pick-hover { outline: 2px dashed oklch(0.55 0.18 250) !important; outline-offset: 2px !important; cursor: crosshair !important; }
    .nudge-pick-selected { outline: 2px solid oklch(0.55 0.18 250) !important; outline-offset: 2px !important; }
    #nudge-panel {
      position: fixed; top: 16px; right: 16px; width: 340px; max-height: calc(100vh - 32px);
      background: #fff; color: #111; border: 1px solid #ddd; border-radius: 10px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.18); z-index: 99999;
      font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; overflow: auto; padding: 14px;
    }
    #nudge-panel h4 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; font-weight: 600; }
    #nudge-panel .row { display: grid; grid-template-columns: 90px 1fr 56px; gap: 8px; align-items: center; margin-bottom: 6px; }
    #nudge-panel label { color: #444; font-size: 11px; }
    #nudge-panel input[type=range] { width: 100%; }
    #nudge-panel input[type=text], #nudge-panel input[type=color] { width: 100%; font: 12px ui-monospace, monospace; padding: 4px 6px; border: 1px solid #ddd; border-radius: 4px; }
    #nudge-panel .val { font: 11px ui-monospace, monospace; color: #222; text-align: right; }
    #nudge-panel .sel { font: 11px ui-monospace, monospace; background: #f4f4f4; padding: 6px 8px; border-radius: 4px; margin-bottom: 10px; word-break: break-all; }
    #nudge-panel .actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
    #nudge-panel button {
      font: 11px ui-sans-serif, system-ui, sans-serif; padding: 6px 10px;
      border: 1px solid #ccc; background: #f8f8f8; border-radius: 4px; cursor: pointer;
    }
    #nudge-panel button.primary { background: oklch(0.55 0.18 250); color: white; border-color: transparent; }
    #nudge-panel button:hover { background: #eee; }
    #nudge-panel button.primary:hover { filter: brightness(1.05); }
    #nudge-panel .hint { color: #888; font-size: 11px; margin: 4px 0 10px; }
    #nudge-panel hr { border: 0; border-top: 1px solid #eee; margin: 10px 0; }
    #nudge-summary { font: 11px ui-monospace, monospace; background: #fafaf6; border: 1px solid #eee; border-radius: 4px; padding: 6px 8px; max-height: 140px; overflow: auto; white-space: pre-wrap; }
  `;
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function buildSelector(el) {
    // Stable-ish: tag + classes (skip nudge-* + reveal state) + nth-of-type when ambiguous.
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node !== document.body && depth < 4) {
      var tag = node.tagName.toLowerCase();
      var classes = (node.className && typeof node.className === 'string')
        ? node.className.split(/\s+/).filter(function (c) { return c && !/^nudge-/.test(c) && c !== 'in' && c !== 'reveal'; })
        : [];
      var seg = tag + (classes.length ? '.' + classes.join('.') : '');
      // Disambiguate by nth-of-type if siblings of same tag exist.
      var parent = node.parentElement;
      if (parent) {
        var same = Array.from(parent.children).filter(function (c) { return c.tagName === node.tagName; });
        if (same.length > 1) {
          var idx = same.indexOf(node) + 1;
          seg += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(seg);
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function pxValue(v) { return parseFloat(v) || 0; }

  function panel() {
    var p = document.getElementById('nudge-panel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'nudge-panel';
    p.innerHTML = `
      <h4>Nudge inspector</h4>
      <div class="hint">Click any element on the page to select.</div>
      <div class="sel" id="nudge-sel">no selection</div>
      <div id="nudge-controls"></div>
      <hr>
      <div class="actions">
        <button id="nudge-export" class="primary">Copy diff</button>
        <button id="nudge-reset">Reset element</button>
        <button id="nudge-clear">Clear all</button>
      </div>
      <hr>
      <h4>Pending changes</h4>
      <div id="nudge-summary">none</div>
    `;
    document.body.appendChild(p);
    p.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    p.addEventListener('click', function (e) { e.stopPropagation(); });
    document.getElementById('nudge-export').addEventListener('click', exportDiff);
    document.getElementById('nudge-reset').addEventListener('click', resetCurrent);
    document.getElementById('nudge-clear').addEventListener('click', clearAll);
    return p;
  }

  function rowRange(labelText, prop, min, max, step, unit, currentVal) {
    var row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label>${labelText}</label><input type="range" min="${min}" max="${max}" step="${step}"><span class="val"></span>`;
    var input = row.querySelector('input');
    var val = row.querySelector('.val');
    input.value = currentVal;
    val.textContent = currentVal + unit;
    input.addEventListener('input', function () {
      val.textContent = input.value + unit;
      applyChange(prop, input.value + unit);
    });
    return row;
  }

  function rowText(labelText, prop, currentVal) {
    var row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label>${labelText}</label><input type="text" value="${currentVal}"><span class="val"></span>`;
    var input = row.querySelector('input');
    input.addEventListener('change', function () { applyChange(prop, input.value); });
    return row;
  }

  function rowColor(labelText, prop, currentVal) {
    var row = document.createElement('div');
    row.className = 'row';
    var hex = rgbToHex(currentVal);
    row.innerHTML = `<label>${labelText}</label><input type="color" value="${hex}"><span class="val">${hex}</span>`;
    var input = row.querySelector('input');
    var val = row.querySelector('.val');
    input.addEventListener('input', function () {
      val.textContent = input.value;
      applyChange(prop, input.value);
    });
    return row;
  }

  function rgbToHex(v) {
    var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(v);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(function (n) { return parseInt(n, 10).toString(16).padStart(2, '0'); }).join('');
  }

  function applyChange(prop, value) {
    if (!current) return;
    current.el.style.setProperty(prop, value, 'important');
    var rec = changes.get(current.key);
    if (!rec) { rec = { selector: current.key, props: {} }; changes.set(current.key, rec); }
    rec.props[prop] = value;
    renderSummary();
  }

  function renderSummary() {
    var lines = [];
    changes.forEach(function (rec) {
      lines.push(rec.selector);
      Object.keys(rec.props).forEach(function (p) { lines.push('  ' + p + ': ' + rec.props[p] + ';'); });
    });
    document.getElementById('nudge-summary').textContent = lines.length ? lines.join('\n') : 'none';
  }

  function buildControls(el) {
    var ctrl = document.getElementById('nudge-controls');
    ctrl.innerHTML = '';
    var cs = getComputedStyle(el);
    ctrl.appendChild(rowRange('font-size', 'font-size', 8, 96, 0.5, 'px', pxValue(cs.fontSize)));
    ctrl.appendChild(rowText('line-height', 'line-height', cs.lineHeight === 'normal' ? '1.5' : cs.lineHeight));
    ctrl.appendChild(rowRange('letter-spacing', 'letter-spacing', -2, 4, 0.05, 'px', pxValue(cs.letterSpacing) || 0));
    ctrl.appendChild(rowText('font-weight', 'font-weight', cs.fontWeight));
    ctrl.appendChild(rowColor('color', 'color', cs.color));
    ctrl.appendChild(rowRange('margin-top', 'margin-top', 0, 160, 1, 'px', pxValue(cs.marginTop)));
    ctrl.appendChild(rowRange('margin-bottom', 'margin-bottom', 0, 160, 1, 'px', pxValue(cs.marginBottom)));
    ctrl.appendChild(rowRange('padding-top', 'padding-top', 0, 80, 1, 'px', pxValue(cs.paddingTop)));
    ctrl.appendChild(rowRange('padding-bottom', 'padding-bottom', 0, 80, 1, 'px', pxValue(cs.paddingBottom)));
    ctrl.appendChild(rowRange('padding-left', 'padding-left', 0, 80, 1, 'px', pxValue(cs.paddingLeft)));
    ctrl.appendChild(rowRange('padding-right', 'padding-right', 0, 80, 1, 'px', pxValue(cs.paddingRight)));
    ctrl.appendChild(rowText('max-width', 'max-width', cs.maxWidth));
    ctrl.appendChild(rowText('text-align', 'text-align', cs.textAlign));
  }

  function selectEl(el) {
    if (current) current.el.classList.remove('nudge-pick-selected');
    current = { el: el, key: buildSelector(el) };
    el.classList.add('nudge-pick-selected');
    document.getElementById('nudge-sel').textContent = current.key;
    buildControls(el);
  }

  function resetCurrent() {
    if (!current) return;
    current.el.removeAttribute('style');
    changes.delete(current.key);
    buildControls(current.el);
    renderSummary();
  }

  function clearAll() {
    changes.forEach(function (rec, key) {
      var el = document.querySelector(key);
      if (el) el.removeAttribute('style');
    });
    changes.clear();
    if (current) buildControls(current.el);
    renderSummary();
  }

  function exportDiff() {
    var payload = {
      generated_at: new Date().toISOString(),
      url: location.pathname,
      changes: Array.from(changes.values()),
    };
    var text = JSON.stringify(payload, null, 2);
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById('nudge-export');
      var orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = orig; }, 1200);
    }, function () {
      var w = window.open('', '_blank');
      w.document.body.innerText = text;
    });
  }

  // Hover highlight + click-to-select.
  document.addEventListener('mousemove', function (e) {
    if (e.target.closest('#nudge-panel')) {
      if (hoverEl) { hoverEl.classList.remove('nudge-pick-hover'); hoverEl = null; }
      return;
    }
    if (hoverEl && hoverEl !== e.target) hoverEl.classList.remove('nudge-pick-hover');
    hoverEl = e.target;
    if (hoverEl !== document.body && !hoverEl.classList.contains('nudge-pick-selected')) {
      hoverEl.classList.add('nudge-pick-hover');
    }
  }, true);

  document.addEventListener('click', function (e) {
    if (e.target.closest('#nudge-panel')) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (hoverEl) hoverEl.classList.remove('nudge-pick-hover');
    selectEl(el);
  }, true);

  panel();
  console.log('[nudge] active. Click any element. Append ?nudge to other recipes to enable.');
})();
