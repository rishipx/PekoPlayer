// Multi-view: Layout modes, grid rendering and active tile
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      setLayoutMode(mode) {
        this._splitSig = null;
        this.layoutMode = mode;
        this.el.mvView
          .querySelectorAll('.mv-seg')
          .forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-layout') === mode)));
        this.renderLayout();
        this.updateSegDividerVisibility();
        this.saveMvSettings();
      },

      setCols(n) {
        if (window.innerWidth <= 760) return;
        this.cols = Math.max(1, Math.min(4, n));
        this.el.mvColsValue.textContent = String(this.cols);
        this.renderLayout();
        this.saveMvSettings();
      },

      /** Applies the current layout mode (free canvas, smart grid or split) to the wall. */
      renderLayout() {
        const { mvCanvas, mvColsStepper } = this.el;
        const has = this.tiles.length > 0;
        const isNarrow = window.innerWidth < 760;
        const effectiveCols = isNarrow ? 1 : this.cols;
        const segDivider = document.getElementById('mvSegDivider');
        mvCanvas.style.setProperty('--mv-gap', `${PekoLayout.GAP}px`);
        if (this.layoutMode === 'canvas') {
          mvCanvas.className = `mv-canvas mv-mode-canvas${has ? ' has-tiles' : ''}`;
          mvCanvas.style.gridTemplateColumns = '';
          mvCanvas.style.gridTemplateRows = '';
          this.tiles.forEach((t) => {
            t.wrapper.style.order = '';
            this.applyCanvasPosition(t);
          });
          if (mvColsStepper) mvColsStepper.style.display = 'none';
          if (segDivider) segDivider.style.display = 'none';
          this.renderGutters();
          return;
        }
        if (segDivider) segDivider.style.display = '';
        if (mvColsStepper) mvColsStepper.style.display = isNarrow ? 'none' : 'flex';
        if (this.layoutMode === 'grid') {
          this.renderSmartGrid(has, effectiveCols);
        } else {
          this.renderSplit(has, effectiveCols);
        }
        this.renderGutters();
      },

      /** Split: equal or user-sized columns and rows of a CSS grid, with tiles filling their cells. */
      renderSplit(has, effectiveCols) {
        const { mvCanvas } = this.el;
        this.tiles.forEach((t, i) => {
          t.wrapper.style.left =
            t.wrapper.style.top =
            t.wrapper.style.width =
            t.wrapper.style.height =
            t.wrapper.style.zIndex =
              '';
          t.wrapper.style.order = String(i);
        });
        const cols = Math.max(1, Math.min(this.tiles.length || effectiveCols, effectiveCols));
        const rows = Math.max(1, Math.ceil((this.tiles.length || 1) / cols));
        mvCanvas.className = `mv-canvas mv-mode-split${has ? ' has-tiles' : ''}`;
        if (this._splitSig !== `${this.tiles.length}:${cols}:${rows}`) {
          this._splitSig = `${this.tiles.length}:${cols}:${rows}`;
          if (this.colFr.length !== cols) this.colFr = PekoLayout.equalShares(cols);
          if (this.rowFr.length !== rows) this.rowFr = PekoLayout.equalShares(rows);
        }
        mvCanvas.style.gridTemplateColumns = this.colFr.map((f) => `${f}fr`).join(' ');
        mvCanvas.style.gridTemplateRows = this.rowFr.map((f) => `${f}fr`).join(' ');
      },

      /** Smart grid: rows of tiles that keep their aspect ratio, or the sizes the user chose by dragging a gutter. */
      renderSmartGrid(has, colsOverride) {
        const { mvCanvas } = this.el;
        mvCanvas.className = `mv-canvas mv-mode-grid${has ? ' has-tiles' : ''}`;
        mvCanvas.style.gridTemplateColumns = '';
        mvCanvas.style.gridTemplateRows = '';
        this.tiles.forEach((t) => {
          t.wrapper.style.zIndex = '';
          t.wrapper.style.order = '';
        });
        this._gridLayout = null;
        if (!has) return;
        const layout = this.computeGridLayout(colsOverride);
        if (!layout.rects.length) return;
        this._gridLayout = layout;
        layout.rects.forEach((rect, i) => {
          const wrapper = this.tiles[i].wrapper;
          wrapper.style.left = `${rect.x}px`;
          wrapper.style.top = `${rect.y}px`;
          wrapper.style.width = `${rect.w}px`;
          wrapper.style.height = `${rect.h}px`;
        });
      },

      /** The grid's rectangles: the saved manual sizes when they still fit the tiles, otherwise the automatic packing. */
      computeGridLayout(cols) {
        const { clientWidth, clientHeight } = this.el.mvCanvas;
        const count = this.tiles.length;
        const perRow = Math.max(1, Math.min(count, cols));
        const rowCount = Math.ceil(count / perRow);
        const sizes = this.gridSizes;
        if (
          sizes &&
          sizes.sig === `${count}:${perRow}` &&
          PekoLayout.isValidShares(sizes.rowFr, rowCount) &&
          PekoLayout.isValidShares(sizes.tileFr, count)
        ) {
          return PekoLayout.manualGrid(count, perRow, sizes.rowFr, sizes.tileFr, clientWidth, clientHeight);
        }
        this.gridSizes = null;
        return PekoLayout.autoGrid(
          this.tiles.map((t) => t.aspect || 16 / 9),
          perRow,
          clientWidth,
          clientHeight,
        );
      },

      applyCanvasPosition(tile) {
        tile.wrapper.style.left = `${tile.x}%`;
        tile.wrapper.style.top = `${tile.y}%`;
        tile.wrapper.style.width = `${tile.w}%`;
        tile.wrapper.style.height = `${tile.h}%`;
        tile.wrapper.style.zIndex = String(tile.z);
      },

      bringToFront(tile) {
        tile.z = ++this.zCounter;
        if (this.layoutMode === 'canvas') tile.wrapper.style.zIndex = String(tile.z);
        this.persistTileField(tile.id, { z: tile.z });
        this.setActiveTile(tile);
      },

      setActiveTile(tile) {
        if (this.activeTileId === tile.id) return;
        this.activeTileId = tile.id;
        this.tiles.forEach((t) => t.wrapper.classList.toggle('mv-tile-active', t.id === tile.id));
      },

      getActiveTile() {
        if (!this.tiles.length) return null;
        return this.tiles.find((t) => t.id === this.activeTileId) || this.tiles[this.tiles.length - 1];
      },
    };
  })(),
);
