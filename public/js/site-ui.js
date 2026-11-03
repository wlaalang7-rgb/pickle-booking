const initializeScrollReveals = () => {
  if (!("IntersectionObserver" in window)) return;

  const revealSections = [
    ["#home", ".hero-copy, .hero-art-wrap, .hero-bottom-note"],
    ["#courts", ".section-heading, #public-court-list, .court-note"],
    ["#schedule", ".section-heading, .schedule-card, .schedule-guide"],
    ["#book", ".booking-copy, .booking-form"],
    ["#cancel-booking", "> *"],
    ["#experience", ".experience-heading, .experience-grid, .gallery-heading, .photo-gallery, .gallery-credit"],
    ["#events", ".events-header, .event-row, .sample-note"],
    [".membership-section", ".membership-inner, .membership-option"],
    ["#rules", ".rules-intro, .rules-list"],
    ["#visit", ".visit-copy, .visit-details"],
    [".site-footer", "> *"],
  ];
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      currentObserver.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });

  revealSections.forEach(([sectionSelector, targetSelector]) => {
    const section = document.querySelector(sectionSelector);
    if (!section) return;
    const targets = targetSelector === "> *" ? section.children : section.querySelectorAll(targetSelector);
    Array.from(targets).forEach((target, index) => {
      target.dataset.reveal = "";
      target.style.setProperty("--reveal-delay", `${Math.min(index, 4) * 100}ms`);
      observer.observe(target);
    });
  });

  document.documentElement.classList.add("has-scroll-reveal");
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest("[data-reveal]");
    if (target) target.classList.add("is-visible");
  });
};

initializeScrollReveals();

let logoClickCount = 0;
document.querySelectorAll(".brand").forEach((logo) => {
  logo.addEventListener("click", (event) => {
    event.preventDefault();
    logoClickCount += 1;
    if (logoClickCount >= 5) {
      window.location.href = "admin.html";
    }
  });
});

const updateBackToTop = () => {
  backToTop.disabled = window.scrollY === 0;
};

let lastScrollY = window.scrollY;
let scrollDirection = 0;
let scrollIntent = 0;
let scrollHeaderTimeout = null;
let scheduledHeaderHidden = null;
const cancelScheduledHeaderVisibility = () => {
  window.clearTimeout(scrollHeaderTimeout);
  scrollHeaderTimeout = null;
  scheduledHeaderHidden = null;
};
const scheduleHeaderVisibility = (hidden) => {
  if (siteHeader.classList.contains("is-hidden") === hidden || scheduledHeaderHidden === hidden) return;
  cancelScheduledHeaderVisibility();
  scheduledHeaderHidden = hidden;
  scrollHeaderTimeout = window.setTimeout(() => {
    siteHeader.classList.toggle("is-hidden", hidden);
    scrollHeaderTimeout = null;
    scheduledHeaderHidden = null;
  }, 140);
};
const updateScrollHeader = () => {
  const currentScrollY = Math.max(0, window.scrollY);
  const scrollDelta = currentScrollY - lastScrollY;
  const nextDirection = Math.sign(scrollDelta);

  if (currentScrollY <= 80 || menuToggle.getAttribute("aria-expanded") === "true") {
    cancelScheduledHeaderVisibility();
    siteHeader.classList.remove("is-hidden");
    scrollDirection = 0;
    scrollIntent = 0;
  } else if (nextDirection !== 0) {
    if (nextDirection !== scrollDirection) cancelScheduledHeaderVisibility();
    scrollIntent = nextDirection === scrollDirection ? scrollIntent + scrollDelta : scrollDelta;
    scrollDirection = nextDirection;
    if (scrollIntent >= 8) scheduleHeaderVisibility(true);
    if (scrollIntent <= -8) scheduleHeaderVisibility(false);
  }

  lastScrollY = currentScrollY;
  updateBackToTop();
};

window.addEventListener("scroll", updateScrollHeader, { passive: true });
updateScrollHeader();
siteHeader.addEventListener("focusin", () => {
  cancelScheduledHeaderVisibility();
  siteHeader.classList.remove("is-hidden");
});

backToTop.addEventListener("click", () => {
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  window.scrollTo({ top: 0, behavior });
});


menuToggle.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  cancelScheduledHeaderVisibility();
  if (!isOpen) siteHeader.classList.remove("is-hidden");
  primaryNav.classList.toggle("is-open", !isOpen);
});

primaryNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    primaryNav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
  });
});
