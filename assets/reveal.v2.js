// Scroll-reveal: content boxes fade/rise in as you scroll, images "appear",
// text rises, whole sections settle into view. Mirrors the dynamic load
// feel of cub.club — lightweight, no dependencies.
// Spec: aria/ACTIVE-CONTENT.md
(function () {
  // Class sets we observe. Each gets its own observer tuned to its size:
  //   .reveal-stagger  — children of a grid/list (sequential cascade)
  //   .reveal-section  — whole <section> containers (softer, slower, triggers earlier)
  //   .reveal          — individual blocks (default timing)
  var SELECTORS = [".reveal-section", ".reveal-stagger", ".reveal"];

  if (!("IntersectionObserver" in window)) {
    // Fallback: show everything immediately. No-JS browsers see content.
    document.querySelectorAll(SELECTORS.join(",")).forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  function makeObserver(opts) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      opts
    );
    return observer;
  }

  // Block-level reveals: punchy, trigger once ~12% visible.
  var blockObserver = makeObserver({ threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  // Section-level reveals: earlier trigger so the fade begins as the section
  // peeks in (sections are tall; threshold 0.12 would mean the user has scrolled
  // half-way through before the fade starts).
  var sectionObserver = makeObserver({ threshold: 0.08, rootMargin: "0px 0px -4% 0px" });

  document.querySelectorAll(".reveal-section").forEach(function (el) {
    sectionObserver.observe(el);
  });
  document.querySelectorAll(".reveal, .reveal-stagger").forEach(function (el) {
    blockObserver.observe(el);
  });
})();
