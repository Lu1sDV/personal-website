const button = document.querySelector<HTMLButtonElement>('.theme-toggle');

if (button) {
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const updateButton = () => {
    const theme = root.dataset.theme ?? (system.matches ? 'dark' : 'light');
    const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
    button.dataset.currentTheme = theme;
    button.setAttribute('aria-label', label);
    button.title = label;
  };

  updateButton();
  button.hidden = false;
  button.addEventListener('click', () => {
    const current = root.dataset.theme ?? (system.matches ? 'dark' : 'light');
    const theme = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // The in-memory choice still works when storage is unavailable.
    }
    updateButton();
  });
  system.addEventListener('change', updateButton);
}
