(function () {
  const THEME_STORAGE_KEY = 'snortle-theme';

  function applyTheme(theme) {
    const allowedThemes = ['dark', 'light', 'green'];
    const nextTheme = allowedThemes.includes(theme) ? theme : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    return nextTheme;
  }

  function bindThemeSelector(selector) {
    if (!selector) return;
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    selector.value = applyTheme(savedTheme);
    selector.addEventListener('change', () => applyTheme(selector.value));
  }

  applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');

  function openModal(overlay) {
    if (!overlay) return;
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeModal(overlay) {
    if (!overlay) return;
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function bindSettingsModal(options) {
    const overlay = typeof options.overlay === 'string'
      ? document.querySelector(options.overlay)
      : options.overlay;
    const trigger = typeof options.trigger === 'string'
      ? document.querySelector(options.trigger)
      : options.trigger;
    const closeButtons = (options.closeButtons || []).map((button) => typeof button === 'string'
      ? document.querySelector(button)
      : button).filter(Boolean);

    if (!overlay) return { open: () => {}, close: () => {} };

    const open = async () => {
      if (typeof options.onOpen === 'function') {
        try {
          await options.onOpen();
        } catch (error) {
          console.error('Settings modal open hook failed:', error);
        }
      }
      openModal(overlay);
    };

    const close = () => closeModal(overlay);

    if (trigger) {
      trigger.addEventListener('click', open);
    }

    closeButtons.forEach((button) => {
      button.addEventListener('click', close);
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    return { open, close };
  }

  window.SnortleSettings = {
    bindSettingsModal,
    bindThemeSelector,
    open: openModal,
    close: closeModal
  };
})();
