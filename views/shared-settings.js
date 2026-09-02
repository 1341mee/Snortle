(function () {
  function applyTheme(theme) {
    const allowedThemes = ['dark', 'light', 'green'];
    const nextTheme = allowedThemes.includes(theme) ? theme : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    return nextTheme;
  }

  async function bindThemeSelector(selector) {
    if (!selector) return;
    try {
      const response = await fetch('/api/session-status');
      const session = await response.json();
      selector.value = applyTheme(session.theme || 'dark');
    } catch (error) {
      selector.value = applyTheme('dark');
      console.error('Could not load saved theme:', error);
    }
    selector.addEventListener('change', async () => {
      const theme = applyTheme(selector.value);
      try {
        const response = await fetch('/api/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme })
        });
        if (!response.ok) throw new Error('Theme could not be saved.');
      } catch (error) {
        console.error('Could not save theme:', error);
      }
    });
  }

  applyTheme('dark');

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
