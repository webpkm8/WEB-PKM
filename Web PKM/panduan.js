(() => {
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const readButton = document.getElementById('readButton');

  if (hamburger && mobileNav) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', e => {
      e.stopPropagation();
      const open = !mobileNav.classList.contains('show');
      mobileNav.classList.toggle('show', open);
      hamburger.setAttribute('aria-expanded', String(open));
    });
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('show')));
    document.addEventListener('click', e => { if (!mobileNav.contains(e.target) && !hamburger.contains(e.target)) mobileNav.classList.remove('show'); });
  }

  if (readButton) {
    readButton.addEventListener('click', () => {
      const target = document.querySelector('#panduan-detail, .guide-section');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      else window.location.href = 'panduan.html';
    });
  }
})();
