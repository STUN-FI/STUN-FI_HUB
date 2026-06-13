document.addEventListener('DOMContentLoaded', () => {
  // header shrink already handled inline; add scroll-based reveal for sections
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.roles-section, .hero, .role-card, .stat, #logoQuote, #testimonials').forEach(el => {
    observer.observe(el);
  });

  // animated stats
  const stats = document.querySelectorAll('.stat');
  const statObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-target') || '0', 10);
        let start = 0;
        const dur = 1400;
        const step = Math.ceil(target / (dur / 20));
        const t = setInterval(() => {
          start += step;
          if (start >= target) {
            el.textContent = target.toLocaleString();
            clearInterval(t);
          } else {
            el.textContent = start.toLocaleString();
          }
        }, 20);
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  stats.forEach(s => statObserver.observe(s));

  // contact form — send via simple mailto fallback and show confirmation
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(contactForm);
      const name = fd.get('name');
      const email = fd.get('email');
      const message = fd.get('message');
      // Simple fallback: open mailto (cannot send server-side here)
      const mailto = `mailto:stunfihub@gmail.com?subject=${encodeURIComponent('Contact from '+name)}&body=${encodeURIComponent('From: '+name+' <'+email+'>\n\n'+message)}`;
      window.location.href = mailto;
    });
  }
});
