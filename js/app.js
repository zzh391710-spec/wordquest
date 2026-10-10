/* WordQuest · start-up */
(function (WQ) {
  'use strict';

  async function boot() {
    if (WQ.Cloud) await WQ.Cloud.init();
    let user = null;
    try { user = await WQ.Auth.restore(); } catch (e) { console.error(e); }
    if (!WQ.Cloud.enabled && !WQ.Storage.persistent) {
      WQ.UI.toast('This browser blocks storage, so progress will be lost when you close the tab.', 'bad');
    }
    WQ.App.go(user ? 'hub' : 'auth');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.WQ = window.WQ || {});
