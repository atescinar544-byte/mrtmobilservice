(() => {
  const PAGE_WIDTH = 793.7008;

  function fitPages() {
    const available = Math.max(280, document.documentElement.clientWidth - 24);
    const scale = Math.min(1, available / PAGE_WIDTH);
    document.documentElement.style.setProperty("--page-scale", scale.toFixed(6));
  }

  fitPages();
  window.addEventListener("resize", fitPages, { passive: true });
})();
