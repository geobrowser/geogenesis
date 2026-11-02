// Queues the Google Tag Manager start event. Loaded as an async script next to gtm.js so neither
// waits on stylesheets; the order the two run in does not matter, because gtm.js drains whatever
// is already in dataLayer and takes over push() for what comes after.
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
