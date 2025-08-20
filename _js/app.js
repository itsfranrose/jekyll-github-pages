/* app.js: safe init for SweetScroll and particles (vendor scripts are local assets) */
document.addEventListener("DOMContentLoaded", function () {
  // SweetScroll init (if available)
  if (typeof SweetScroll !== 'undefined') {
    try {
      /* eslint-disable no-unused-vars */
      const sweetScroll = new SweetScroll({/* some options */});
      /* eslint-enable no-unused-vars */
    } catch (e) {
      console.warn('SweetScroll init failed:', e);
    }
  } else {
    // console.info('SweetScroll not available');
  }

  function initParticlesAdaptive() {
    // Device/viewport heuristics
    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // cap at 2 for safety
    const area = window.innerWidth * window.innerHeight;
    // rough particle base scaled by area (tweak constants to taste)
    let base = Math.round(Math.max(12, Math.min(160, area / 15000)));
    // reduce on high DPR and low CPU core counts
    if (DPR > 1.5) base = Math.round(base / DPR);
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) base = Math.round(base * 0.6);
    base = Math.max(10, Math.min(160, base));
	base = Math.floor(1.5 * base);
  
    // Performance-oriented config
    const cfg = {
      particles: {
        number: { value: base, density: { enable: false } }, // use fixed count (no density)
        color: { value: "#ffffff" },
        shape: { type: "circle" },
        opacity: { value: 0.45, random: false }, // no per-particle opacity randomness
        size: { value: 1.4, random: true },
        line_linked: { enable: false },
        move: {
          enable: false,
          speed: 0.6,
          direction: "none",
          random: true,
          straight: false,
          out_mode: "out"
        }
      },
      interactivity: {
        detect_on: "canvas",
        events: { onhover: { enable: false }, onclick: { enable: false }, resize: false },
        modes: {}
      },
      retina_detect: false // IMPORTANT: prevents expensive backing-store scaling
    };
  
    // Destroy previous instance if present
    try {
      if (window.pJSDom && window.pJSDom.length) {
        window.pJSDom.forEach(d => d && d.pJS && d.pJS.fn && d.pJS.fn.vendors && d.pJS.fn.vendors.destroypJS && d.pJS.fn.vendors.destroypJS());
        window.pJSDom = [];
      }
    } catch (e) { /* ignore */ }
  
    particlesJS('particles-js', cfg);
  }
  
  // init now
  initParticlesAdaptive();
}, false);
