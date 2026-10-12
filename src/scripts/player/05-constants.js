// Player presets, icons and input-method tracking

const EFFECTS_PRESETS = {
  none: {
    enabled: false,
    preset: 'none',
    exposure: 0,
    contrast: 1,
    saturation: 1,
    temperature: 0,
    tint: 0,
    sharpen: 0,
    vignette: 0,
  },
  vivid: {
    enabled: false,
    preset: 'vivid',
    exposure: 0,
    contrast: 1.15,
    saturation: 1.35,
    temperature: 0,
    tint: 0,
    sharpen: 0.2,
    vignette: 0,
  },
  cinematic: {
    enabled: false,
    preset: 'cinematic',
    exposure: 0.05,
    contrast: 1.1,
    saturation: 1.05,
    temperature: -0.25,
    tint: 0.05,
    sharpen: 0.15,
    vignette: 0.35,
  },
  warm: {
    enabled: false,
    preset: 'warm',
    exposure: 0,
    contrast: 1,
    saturation: 1.05,
    temperature: 0.5,
    tint: 0,
    sharpen: 0,
    vignette: 0,
  },
  cool: {
    enabled: false,
    preset: 'cool',
    exposure: 0,
    contrast: 1,
    saturation: 1.05,
    temperature: -0.5,
    tint: 0,
    sharpen: 0,
    vignette: 0,
  },
  film: {
    enabled: false,
    preset: 'film',
    exposure: -0.05,
    contrast: 1.1,
    saturation: 0.85,
    temperature: 0.1,
    tint: -0.05,
    sharpen: 0.1,
    vignette: 0.25,
  },
  mono: {
    enabled: false,
    preset: 'mono',
    exposure: 0,
    contrast: 1.1,
    saturation: 0,
    temperature: 0,
    tint: 0,
    sharpen: 0.1,
    vignette: 0.15,
  },
  sharp: {
    enabled: false,
    preset: 'sharp',
    exposure: 0,
    contrast: 1.05,
    saturation: 1.05,
    temperature: 0,
    tint: 0,
    sharpen: 0.7,
    vignette: 0,
  },
};

const EFFECTS_CYCLE_ORDER = ['none', 'vivid', 'cinematic', 'warm', 'cool', 'film', 'mono', 'sharp'];

const EFFECTS_FRIENDLY_NAMES = {
  none: 'Off',
  vivid: 'Vivid',
  cinematic: 'Cinematic',
  warm: 'Warm',
  cool: 'Cool',
  film: 'Film',
  mono: 'Mono',
  sharp: 'Sharp',
  custom: 'Custom',
};

const CAPTION_FONTS = {
  inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Lora', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  rounded: "'Nunito', 'SF Pro Rounded', 'Varela Round', sans-serif",
};

const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const ICON_FS_ENTER =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';

const ICON_FS_EXIT =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

const BADGE_ICON_EFFECTS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

const BADGE_ICON_LOOP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';

const BADGE_ICON_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';

(function trackInputMethod() {
  const setKb = () => {
    document.body.classList.add('input-keyboard');
    document.body.classList.remove('input-mouse');
  };
  const setMouse = () => {
    document.body.classList.add('input-mouse');
    document.body.classList.remove('input-keyboard');
  };
  document.addEventListener('mousedown', setMouse, true);
  document.addEventListener('pointerdown', setMouse, true);
  document.addEventListener('touchstart', setMouse, { capture: true, passive: true });
  document.addEventListener(
    'keydown',
    (e) => {
      if (
        e.key === 'Tab' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      )
        setKb();
    },
    true,
  );
})();
