/* 共用確認框：取代 window.confirm。回傳 Promise<boolean>，Esc、點背景、取消一律視為 false。 */
(function () {
  'use strict';
  window.SD = window.SD || {};

  let dlg, titleEl, bodyEl, okBtn, cancelBtn, resolveFn;

  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'dlg-confirm';
    dlg.className = 'sd';
    dlg.setAttribute('aria-labelledby', 'confirm-title');
    dlg.setAttribute('aria-describedby', 'confirm-body');

    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-4 p-6';
    titleEl = document.createElement('h2');
    titleEl.id = 'confirm-title';
    titleEl.className = 'text-lg font-black';
    bodyEl = document.createElement('p');
    bodyEl.id = 'confirm-body';
    bodyEl.className = 'text-sm leading-relaxed text-ink-300';

    const row = document.createElement('div');
    row.className = 'flex flex-wrap justify-end gap-2';
    // 取消排在前面：showModal 會把焦點給第一個可聚焦元素，破壞性操作的預設焦點應落在安全的選項上
    cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-ghost';
    okBtn = document.createElement('button');
    okBtn.type = 'button';
    row.append(cancelBtn, okBtn);
    wrap.append(titleEl, bodyEl, row);
    dlg.appendChild(wrap);

    cancelBtn.addEventListener('click', () => dlg.close('cancel'));
    okBtn.addEventListener('click', () => dlg.close('ok'));
    // 內層 wrap 撐滿 dialog（.sd 是 p-0），只有 ::backdrop 的點擊 target 才會是 dialog 本身
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
    // Esc 也會觸發 close，但不會改 returnValue，所以每次開啟前都先把 returnValue 重設成 cancel
    dlg.addEventListener('close', () => {
      const done = resolveFn; resolveFn = null;
      if (done) done(dlg.returnValue === 'ok');
    });
    document.body.appendChild(dlg);
  }

  /**
   * @param {{ title: string, body?: string, okText?: string, cancelText?: string, danger?: boolean }} opts
   * @returns {Promise<boolean>}
   */
  function confirm(opts) {
    const { title, body = '', okText = '確定', cancelText = '取消', danger = false } = opts;
    if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
      return Promise.resolve(window.confirm(body ? `${title}\n\n${body}` : title));
    }
    if (!dlg) build();
    if (dlg.open) dlg.close('cancel');

    titleEl.textContent = title;
    bodyEl.textContent = body;
    bodyEl.hidden = !body;
    cancelBtn.textContent = cancelText;
    okBtn.textContent = okText;
    okBtn.className = danger ? 'btn-danger' : 'btn-primary';
    dlg.returnValue = 'cancel';

    return new Promise((resolve) => {
      resolveFn = resolve;
      dlg.showModal();
      cancelBtn.focus();
    });
  }

  window.SD.ui = Object.assign(window.SD.ui || {}, { confirm });
})();
