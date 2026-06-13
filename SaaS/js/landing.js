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

  // Load pricing plans from data/plans.json and populate pricing cards
  (async function loadPlans(){
    try {
      const res = await fetch('data/plans.json');
      if (!res.ok) throw new Error('Could not load plans');
      const json = await res.json();
      const plans = json.plans || {};
      document.querySelectorAll('[data-plan]').forEach(card => {
        const key = card.getAttribute('data-plan');
        const info = plans[key];
        if (!info) return;
        const priceEl = card.querySelector('.plan-price');
        const limitEl = card.querySelector('.plan-limit');
        const nameEl = card.querySelector('.plan-name');
        if (nameEl && info.name) nameEl.textContent = info.name;
        if (priceEl) {
          if (info.price == null) priceEl.textContent = info.price === null ? 'Contact us' : info.price;
          else {
            // format in naira with thousand separators
            const formatted = info.price.toLocaleString(undefined);
            priceEl.textContent = `₦${formatted}`;
          }
        }
        if (limitEl) {
          if (info.limit == null) limitEl.textContent = info.limit === null ? 'Unlimited' : info.limit;
          else limitEl.textContent = `${info.limit.toLocaleString()} Students`;
        }
      });
    } catch (err) {
      console.warn('Failed to load plans.json', err);
    }
  })();

  const testimonialTrack = document.querySelector('.testimonial-track');
  const testimonialCards = document.querySelectorAll('.testimonial-card');
  const prevTestimonial = document.getElementById('prevTestimonial');
  const nextTestimonial = document.getElementById('nextTestimonial');

  if (testimonialTrack && testimonialCards.length > 0 && prevTestimonial && nextTestimonial) {
    let currentTestimonial = 0;

    const updateTestimonial = () => {
      testimonialTrack.style.transform = `translateX(-${currentTestimonial * 100}%)`;
    };

    prevTestimonial.addEventListener('click', () => {
      currentTestimonial = (currentTestimonial - 1 + testimonialCards.length) % testimonialCards.length;
      updateTestimonial();
    });

    nextTestimonial.addEventListener('click', () => {
      currentTestimonial = (currentTestimonial + 1) % testimonialCards.length;
      updateTestimonial();
    });

    setInterval(() => {
      currentTestimonial = (currentTestimonial + 1) % testimonialCards.length;
      updateTestimonial();
    }, 6500);
  }
});
