// Multi-view: Tile drag and resize, clamp and escaping helpers
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      /** Starts moving a tile: free movement in canvas mode, reordering in the grid and split layouts. */
      startTileDrag(e, tile) {
        if (this.layoutMode !== 'canvas') {
          this.startTileReorder(e, tile);
          return;
        }
        if (e.target.closest(PekoSelectors.tile.actions)) return;
        e.preventDefault();
        this.bringToFront(tile);
        tile.wrapper.classList.add('dragging');
        tile.wrapper.style.willChange = 'left, top';
        tile._dragging = true;
        const r = this.el.mvCanvas.getBoundingClientRect();
        const sx = 'touches' in e && e.touches.length ? e.touches[0].clientX : e.clientX;
        const sy = 'touches' in e && e.touches.length ? e.touches[0].clientY : e.clientY;
        const px = tile.x,
          py = tile.y;
        let lastX = sx,
          lastY = sy;
        const mv = (ev) => {
          lastX = 'touches' in ev && ev.touches.length ? ev.touches[0].clientX : ev.clientX;
          lastY = 'touches' in ev && ev.touches.length ? ev.touches[0].clientY : ev.clientY;
          if (tile._dragRAF) return;
          tile._dragRAF = requestAnimationFrame(() => {
            tile._dragRAF = null;
            tile.x = this.clamp(px + ((lastX - sx) / r.width) * 100, 0, 100 - tile.w);
            tile.y = this.clamp(py + ((lastY - sy) / r.height) * 100, 0, 100 - tile.h);
            this.applyCanvasPosition(tile);
          });
        };
        const up = () => {
          if (tile._dragRAF) {
            cancelAnimationFrame(tile._dragRAF);
            tile._dragRAF = null;
          }
          tile.x = this.clamp(px + ((lastX - sx) / r.width) * 100, 0, 100 - tile.w);
          tile.y = this.clamp(py + ((lastY - sy) / r.height) * 100, 0, 100 - tile.h);
          this.applyCanvasPosition(tile);
          tile.wrapper.classList.remove('dragging');
          tile.wrapper.style.willChange = '';
          tile._dragging = false;
          this.persistTileField(tile.id, { x: tile.x, y: tile.y });
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', mv);
          document.removeEventListener('touchend', up);
        };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv, { passive: false });
        document.addEventListener('touchend', up);
      },

      /** Starts resizing a tile from one of its edge or corner handles in canvas mode. */
      startTileResize(e, tile, dir) {
        if (this.layoutMode !== 'canvas') return;
        e.preventDefault();
        e.stopPropagation();
        this.bringToFront(tile);
        tile.wrapper.classList.add('resizing');
        tile.wrapper.style.willChange = 'left, top, width, height';
        tile._resizing = true;
        const r = this.el.mvCanvas.getBoundingClientRect();
        const sx = 'touches' in e && e.touches.length ? e.touches[0].clientX : e.clientX;
        const sy = 'touches' in e && e.touches.length ? e.touches[0].clientY : e.clientY;
        const s = {
          x: tile.x,
          y: tile.y,
          w: tile.w,
          h: tile.h,
        };
        const MIN = 15;
        let lastX = sx,
          lastY = sy;
        const mv = (ev) => {
          lastX = 'touches' in ev && ev.touches.length ? ev.touches[0].clientX : ev.clientX;
          lastY = 'touches' in ev && ev.touches.length ? ev.touches[0].clientY : ev.clientY;
          if (tile._resizeRAF) return;
          tile._resizeRAF = requestAnimationFrame(() => {
            tile._resizeRAF = null;
            const dx = ((lastX - sx) / r.width) * 100;
            const dy = ((lastY - sy) / r.height) * 100;
            if (dir.includes('e')) tile.w = this.clamp(s.w + dx, MIN, 100 - s.x);
            if (dir.includes('w')) {
              const nx = this.clamp(s.x + dx, 0, s.x + s.w - MIN);
              tile.w = s.w + (s.x - nx);
              tile.x = nx;
            }
            if (dir.includes('s')) tile.h = this.clamp(s.h + dy, MIN, 100 - s.y);
            if (dir.includes('n')) {
              const ny = this.clamp(s.y + dy, 0, s.y + s.h - MIN);
              tile.h = s.h + (s.y - ny);
              tile.y = ny;
            }
            this.applyCanvasPosition(tile);
          });
        };
        const up = () => {
          if (tile._resizeRAF) {
            cancelAnimationFrame(tile._resizeRAF);
            tile._resizeRAF = null;
          }
          const dx = ((lastX - sx) / r.width) * 100;
          const dy = ((lastY - sy) / r.height) * 100;
          if (dir.includes('e')) tile.w = this.clamp(s.w + dx, MIN, 100 - s.x);
          if (dir.includes('w')) {
            const nx = this.clamp(s.x + dx, 0, s.x + s.w - MIN);
            tile.w = s.w + (s.x - nx);
            tile.x = nx;
          }
          if (dir.includes('s')) tile.h = this.clamp(s.h + dy, MIN, 100 - s.y);
          if (dir.includes('n')) {
            const ny = this.clamp(s.y + dy, 0, s.y + s.h - MIN);
            tile.h = s.h + (s.y - ny);
            tile.y = ny;
          }
          this.applyCanvasPosition(tile);
          tile.wrapper.classList.remove('resizing');
          tile.wrapper.style.willChange = '';
          tile._resizing = false;
          this.persistTileField(tile.id, {
            x: tile.x,
            y: tile.y,
            w: tile.w,
            h: tile.h,
          });
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', mv);
          document.removeEventListener('touchend', up);
        };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv, { passive: false });
        document.addEventListener('touchend', up);
      },

      clamp(v, min, max) {
        return PekoUtils.clamp(v, min, max);
      },

      escapeHtml(s) {
        return PekoUtils.escapeHtml(s);
      },
    };
  })(),
);
