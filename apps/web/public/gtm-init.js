// Starts Google Tag Manager once the page has loaded and gone idle, not during first load.
// GTM pulls in the Meta pixel and its config, about 420 KB over the wire and 1.5 MB of script to
// parse, which competed with the app's own bundles while the page hydrated.
//
// The start event is queued now, so its timestamp is the real page start; anything pushed to
// dataLayer before gtm.js arrives waits there and is processed when it does.
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

(function () {
  function inject() {
    var script = document.createElement('script');
    script.id = 'google-tag-manager';
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-KJQ3T7W9';
    document.head.appendChild(script);
  }
  function whenIdle() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(inject, { timeout: 4000 });
    else setTimeout(inject, 2000);
  }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
})();
