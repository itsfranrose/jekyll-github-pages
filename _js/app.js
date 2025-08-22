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
}, false);
