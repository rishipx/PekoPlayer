// Player: Formatting helpers
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      formatTime(s) {
        return PekoUtils.formatTime(s);
      },

      formatDurationLong(s) {
        if (!s || !isFinite(s)) return '0m';
        const h = Math.floor(s / 3600),
          m = Math.floor((s % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${Math.floor(s)}s`;
      },

      formatBytes(b) {
        if (!b) return '';
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0,
          n = b;
        while (n >= 1024 && i < u.length - 1) {
          n /= 1024;
          i++;
        }
        const f = new Intl.NumberFormat(undefined, { maximumFractionDigits: n >= 10 || i === 0 ? 0 : 1 });
        return `${f.format(n)} ${u[i]}`;
      },

      truncate(s, n) {
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
      },

      escapeHtml(s) {
        return PekoUtils.escapeHtml(s);
      },
    };
  })(),
);
