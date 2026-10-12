// Multi-view: Resize handles between the panes of the grid and split layouts
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';

    /** Thickness of a handle's hit area, in pixels. */
    const HIT = 12;
    /** How far an arrow key moves a handle; Shift multiplies it. */
    const KEY_STEP = 16;

    return {
      /** Creates, moves and removes the resize handles so that they match the current layout. */
      renderGutters() {
        let wanted = [];
        if (this.tiles.length && this.layoutMode === 'split') wanted = this.splitGutters();
        else if (this.tiles.length && this.layoutMode === 'grid')
          wanted = this._gridLayout ? PekoLayout.gridGutters(this._gridLayout) : [];
        const layer = this.ensureGutterLayer();
        const seen = new Set();
        for (const gutter of wanted) {
          const key = `${gutter.axis}:${gutter.row ?? 0}:${gutter.index}`;
          seen.add(key);
          let el = this._gutterEls.get(key);
          if (!el) {
            el = this.createGutter(gutter);
            layer.appendChild(el);
            this._gutterEls.set(key, el);
          }
          el._gutter = gutter;
          const vertical = gutter.axis === 'v';
          el.style.left = `${vertical ? gutter.x - HIT / 2 : gutter.x}px`;
          el.style.top = `${vertical ? gutter.y : gutter.y - HIT / 2}px`;
          el.style.width = `${vertical ? HIT : gutter.length}px`;
          el.style.height = `${vertical ? gutter.length : HIT}px`;
        }
        for (const [key, el] of this._gutterEls) {
          if (seen.has(key)) continue;
          el.remove();
          this._gutterEls.delete(key);
        }
      },

      ensureGutterLayer() {
        let layer = this.el.mvCanvas.querySelector(':scope > .mv-gutters');
        if (!layer) {
          layer = document.createElement('div');
          layer.className = 'mv-gutters';
          layer.setAttribute('role', 'presentation');
          this.el.mvCanvas.appendChild(layer);
        }
        return layer;
      },

      /** Handles on the column and row edges of the split layout. */
      splitGutters() {
        const { clientWidth: width, clientHeight: height } = this.el.mvCanvas;
        const gap = PekoLayout.GAP;
        const columns = PekoLayout.trackSizes(this.colFr, width - gap * 2, gap);
        const rows = PekoLayout.trackSizes(this.rowFr, height - gap * 2, gap);
        const gutters = [];
        let x = gap;
        for (let i = 0; i < columns.length - 1; i++) {
          x += columns[i];
          gutters.push({ axis: 'v', index: i, x: x + gap / 2, y: gap, length: height - gap * 2 });
          x += gap;
        }
        let y = gap;
        for (let i = 0; i < rows.length - 1; i++) {
          y += rows[i];
          gutters.push({ axis: 'h', index: i, x: gap, y: y + gap / 2, length: width - gap * 2 });
          y += gap;
        }
        return gutters;
      },

      createGutter(gutter) {
        const el = document.createElement('div');
        el.className = `mv-gutter mv-gutter-${gutter.axis}`;
        el.tabIndex = 0;
        el.setAttribute('role', 'separator');
        el.setAttribute('aria-orientation', gutter.axis === 'v' ? 'vertical' : 'horizontal');
        el.setAttribute('aria-label', gutter.axis === 'v' ? 'Resize panes side by side' : 'Resize rows');
        el.title = 'Drag to resize, double-click to reset';
        el.addEventListener('pointerdown', (e) => this.startGutterDrag(e, el));
        el.addEventListener('dblclick', () => this.resetPaneSizes());
        el.addEventListener('keydown', (e) => this.handleGutterKey(e, el));
        return el;
      },

      /**
       * Prepares to move one handle and returns a function that applies a pixel offset from where the handle started.
       * Only the two panes next to the handle change; every other pane keeps its size.
       */
      beginGutterResize(gutter) {
        const gap = PekoLayout.GAP;
        const { clientWidth: width, clientHeight: height } = this.el.mvCanvas;
        if (this.layoutMode === 'split') {
          const horizontal = gutter.axis === 'h';
          const start = (horizontal ? this.rowFr : this.colFr).slice();
          const available = (horizontal ? height : width) - gap * 2 - gap * (start.length - 1);
          return (delta) => {
            const next = PekoLayout.resizeTracks(start, gutter.index, delta, available);
            if (horizontal) this.rowFr = next;
            else this.colFr = next;
            this.renderLayout();
          };
        }
        // Grid: the first resize turns the automatic packing into sizes that can be changed.
        if (!this.gridSizes) this.gridSizes = this.gridSizesFromLayout();
        const sizes = this.gridSizes;
        if (gutter.axis === 'h') {
          const start = sizes.rowFr.slice();
          const available = height - gap * 2 - gap * (start.length - 1);
          return (delta) => {
            sizes.rowFr = PekoLayout.resizeTracks(start, gutter.index, delta, available);
            this.renderLayout();
          };
        }
        const row = this._gridLayout.rows[gutter.row];
        const start = sizes.tileFr.slice(row.start, row.start + row.count);
        const available = width - gap * 2 - gap * (row.count - 1);
        return (delta) => {
          sizes.tileFr.splice(row.start, row.count, ...PekoLayout.resizeTracks(start, gutter.index, delta, available));
          this.renderLayout();
        };
      },

      /** The grid's current rectangles, as sizes that can be edited. */
      gridSizesFromLayout() {
        const layout = this._gridLayout;
        return {
          sig: `${this.tiles.length}:${layout.rows[0].count}`,
          rowFr: layout.rows.map((row) => row.h),
          tileFr: layout.rects.map((rect) => rect.w),
        };
      },

      /**
       * Drags a handle. Where a vertical and a horizontal handle cross, both move together, so a corner can be dragged
       * in any direction.
       */
      startGutterDrag(e, el) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const grabbed = [...this._gutterEls.values()].filter((other) => {
          const box = other.getBoundingClientRect();
          return (
            other === el ||
            (e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom)
          );
        });
        const drags = grabbed.map((handle) => ({
          handle,
          horizontal: handle._gutter.axis === 'h',
          apply: this.beginGutterResize(handle._gutter),
        }));
        const start = { x: e.clientX, y: e.clientY };
        let last = { x: e.clientX, y: e.clientY };
        let frame = 0;
        const applyAll = () => {
          for (const { horizontal, apply } of drags) apply(horizontal ? last.y - start.y : last.x - start.x);
        };
        el.setPointerCapture(e.pointerId);
        grabbed.forEach((handle) => handle.classList.add('is-active'));
        this.el.mvCanvas.dataset.resizing = '1';
        const move = (ev) => {
          last = { x: ev.clientX, y: ev.clientY };
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            applyAll();
          });
        };
        const end = () => {
          cancelAnimationFrame(frame);
          applyAll();
          grabbed.forEach((handle) => handle.classList.remove('is-active'));
          delete this.el.mvCanvas.dataset.resizing;
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', end);
          el.removeEventListener('pointercancel', end);
          this.saveMvSettings();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
      },

      /** Arrow keys move the focused handle, and Home or Enter resets all pane sizes. */
      handleGutterKey(e, el) {
        const gutter = el._gutter;
        const steps = gutter.axis === 'h' ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 };
        if (e.key === 'Home' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          this.resetPaneSizes();
        } else if (e.key in steps) {
          e.preventDefault();
          e.stopPropagation();
          this.beginGutterResize(gutter)(steps[e.key] * KEY_STEP * (e.shiftKey ? 4 : 1));
          this.saveMvSettings();
        }
      },

      /** Goes back to equal columns and rows in split, and to the automatic packing in grid. */
      resetPaneSizes() {
        this.colFr = [];
        this.rowFr = [];
        this._splitSig = null;
        this.gridSizes = null;
        this.renderLayout();
        this.saveMvSettings();
        window.pekoPlayer?.announce('Pane sizes reset');
      },
    };
  })(),
);
