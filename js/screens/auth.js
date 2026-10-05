/* WordQuest · sign in / create account */
(function (WQ) {
  'use strict';

  const h = WQ.h, UI = WQ.UI;

  WQ.App.register('auth', function (params) {
    let mode = params.mode || 'signin';
    const panel = h('section', { class: 'auth-panel' });

    function tab(id, label) {
      return h('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(mode === id),
        onclick: () => { mode = id; render(); }
      }, label);
    }

    function signInForm() {
      const form = h('form', { novalidate: true },
        UI.field('Username or email', 'login', 'text', { autocomplete: 'username', required: true }),
        UI.field('Password', 'password', 'password', { autocomplete: 'current-password', required: true }),
        h('div', { class: 'form-err', role: 'alert' }),
        h('button', { class: 'btn btn-gold btn-block', type: 'submit' }, 'Sign in'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.clearErrors(form);
        const fd = new FormData(form);
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const user = await WQ.Auth.login(fd.get('login'), fd.get('password'));
          UI.toast(`Welcome back, ${user.displayName}.`, 'good');
          WQ.App.go('hub');
        } catch (err) {
          UI.showError(form, err);
          btn.disabled = false;
        }
      });
      return form;
    }

    function signUpForm() {
      const form = h('form', { novalidate: true },
        UI.field('Display name', 'displayName', 'text', { autocomplete: 'nickname', maxlength: '24', required: true }, 'Shown on your profile and results.'),
        UI.field('Username', 'username', 'text', { autocomplete: 'username', maxlength: '20', required: true, autocapitalize: 'off' }, '3–20 lowercase letters, numbers or _'),
        UI.field('Email (optional)', 'email', 'email', { autocomplete: 'email' }, 'You can sign in with it too.'),
        UI.field('Password', 'password', 'password', { autocomplete: 'new-password', required: true }, 'At least 6 characters.'),
        UI.field('Confirm password', 'confirm', 'password', { autocomplete: 'new-password', required: true }),
        h('div', { class: 'form-err', role: 'alert' }),
        h('button', { class: 'btn btn-gold btn-block', type: 'submit' }, 'Create account'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.clearErrors(form);
        const fd = new FormData(form);
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const user = await WQ.Auth.register({
            displayName: fd.get('displayName'),
            username: fd.get('username'),
            email: fd.get('email'),
            password: fd.get('password'),
            confirm: fd.get('confirm')
          });
          UI.toast(`Account created. Welcome, ${user.displayName}!`, 'good');
          WQ.App.go('hub');
        } catch (err) {
          UI.showError(form, err);
          btn.disabled = false;
        }
      });
      return form;
    }

    function render() {
      const form = mode === 'signin' ? signInForm() : signUpForm();
      panel.replaceChildren(
        h('div', { class: 'tabs', role: 'tablist' }, tab('signin', 'Sign in'), tab('signup', 'Create account')),
        form,
        h('p', { class: 'fine' }, 'Your account and progress are saved in this browser on this device. Use Backup in your profile to move them.'));
      const first = form.querySelector('input');
      if (first) setTimeout(() => first.focus(), 30);
    }

    render();
    UI.mount(h('main', { class: 'auth' },
      h('section', { class: 'auth-hero' },
        h('h1', { class: 'logo' }, 'Word', h('br'), 'Quest'),
        h('p', { class: 'auth-lede' }, 'Four game worlds share one word list. The words you miss come back until they stick.'),
        h('ul', { class: 'auth-worlds' }, WQ.Modes.list.map((m) =>
          h('li', { style: { '--c': `var(--${m.id})` } }, h('span', { 'aria-hidden': 'true' }, m.icon), m.name)))),
      panel));
  });
})(window.WQ = window.WQ || {});
