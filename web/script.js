// Smooth nav highlight on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  sections.forEach(section => {
    const top = section.offsetTop - 80;
    const bottom = top + section.offsetHeight;
    const id = section.getAttribute('id');
    navLinks.forEach(link => {
      if (link.getAttribute('href') === `#${id}`) {
        link.style.color = scrollY >= top && scrollY < bottom
          ? 'var(--text1)'
          : '';
      }
    });
  });
});

// FAQ smooth open/close animation
document.querySelectorAll('.faq').forEach(faq => {
  faq.addEventListener('toggle', () => {
    if (faq.open) {
      faq.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
});

// Animate hero stats on load
const statVals = document.querySelectorAll('.stat-val');
statVals.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(10px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
});
window.addEventListener('load', () => {
  setTimeout(() => {
    statVals.forEach((el, i) => {
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * 150);
    });
  }, 300);
});
