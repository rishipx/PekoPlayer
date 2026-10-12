// Debug tools: a hidden panel (Ctrl+Shift+D) that copies what is needed to diagnose a layout, colour or markup problem.
// Everything stays on the device: each button puts text on the clipboard, and nothing is stored or sent anywhere.
(function () {
  'use strict';

  const MAX_ERRORS = 20;
  const MAX_RULES = 40;
  const recentErrors = [];

  const remember = (kind, message) => {
    recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${String(message).slice(0, 300)}`);
    if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
  };
  window.addEventListener('error', (e) =>
    remember('error', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`),
  );
  window.addEventListener('unhandledrejection', (e) => remember('unhandled rejection', e.reason?.message || e.reason));

  let panel = null;
  let status = null;
  let picking = null;

  // ---------- reports ----------

  const yes = (value) => (value ? 'yes' : 'no');

  /** Environment, features, app state and recent errors. File names and titles are left out on purpose. */
  function diagnostics() {
    const player = window.pekoPlayer;
    const wall = window.multiView;
    const canvas = document.createElement('canvas');
    const lines = [
      'PekoPlayer debug report',
      `Time: ${new Date().toISOString()}`,
      `Release: ${document.querySelector('meta[name="peko-release"]')?.content || 'unknown'}`,
      `Page: ${location.origin}${location.pathname}`,
      `Context: ${window.pekoDesktop ? 'desktop app' : matchMedia('(display-mode: standalone)').matches ? 'installed web app' : 'browser tab'}, secure context ${yes(isSecureContext)}`,
      `Browser: ${navigator.userAgent}`,
      `Window: ${innerWidth}x${innerHeight} at ${devicePixelRatio}x, scheme ${matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'}, reduced motion ${yes(matchMedia('(prefers-reduced-motion: reduce)').matches)}`,
      `Document attributes: ${JSON.stringify({ ...document.documentElement.dataset })}`,
      '',
      'Features',
      `  WebGL2 ${yes(canvas.getContext('webgl2'))}, OffscreenCanvas ${yes('OffscreenCanvas' in window)}, Workers ${yes('Worker' in window)}, Web Audio ${yes('AudioContext' in window)}`,
      `  Folder picker ${yes('showDirectoryPicker' in window)}, file handling ${yes('launchQueue' in window)}, service worker ${yes('serviceWorker' in navigator)} (controlled ${yes(navigator.serviceWorker?.controller)})`,
      `  Picture-in-picture ${yes(document.pictureInPictureEnabled)}, document PiP ${yes('documentPictureInPicture' in window)}, video frame callback ${yes('requestVideoFrameCallback' in HTMLVideoElement.prototype)}`,
      '',
      'State',
      `  Player: ${player ? `${player.playlist.length} item(s), current ${player.currentIndex}, look ${player.controlLook}` : 'not started'}`,
      `  Multi-view: ${wall ? `${wall.isOpen ? 'open' : 'closed'}, layout ${wall.layoutMode}, ${wall.tiles.length} tile(s), ${wall.cols} column(s), manual grid sizes ${yes(wall.gridSizes)}` : 'not started'}`,
      `  Missing player elements: ${
        player
          ? Object.entries(player.el)
              .filter(([, el]) => !el)
              .map(([id]) => id)
              .join(', ') || 'none'
          : 'n/a'
      }`,
      '',
      'Saved data (size in characters)',
      ...Object.entries(PekoConfig.STORAGE).map(
        ([name, key]) => `  ${name}: ${localStorage.getItem(key)?.length ?? 'not set'}`,
      ),
      '',
      `Recent errors (${recentErrors.length})`,
      ...(recentErrors.length ? recentErrors.map((line) => `  ${line}`) : ['  none']),
    ];
    return lines.join('\n');
  }

  /** Every CSS custom property the stylesheets declare, with the value in effect on the page and on the multi-view wall. */
  function themeTokens() {
    const names = new Set();
    walkRules((rule) => {
      for (const property of rule.style || []) if (property.startsWith('--')) names.add(property);
    });
    const root = getComputedStyle(document.documentElement);
    const wall = document.getElementById('mvView') ? getComputedStyle(document.getElementById('mvView')) : null;
    const lines = [
      'Theme tokens (page)',
      ...[...names].sort().map((name) => `  ${name}: ${root.getPropertyValue(name).trim()}`),
    ];
    if (wall) {
      const different = [...names]
        .sort()
        .filter((name) => wall.getPropertyValue(name).trim() !== root.getPropertyValue(name).trim());
      lines.push(
        '',
        `Tokens that differ on the multi-view wall (${different.length})`,
        ...different.map((name) => `  ${name}: ${wall.getPropertyValue(name).trim()}`),
      );
    }
    return lines.join('\n');
  }

  /** How many elements each named selector matches, to spot markup that no longer matches the code. */
  function selectorCheck() {
    const lines = ['Selector check'];
    const tiles = window.multiView?.tiles.length ?? 0;
    const tileParts = typeof PekoSelectors === 'undefined' ? {} : PekoSelectors.tile;
    for (const [name, selector] of Object.entries(tileParts)) {
      const found = document.querySelectorAll(selector).length;
      const expected =
        name === 'ytHolder' ? 'depends on tile type' : name === 'abloop' ? 'one per local tile' : `${tiles} expected`;
      lines.push(`  tile.${name} ${selector}: ${found} found, ${expected}`);
    }
    const missing = window.pekoPlayer
      ? Object.entries(window.pekoPlayer.el)
          .filter(([, el]) => !el)
          .map(([id]) => id)
      : [];
    lines.push(`  player elements missing from the page: ${missing.length ? missing.join(', ') : 'none'}`);
    return lines.join('\n');
  }

  // ---------- element inspector ----------

  function walkRules(visit, rules, prefix = '') {
    const list = rules ?? [];
    if (!rules) {
      for (const sheet of document.styleSheets) {
        let sheetRules;
        try {
          sheetRules = sheet.cssRules;
        } catch {
          // A cross-origin style sheet cannot be read.
          continue;
        }
        walkRules(visit, sheetRules, (sheet.href || 'inline').split('/').pop());
      }
      return;
    }
    for (const rule of list) {
      if (rule.cssRules && !rule.selectorText)
        walkRules(visit, rule.cssRules, `${prefix} ${rule.conditionText ? `@media ${rule.conditionText}` : ''}`.trim());
      else visit(rule, prefix);
    }
  }

  const label = (el) =>
    `${el.localName}${el.id ? `#${el.id}` : ''}${[...el.classList]
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('')}`;
  const pathTo = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 6; node = node.parentElement)
      parts.unshift(label(node));
    return parts.join(' > ');
  };

  /** Where the visible background of an element really comes from: the nearest ancestor with a non-transparent colour. */
  function effectiveBackground(el) {
    for (let node = el; node; node = node.parentElement) {
      const colour = getComputedStyle(node).backgroundColor;
      if (!/^rgba?\(.*,\s*0\)$/.test(colour) && colour !== 'transparent') return `${colour} from ${label(node)}`;
    }
    return 'transparent all the way up';
  }

  function describeElement(el) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const pick = (names) => names.map((name) => `  ${name}: ${cs.getPropertyValue(name)}`);
    const lines = [
      `Element: ${pathTo(el)}`,
      `Box: ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)} (viewport ${innerWidth}x${innerHeight})`,
      `States: hover ${yes(el.matches(':hover'))}, focus ${yes(el.matches(':focus'))}, focus-visible ${yes(el.matches(':focus-visible'))}, fullscreen ${yes(el.matches(':fullscreen'))}`,
      '',
      'Computed',
      ...pick([
        'display',
        'position',
        'z-index',
        'opacity',
        'visibility',
        'pointer-events',
        'cursor',
        'overflow',
        'transform',
        'contain',
        'will-change',
      ]),
      ...pick([
        'color',
        'background-color',
        'border-top-color',
        'border-top-width',
        'border-top-style',
        'outline',
        'box-shadow',
        'font-size',
        'font-weight',
        'font-family',
      ]),
      `  effective background: ${effectiveBackground(el)}`,
      '',
      'Ancestors that create a stacking context or clip',
    ];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const creates =
        style.zIndex !== 'auto' && style.position !== 'static'
          ? 'z-index'
          : style.opacity !== '1'
            ? 'opacity'
            : style.transform !== 'none'
              ? 'transform'
              : /paint|layout|strict|content/.test(style.contain)
                ? 'contain'
                : style.isolation === 'isolate'
                  ? 'isolation'
                  : '';
      const clips = style.overflow !== 'visible' ? `overflow ${style.overflow}` : '';
      if (creates || clips)
        lines.push(
          `  ${label(node)}: ${[creates && `stacking context (${creates}, z-index ${style.zIndex})`, clips].filter(Boolean).join(', ')}`,
        );
    }
    lines.push('', 'Matching CSS rules (last wins when equally specific)');
    let count = 0;
    walkRules((rule, source) => {
      if (!rule.selectorText || count >= MAX_RULES) return;
      try {
        if (!el.matches(rule.selectorText)) return;
      } catch {
        // A selector this browser cannot parse cannot match.
        return;
      }
      count++;
      lines.push(`  [${source}] ${rule.selectorText} { ${rule.style.cssText.replace(/\s+/g, ' ').slice(0, 220)} }`);
    });
    if (count >= MAX_RULES) lines.push(`  (first ${MAX_RULES} rules shown)`);
    return lines.join('\n');
  }

  function stopPicking() {
    if (!picking) return;
    document.removeEventListener('mousemove', picking.move, true);
    document.removeEventListener('click', picking.click, true);
    document.removeEventListener('keydown', picking.key, true);
    picking.outline.remove();
    picking = null;
    setStatus('');
  }

  /** Highlights the element under the pointer, and copies a full description of the one that is clicked. */
  function startPicking() {
    stopPicking();
    const outline = document.createElement('div');
    outline.className = 'peko-debug-outline';
    document.body.appendChild(outline);
    const target = (e) => (e.target.closest?.('.peko-debug') ? null : e.target);
    picking = {
      outline,
      move: (e) => {
        const el = target(e);
        if (!el) return;
        const box = el.getBoundingClientRect();
        Object.assign(outline.style, {
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
        });
      },
      click: (e) => {
        const el = target(e);
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        stopPicking();
        copy(describeElement(el), 'Element description');
      },
      key: (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        stopPicking();
      },
    };
    document.addEventListener('mousemove', picking.move, true);
    document.addEventListener('click', picking.click, true);
    document.addEventListener('keydown', picking.key, true);
    setStatus('Click an element to copy its description. Esc cancels.');
  }

  // ---------- panel ----------

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${what} copied (${(text.length / 1024).toFixed(1)} KB).`);
    } catch {
      // The clipboard is blocked: fall back to selecting the text in a temporary field.
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      setStatus(ok ? `${what} copied.` : 'Could not copy to the clipboard.');
    }
  }

  function build() {
    panel = document.createElement('section');
    panel.className = 'peko-debug';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Debug tools');
    panel.hidden = true;
    panel.innerHTML = `
      <header><strong>Debug tools</strong><button type="button" data-action="close" aria-label="Close debug tools">×</button></header>
      <div class="peko-debug-actions">
        <button type="button" data-action="diagnostics">Copy diagnostics</button>
        <button type="button" data-action="tokens">Copy theme tokens</button>
        <button type="button" data-action="selectors">Copy selector check</button>
        <button type="button" data-action="inspect">Inspect an element</button>
      </div>
      <p class="peko-debug-status" role="status"></p>
      <p class="peko-debug-note">Each button copies text to the clipboard. Nothing is sent anywhere. Press Ctrl+Shift+D to close.</p>`;
    status = panel.querySelector('.peko-debug-status');
    const actions = {
      close: () => toggle(false),
      diagnostics: () => copy(diagnostics(), 'Diagnostics'),
      tokens: () => copy(themeTokens(), 'Theme tokens'),
      selectors: () => copy(selectorCheck(), 'Selector check'),
      inspect: startPicking,
    };
    panel.addEventListener('click', (e) => actions[e.target.closest('button')?.dataset.action]?.());
    document.body.appendChild(panel);
  }

  function toggle(force) {
    if (!panel) build();
    panel.hidden = typeof force === 'boolean' ? !force : !panel.hidden;
    if (panel.hidden) stopPicking();
    else panel.querySelector('button[data-action="diagnostics"]').focus();
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    },
    true,
  );
})();
