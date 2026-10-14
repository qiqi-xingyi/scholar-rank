/** Shared defaults, appearance styles and Chrome sync storage for the content script, settings page and popup. */
(function (root) {
  'use strict';

  const THEMES = [
    { id: 'soft', name: 'Clean', desc: 'A clear venue name with lightly separated metrics' },
    { id: 'outline', name: 'Outline', desc: 'Transparent background with a colored border' },
    { id: 'solid', name: 'Solid', desc: 'Bold color with white text' },
    { id: 'minimal', name: 'Minimal', desc: 'Colored text without a background' },
    { id: 'square', name: 'Square', desc: 'Square corners with a colored accent' },
    { id: 'mono', name: 'Grayscale', desc: 'Neutral gray with clear contrast' },
  ];

  const DEFAULTS = {
    enabled: true,

    showOnProfile: true,
    showOnSearch: true,
    showOnDetail: true,

    showPreprint: true,
    showJournalName: true,
    showConferenceName: true,
    showCcf: true,
    showCore: true,
    showTop: true,
    showCas: true,
    showJcr: true,
    showIf: true,

    theme: 'soft',
    badgeScale: 100,
    boldBadges: false,

    authorAliases: '',

    showUnmatched: false,
    resolveTruncated: true,
  };

  function themeClass(theme) {
    const id = THEMES.some((t) => t.id === theme) ? theme : DEFAULTS.theme;
    return 'sr-theme-' + id;
  }

  /** Apply the same size scaling to Scholar badges, settings previews and the popup. */
  function applyBadgeScale(container, scale) {
    const value = Number(scale);
    container.style.setProperty('--sr-badge-scale', String(Number.isFinite(value) && value > 0 ? value / 100 : 1));
  }

  async function load() {
    if (!root.chrome || !chrome.storage) return Object.assign({}, DEFAULTS);
    return await chrome.storage.sync.get(DEFAULTS);
  }

  async function save(patch) {
    await chrome.storage.sync.set(patch);
  }

  root.SRSettings = { DEFAULTS, THEMES, themeClass, applyBadgeScale, load, save };
})(typeof globalThis !== 'undefined' ? globalThis : this);
