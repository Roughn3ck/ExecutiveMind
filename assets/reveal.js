// Scroll-reveal: content boxes fade/rise in as you scroll, images "appear", text rises.
// Mirrors the dynamic load feel of cub.club — lightweight, no dependencies.
// Spec: aria/ACTIVE-CONTENT.md
(function () {
  if (!("IntersectionObserver" in window)) {
    // Fallback: show everything immediately.
    document.querySelectorAll(".reveal, .reveal-stagger").forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  document.querySelectorAll(".reveal, .reveal-stagger").forEach(function (el) {
    observer.observe(el);
  });
})();
