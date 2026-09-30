(() => {
  const menuToggle = document.getElementById('menuToggle');
  const navMenu = document.getElementById('navMenu');

  const closeMenu = () => {
    if (!navMenu) return;
    navMenu.classList.remove('show', 'open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
  };

  if (menuToggle && navMenu) {
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = !navMenu.classList.contains('show');
      navMenu.classList.toggle('show', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    });

    navMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('click', (event) => {
      if (!navMenu.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
    });
  }

  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-menu a');
  const updateActive = () => {
    if (!sections.length) return;
    let current = '';
    sections.forEach(section => {
      if (window.scrollY >= section.offsetTop - 140) current = section.id;
    });
    navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${current}`));
  };
  window.addEventListener('scroll', updateActive, { passive: true });
  updateActive();

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', event => {
      const id = anchor.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        event.preventDefault();
        closeMenu();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 650) closeMenu();
  });
})();
