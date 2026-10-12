// Layout math for the multi-view wall. Pure functions with no DOM access, so they can be unit tested; the build adds this
// file to the multi-view bundle.

const PekoLayout = Object.freeze({
  /** Space between tiles and around the wall, in pixels. The stylesheet receives it as --mv-gap. */
  GAP: 4,

  /** Smallest size a pane can be resized to, in pixels. */
  MIN_PANE: 120,

  /**
   * Packs tiles into rows of `cols`, keeping every tile at its video's aspect ratio. Each row fills the width; when the rows
   * are too tall they shrink together and stay centred. Returns one rectangle per tile plus the rows they sit in.
   */
  autoGrid(aspects, cols, width, height, gap = PekoLayout.GAP) {
    const cw = width - gap * 2;
    const ch = height - gap * 2;
    if (!aspects.length || cw <= 0 || ch <= 0) return { rects: [], rows: [] };
    const perRow = Math.max(1, Math.min(aspects.length, cols));
    const groups = [];
    for (let i = 0; i < aspects.length; i += perRow) groups.push(aspects.slice(i, i + perRow));
    const naturalHeights = groups.map((group) => {
      const sum = group.reduce((a, b) => a + b, 0);
      return sum > 0 ? (cw - gap * (group.length - 1)) / sum : 0;
    });
    const totalHeight = naturalHeights.reduce((s, h) => s + h, 0) + gap * (groups.length - 1);
    const scale = totalHeight > 0 ? Math.min(1, ch / totalHeight) : 1;
    const heights = naturalHeights.map((h) => h * scale);
    let y = Math.max(0, (ch - (heights.reduce((s, h) => s + h, 0) + gap * (groups.length - 1))) / 2);
    const rects = [];
    const rows = [];
    groups.forEach((group, r) => {
      const rowHeight = heights[r];
      const widths = group.map((a) => rowHeight * a);
      const rowWidth = widths.reduce((s, w) => s + w, 0) + gap * (widths.length - 1);
      let x = Math.max(0, (cw - rowWidth) / 2);
      rows.push({ start: rects.length, count: group.length, y: y + gap, h: rowHeight });
      widths.forEach((w) => {
        rects.push({ x: x + gap, y: y + gap, w, h: rowHeight });
        x += w + gap;
      });
      y += rowHeight + gap;
    });
    return { rects, rows };
  },

  /**
   * Like autoGrid, but with sizes chosen by the user: `rowFr` is the height share of each row and `tileFr` the width share
   * of each tile within its row. The rows and tiles always fill the whole wall, so nothing is cropped or overlapped.
   */
  manualGrid(count, cols, rowFr, tileFr, width, height, gap = PekoLayout.GAP) {
    const cw = width - gap * 2;
    const ch = height - gap * 2;
    if (!count || cw <= 0 || ch <= 0) return { rects: [], rows: [] };
    const perRow = Math.max(1, Math.min(count, cols));
    const rowCount = Math.ceil(count / perRow);
    const availableHeight = ch - gap * (rowCount - 1);
    const rowFrSum = rowFr.slice(0, rowCount).reduce((s, f) => s + f, 0);
    const rects = [];
    const rows = [];
    let y = 0;
    for (let r = 0; r < rowCount; r++) {
      const start = r * perRow;
      const n = Math.min(perRow, count - start);
      const rowHeight = (availableHeight * rowFr[r]) / rowFrSum;
      const fr = tileFr.slice(start, start + n);
      const frSum = fr.reduce((s, f) => s + f, 0);
      const availableWidth = cw - gap * (n - 1);
      rows.push({ start, count: n, y: y + gap, h: rowHeight });
      let x = 0;
      fr.forEach((f) => {
        const w = (availableWidth * f) / frSum;
        rects.push({ x: x + gap, y: y + gap, w, h: rowHeight });
        x += w + gap;
      });
      y += rowHeight + gap;
    }
    return { rects, rows };
  },

  /** Handles for resizing a grid: one between neighbouring tiles of a row, and one between neighbouring rows. */
  gridGutters(layout, gap = PekoLayout.GAP) {
    const gutters = [];
    layout.rows.forEach((row, r) => {
      for (let j = 0; j < row.count - 1; j++) {
        const left = layout.rects[row.start + j];
        gutters.push({ axis: 'v', row: r, index: j, x: left.x + left.w + gap / 2, y: row.y, length: row.h });
      }
      if (r < layout.rows.length - 1) {
        const first = layout.rects[row.start];
        const last = layout.rects[row.start + row.count - 1];
        const next = layout.rows[r + 1];
        const x = Math.min(first.x, layout.rects[next.start].x);
        const right = Math.max(
          last.x + last.w,
          layout.rects[next.start + next.count - 1].x + layout.rects[next.start + next.count - 1].w,
        );
        gutters.push({ axis: 'h', row: r, index: r, x, y: row.y + row.h + gap / 2, length: right - x });
      }
    });
    return gutters;
  },

  /** Pixel size of each track of a grid whose tracks are `fr` shares of `total`, with `gap` between them. */
  trackSizes(fr, total, gap = PekoLayout.GAP) {
    const available = total - gap * (fr.length - 1);
    const sum = fr.reduce((s, f) => s + f, 0);
    return fr.map((f) => (available * f) / sum);
  },

  /**
   * Moves the edge between track `index` and the next one by `delta` pixels. Only those two tracks change, their combined
   * size stays the same, and neither goes below `min`, so the other tracks are never touched. `available` is the pixel size
   * of all tracks together. Returns a new array of shares with the same total as before.
   */
  resizeTracks(fr, index, delta, available, min = PekoLayout.MIN_PANE) {
    if (index < 0 || index >= fr.length - 1) return fr.slice();
    const sum = fr.reduce((s, f) => s + f, 0);
    const sizeA = (available * fr[index]) / sum;
    const sizeB = (available * fr[index + 1]) / sum;
    const pair = sizeA + sizeB;
    const floor = Math.min(min, pair / 2);
    const newA = Math.max(floor, Math.min(pair - floor, sizeA + delta));
    const next = fr.slice();
    next[index] = (newA / available) * sum;
    next[index + 1] = ((pair - newA) / available) * sum;
    return next;
  },

  /** `count` equal shares. */
  equalShares(count) {
    return new Array(Math.max(0, count)).fill(1);
  },

  /** A copy of `list` with the item at `from` moved to position `to`. */
  moveItem(list, from, to) {
    const next = list.slice();
    if (from < 0 || from >= next.length) return next;
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
    return next;
  },

  /**
   * The slot a dragged tile should take: the rectangle, other than `skip`, whose central area contains the pointer. Using
   * only the central part (`inset` of each side is ignored) stops a tile from flipping back and forth on the border.
   */
  slotAt(rects, x, y, skip = -1, inset = 0.2) {
    for (let i = 0; i < rects.length; i++) {
      if (i === skip) continue;
      const r = rects[i];
      const left = r.x + r.w * inset;
      const right = r.x + r.w * (1 - inset);
      const top = r.y + r.h * inset;
      const bottom = r.y + r.h * (1 - inset);
      if (x >= left && x <= right && y >= top && y <= bottom) return i;
    }
    return -1;
  },

  /** True when `fr` is a usable list of `length` positive, finite shares. */
  isValidShares(fr, length) {
    return Array.isArray(fr) && fr.length === length && fr.every((f) => Number.isFinite(f) && f > 0);
  },
});
