(async function () {
  'use strict';

  const enabled = document.getElementById('enabled');
  const status = document.getElementById('status');
  const themeSelect = document.getElementById('theme');
  const preview = document.getElementById('preview');

  const settings = await SRSettings.load();
  enabled.checked = !!settings.enabled;

  enabled.addEventListener('change', () => SRSettings.save({ enabled: enabled.checked }));

  for (const t of SRSettings.THEMES) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    themeSelect.appendChild(opt);
  }
  themeSelect.value = SRSettings.THEMES.some((t) => t.id === settings.theme)
    ? settings.theme
    : SRSettings.DEFAULTS.theme;

  function paintPreview() {
    preview.className = 'sr-badges ' + SRSettings.themeClass(themeSelect.value)
      + (settings.boldBadges ? ' sr-bold' : '');
    SRSettings.applyBadgeScale(preview, settings.badgeScale);
  }
  paintPreview();

  themeSelect.addEventListener('change', () => {
    paintPreview();
    SRSettings.save({ theme: themeSelect.value });
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab && tab.url ? new URL(tab.url).hostname : '';
  const supported = /^(scholar\.google\.|xueshu\.lanfanshu\.cn|scholar\.lanfanshu\.cn|sc\.panda985\.com)/.test(host);
  status.textContent = supported
    ? 'Scholar Rank is active on this page.'
    : 'Open a Google Scholar profile or search page to see rankings.';
})();
