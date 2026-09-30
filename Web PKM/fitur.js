(() => {
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const closeMenu = () => mobileNav && mobileNav.classList.remove('show');

  if (hamburger && mobileNav) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', e => {
      e.stopPropagation();
      const open = !mobileNav.classList.contains('show');
      mobileNav.classList.toggle('show', open);
      hamburger.setAttribute('aria-expanded', String(open));
    });
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    document.addEventListener('click', e => { if (!mobileNav.contains(e.target) && !hamburger.contains(e.target)) closeMenu(); });
  }

  document.querySelectorAll('.tool-card[data-page]').forEach(card => {
    card.setAttribute('tabindex', '0');
    const open = async () => {
      const page = card.dataset.page;
      if (!page) return;
      try {
        await window.KasirAuth?.ready;
        if (!window.KasirAuth?.current()) {
          sessionStorage.setItem('kasirTokoAfterLogin', page);
          window.location.href = 'login.html';
          return;
        }
        window.location.href = page;
      } catch (error) {
        console.error('Auth:', error);
        window.location.href = 'login.html';
      }
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });

  window.openTool = function(tool) {
    const pages = {
      barcode: 'produk.html',
      kasir: 'kasir.html',
      dashboard: 'dashboard.html',
      storage: 'storage.html',
      'buku-kas': 'buku-kas.html',
      keuntungan: 'dashboard.html',
      ingredients: 'scan-ingredient.html'
    };
    if (pages[tool]) {
      (async () => {
        await window.KasirAuth?.ready;
        if (!window.KasirAuth?.current()) {
          sessionStorage.setItem('kasirTokoAfterLogin', pages[tool]);
          window.location.href = 'login.html';
          return;
        }
        window.location.href = pages[tool];
      })();
    }
  };
})();
