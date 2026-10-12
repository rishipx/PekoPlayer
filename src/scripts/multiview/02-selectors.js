// Multi-view: the parts of a tile, named once. The tile template in 15-tile-creation.js and the stylesheet use the same
// class names, so a change to the markup is made here and in the template, and nowhere else.

const PekoSelectors = Object.freeze({
  /** Selectors for the parts inside a tile wrapper. */
  tile: Object.freeze({
    header: '.mv-tile-header',
    actions: '.mv-tile-actions',
    body: '.mv-tile-body',
    ytHolder: '.mv-tile-yt-holder',
    loop: '.mv-tile-loop',
    fullscreen: '.mv-tile-fullscreen',
    remove: '.mv-tile-remove',
    rewind: '.mv-tile-rewind',
    play: '.mv-tile-play',
    forward: '.mv-tile-forward',
    scrub: '.mv-tile-scrub',
    scrubFill: '.mv-tile-scrub-fill',
    scrubHandle: '.mv-tile-scrub-handle',
    time: '.mv-tile-time',
    mute: '.mv-tile-mute',
    volslider: '.mv-tile-volslider',
    speed: '.mv-tile-speed',
    abloop: '.mv-tile-abloop',
    pip: '.mv-tile-pip',
  }),
});
