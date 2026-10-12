// Multi-view: Drag tiles to reorder them in the grid and split layouts
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';

    /** How far the pointer must move before a press on a tile header turns into a drag. */
    const START_DISTANCE = 6;
    const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    return {
      /**
       * Lets the user drag a tile by its header. The tile follows the pointer while the other tiles move aside, and takes the
       * slot it is dropped on. Escape puts everything back.
       */
      startTileReorder(e, tile) {
        if (e.target.closest(PekoSelectors.tile.actions)) return;
        if (e.type === 'mousedown' && e.button !== 0) return;
        const pointOf = (ev) => ('touches' in ev && ev.touches.length ? ev.touches[0] : ev);
        const canvas = this.el.mvCanvas;
        const startOrder = this.tiles.slice();
        const first = pointOf(e);
        let x = first.clientX;
        let y = first.clientY;
        let dragging = false;
        let frame = 0;
        let ghost = null;
        let grab = { x: 0, y: 0 };

        /** The rectangle of every slot, in canvas coordinates and in tile order. */
        const slotRects = () =>
          this.layoutMode === 'grid' && this._gridLayout
            ? this._gridLayout.rects
            : this.tiles.map((t) => ({
                x: t.wrapper.offsetLeft,
                y: t.wrapper.offsetTop,
                w: t.wrapper.offsetWidth,
                h: t.wrapper.offsetHeight,
              }));

        const place = () => {
          frame = 0;
          const box = canvas.getBoundingClientRect();
          const px = x - box.left + canvas.scrollLeft;
          const py = y - box.top + canvas.scrollTop;
          let rects = slotRects();
          const target = PekoLayout.slotAt(rects, px, py, this.tiles.indexOf(tile));
          if (target !== -1) {
            this.reorderTiles(this.tiles.indexOf(tile), target);
            rects = slotRects();
          }
          const slot = rects[this.tiles.indexOf(tile)];
          if (!slot) return;
          tile.wrapper.style.transform = `translate(${px - grab.x - slot.x}px, ${py - grab.y - slot.y}px)`;
          Object.assign(ghost.style, {
            left: `${slot.x}px`,
            top: `${slot.y}px`,
            width: `${slot.w}px`,
            height: `${slot.h}px`,
          });
        };

        const begin = () => {
          dragging = true;
          const rect = tile.wrapper.getBoundingClientRect();
          grab = { x: x - rect.left, y: y - rect.top };
          ghost = document.createElement('div');
          ghost.className = 'mv-slot-ghost';
          canvas.appendChild(ghost);
          tile.wrapper.classList.add('mv-reordering');
          canvas.dataset.reordering = '1';
          this.setActiveTile(tile);
        };

        const move = (ev) => {
          const p = pointOf(ev);
          x = p.clientX;
          y = p.clientY;
          if (!dragging) {
            if (Math.hypot(x - first.clientX, y - first.clientY) < START_DISTANCE) return;
            begin();
          }
          if (ev.cancelable) ev.preventDefault();
          if (!frame) frame = requestAnimationFrame(place);
        };

        const finish = (commit) => {
          cancelAnimationFrame(frame);
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', move);
          document.removeEventListener('touchend', up);
          document.removeEventListener('touchcancel', cancel);
          document.removeEventListener('keydown', onKey, true);
          if (!dragging) return;
          const released = tile.wrapper.style.transform;
          tile.wrapper.classList.remove('mv-reordering');
          tile.wrapper.style.transform = '';
          delete canvas.dataset.reordering;
          ghost.remove();
          if (released && !prefersReducedMotion()) {
            tile.wrapper.animate([{ transform: released }, { transform: 'none' }], {
              duration: 160,
              easing: 'ease-out',
            });
          }
          if (!commit) {
            this.tiles = startOrder;
            this.renderLayout();
          } else if (this.tiles.some((t, i) => t !== startOrder[i])) {
            this.persistOrder();
            window.pekoPlayer?.announce(
              `${tile.name} moved to position ${this.tiles.indexOf(tile) + 1} of ${this.tiles.length}`,
            );
          }
        };
        const up = () => finish(true);
        const cancel = () => finish(false);
        const onKey = (ev) => {
          if (ev.key !== 'Escape') return;
          ev.preventDefault();
          ev.stopPropagation();
          finish(false);
        };

        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', up);
        document.addEventListener('touchcancel', cancel);
        document.addEventListener('keydown', onKey, true);
      },

      /** Moves the tile at `from` to position `to` and lays the wall out again. Tiles that change place glide there. */
      reorderTiles(from, to) {
        if (from === to) return;
        // Grid tiles animate through CSS transitions; split tiles are moved by the browser's grid, so they are animated here.
        const before =
          this.layoutMode === 'split' && !prefersReducedMotion()
            ? new Map(this.tiles.map((t) => [t, t.wrapper.getBoundingClientRect()]))
            : null;
        this.tiles = PekoLayout.moveItem(this.tiles, from, to);
        this.renderLayout();
        if (!before) return;
        for (const t of this.tiles) {
          if (t.wrapper.classList.contains('mv-reordering')) continue;
          const old = before.get(t);
          const now = t.wrapper.getBoundingClientRect();
          const dx = old.left - now.left;
          const dy = old.top - now.top;
          if (dx || dy)
            t.wrapper.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
              duration: 180,
              easing: 'ease-out',
            });
        }
      },

      /** Keyboard alternative to dragging: moves a tile one place earlier (-1) or later (1). */
      moveTileBy(tile, delta) {
        if (this.layoutMode === 'canvas') return;
        const from = this.tiles.indexOf(tile);
        const to = from + delta;
        if (from === -1 || to < 0 || to >= this.tiles.length) return;
        this.reorderTiles(from, to);
        this.persistOrder();
        window.pekoPlayer?.announce(`${tile.name} moved to position ${to + 1} of ${this.tiles.length}`);
      },
    };
  })(),
);
