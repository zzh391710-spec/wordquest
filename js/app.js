/* WordQuest · start-up */
(function (WQ) {
  'use strict';

  async function boot() {
    const user = await WQ.Auth.restore();
    if (!WQ.Storage.persistent) {
      WQ.UI.toast('This browser blocks storage, so progress will be lost when you close the tab.', 'bad');
    }
    WQ.App.go(user ? 'hub' : 'auth');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.WQ = window.WQ || {});
