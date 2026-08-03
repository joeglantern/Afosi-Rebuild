// AFOSI donate page — amount/frequency picker, a confirm-then-pay modal, and
// the post-payment status modal when Pesapal redirects the browser back.
//
// Security note: this page never touches a Pesapal key. It only ever POSTs
// donor-entered amount/contact details to our own backend, which holds the
// Pesapal consumer key/secret server-side and returns a Pesapal-hosted
// redirect_url. Payment status is likewise fetched from our backend (never
// trusted from the redirect query string — Pesapal deliberately omits status
// from that redirect for security reasons).

const DONATE_URL = (import.meta.env && import.meta.env.VITE_DONATE_URL) || 'https://api.afosi.org/donate';

const HEART_SVG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="#141210"><path d="M12 21s-7.6-4.6-10.3-9.6C.4 8.5 1.7 4.9 5.3 4c2-.5 4 .3 5.2 2 .3.5.9.5 1.2 0 1.2-1.7 3.2-2.5 5.2-2 3.6.9 4.9 4.5 3.4 7.4C19.6 16.4 12 21 12 21z"/></svg>';

function fmtKES(n) {
  return `KES ${Number(n).toLocaleString()}`;
}

const root = document.getElementById('donate-form');
if (root) {
  const chipsWrap = document.getElementById('donate-amount-chips');
  const customInput = document.getElementById('donate-amount-custom');
  const freqBtns = Array.from(document.querySelectorAll('.af-freq-btn'));
  const errorBox = document.getElementById('donate-error');
  const submitLabel = document.getElementById('donate-submit-label');
  const modal = document.getElementById('donate-modal');
  const modalCard = document.getElementById('donate-modal-card');

  let frequency = 'ONCE';
  let selectedChip = null;

  function paintChips() {
    chipsWrap.querySelectorAll('.af-amt-btn').forEach((btn) => {
      const active = btn === selectedChip;
      btn.style.background = active ? '#F26522' : 'transparent';
      btn.style.color = active ? '#141210' : '#17150F';
    });
  }

  function paintFreq() {
    freqBtns.forEach((btn) => {
      const active = btn.dataset.freq === frequency;
      btn.style.background = active ? '#17150F' : 'transparent';
      btn.style.color = active ? '#FBF6EE' : '#17150F';
      btn.setAttribute('aria-pressed', String(active));
    });
    submitLabel.textContent = frequency === 'MONTHLY' ? 'Set up monthly gift' : 'Donate securely';
  }

  chipsWrap.querySelectorAll('.af-amt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedChip = btn;
      customInput.value = '';
      paintChips();
      btn.classList.remove('af-chip-pop');
      void btn.offsetWidth; // restart the animation on repeat clicks
      btn.classList.add('af-chip-pop');
    });
  });

  customInput.addEventListener('input', () => {
    if (customInput.value) { selectedChip = null; paintChips(); }
  });

  freqBtns.forEach((btn) => {
    btn.addEventListener('click', () => { frequency = btn.dataset.freq; paintFreq(); });
  });

  // Prefill from a homepage quick-pick link, e.g. /donate.html?amount=2500
  (function prefillAmount() {
    const qp = new URLSearchParams(location.search);
    const amt = Number(qp.get('amount'));
    if (!amt) return;
    const match = Array.from(chipsWrap.querySelectorAll('.af-amt-btn')).find((b) => Number(b.dataset.amount) === amt);
    if (match) { selectedChip = match; paintChips(); }
    else { customInput.value = String(amt); }
  })();

  paintChips();
  paintFreq();

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    errorBox.classList.remove('af-shake');
    void errorBox.offsetWidth;
    errorBox.classList.add('af-shake');
  }
  function hideError() {
    errorBox.style.display = 'none';
  }

  // ---------------------------------------------------------------------
  // Modal — confirm / loading / success / pending / failed / cancelled.
  // ---------------------------------------------------------------------
  let modalLocked = false; // true while a request is in flight — don't let backdrop/Esc close it

  function openModal() {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (modalLocked) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function iconCircle(bg, inner, extraClass) {
    return `<div class="af-icon-pop${extraClass ? ' ' + extraClass : ''}" style="width:64px;height:64px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;margin:0 auto 22px;">${inner}</div>`;
  }

  // The confirm/loading/result states are a compact 440px text card; the
  // embedded checkout needs to be much bigger to comfortably fit Pesapal's
  // own payment form. Toggle between the two rather than fighting one fixed size.
  function setModalSize(big) {
    modalCard.style.maxWidth = big ? '480px' : '440px';
    modalCard.style.padding = big ? '0' : '38px';
    modalCard.style.textAlign = big ? 'left' : 'center';
    modalCard.style.overflow = big ? 'hidden' : 'visible';
  }

  function renderConfirm(amount, freq) {
    modalLocked = false;
    setModalSize(false);
    modalCard.innerHTML = `
      ${iconCircle('#F26522', HEART_SVG)}
      <h3 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 10px;">Confirm your gift</h3>
      <p style="font-size:15px;color:#5A5346;line-height:1.6;margin:0 0 26px;">You're about to give <strong style="color:#17150F;">${fmtKES(amount)}</strong>${freq === 'MONTHLY' ? ', <strong style="color:#17150F;">every month</strong>,' : ''} to AFOSI. You'll be taken to Pesapal's secure checkout to pay by M-Pesa or card.</p>
      <div style="display:flex;gap:12px;">
        <button id="donate-modal-cancel" style="cursor:pointer;flex:1;background:transparent;border:2px solid #17150F;color:#17150F;padding:14px 20px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14.5px;">Cancel</button>
        <button id="donate-modal-confirm" class="hov-ink" style="cursor:pointer;flex:1;background:#F26522;border:2px solid #17150F;color:#141210;padding:14px 20px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14.5px;">Continue →</button>
      </div>`;
    document.getElementById('donate-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('donate-modal-confirm').addEventListener('click', () => submitDonation(amount, freq));
    openModal();
  }

  function renderLoading(text) {
    modalLocked = true;
    setModalSize(false);
    modalCard.innerHTML = `
      ${iconCircle('#FDF3E0', '<svg class="af-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9922E" stroke-width="3"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round"/></svg>')}
      <h3 style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;margin:0 0 10px;">${text}</h3>
      <p style="font-size:14.5px;color:#5A5346;margin:0;">Please don't close this window.</p>`;
  }

  function renderResult(kind, title, body, opts = {}) {
    modalLocked = false;
    setModalSize(false);
    const icons = {
      success: iconCircle('#2E7D32', '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FBF6EE" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path class="af-check-draw" d="M4 12.5l5 5L20 6"/></svg>'),
      pending: iconCircle('#FDF3E0', '<svg class="af-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9922E" stroke-width="3"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round"/></svg>'),
      failed: iconCircle('#B23A2E', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FBF6EE" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>', 'af-shake'),
      cancelled: iconCircle('#F0EEE8', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5A5346" stroke-width="3" stroke-linecap="round"><path d="M6 12h12"/></svg>'),
    };
    const retryBtn = opts.retry ? `<button id="donate-modal-retry" class="hov-ink" style="cursor:pointer;flex:1;background:#F26522;border:2px solid #17150F;color:#141210;padding:14px 20px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14.5px;">Try again</button>` : '';
    modalCard.innerHTML = `
      ${icons[kind]}
      <h3 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 10px;">${title}</h3>
      <p style="font-size:15px;color:#5A5346;line-height:1.6;margin:0 0 26px;">${body}</p>
      <div style="display:flex;gap:12px;">
        <button id="donate-modal-close" style="cursor:pointer;flex:1;background:${opts.retry ? 'transparent' : '#17150F'};border:2px solid #17150F;color:${opts.retry ? '#17150F' : '#FBF6EE'};padding:14px 20px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14.5px;">${opts.retry ? 'Close' : 'Done'}</button>
        ${retryBtn}
      </div>`;
    document.getElementById('donate-modal-close').addEventListener('click', closeModal);
    const retryEl = document.getElementById('donate-modal-retry');
    if (retryEl) retryEl.addEventListener('click', closeModal);
    openModal();
  }

  // Embeds Pesapal's hosted checkout inline instead of navigating the whole
  // page away. Pesapal's page itself breaks back out to callback_url on the
  // parent window once payment finishes (redirect_mode: PARENT_WINDOW, set
  // server-side) — that's a real navigation of this same page, which is why
  // checkReturn() below (reading OrderTrackingId from location.search) is all
  // that's needed to pick the result back up.
  function renderCheckout(redirectUrl) {
    modalLocked = true;
    setModalSize(true);
    modalCard.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(23,21,15,0.12);">
        <span style="font-family:'Space Mono',monospace;font-size:12px;letter-spacing:0.04em;color:#5A5346;">🔒 Secure checkout — Pesapal</span>
        <button id="donate-checkout-close" aria-label="Close" style="cursor:pointer;background:transparent;border:none;color:#5A5346;font-size:20px;line-height:1;padding:4px;">✕</button>
      </div>
      <div style="position:relative;height:min(78vh,640px);background:#FBF6EE;">
        <div id="donate-checkout-loading" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;">
          <svg class="af-spin" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9922E" stroke-width="3"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round"/></svg>
          <span style="font-size:13.5px;color:#5A5346;">Loading secure checkout…</span>
        </div>
        <iframe id="donate-checkout-frame" src="${redirectUrl}" title="Pesapal secure checkout" style="position:relative;width:100%;height:100%;border:none;display:block;"></iframe>
      </div>
      <div style="padding:12px 18px;border-top:1px solid rgba(23,21,15,0.12);text-align:center;">
        <span style="font-size:12.5px;color:#8A8175;">Not loading? </span><a id="donate-checkout-fallback" href="${redirectUrl}" style="font-size:12.5px;font-weight:700;">Open checkout in a new tab →</a>
      </div>`;
    const frame = document.getElementById('donate-checkout-frame');
    const loading = document.getElementById('donate-checkout-loading');
    frame.addEventListener('load', () => { if (loading) loading.style.display = 'none'; }, { once: true });
    document.getElementById('donate-checkout-close').addEventListener('click', () => {
      modalLocked = false;
      closeModal();
    });
    document.getElementById('donate-checkout-fallback').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = redirectUrl;
    });
    openModal();
  }

  async function submitDonation(amount, freq) {
    renderLoading('Connecting to Pesapal securely…');
    const name = document.getElementById('donate-name').value.trim();
    const email = document.getElementById('donate-email').value.trim();
    const phone = document.getElementById('donate-phone').value.trim();
    try {
      const res = await fetch(`${DONATE_URL}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, name, email, phone, frequency: freq }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.redirect_url) {
        modalLocked = false;
        renderResult('failed', 'Could not start payment', json.message || 'Something went wrong on our end. Please try again shortly.', { retry: true });
        return;
      }
      renderCheckout(json.redirect_url);
    } catch (err) {
      modalLocked = false;
      renderResult('failed', 'Network error', 'Please check your connection and try again.', { retry: true });
    }
  }

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError();

    const amount = Number(selectedChip ? selectedChip.dataset.amount : customInput.value);
    const email = document.getElementById('donate-email').value.trim();
    const phone = document.getElementById('donate-phone').value.trim();

    if (!Number.isFinite(amount) || amount < 50) {
      showError('Please choose or enter an amount of at least KES 50.');
      return;
    }
    if (!email && !phone) {
      showError('Please provide an email or phone number so we can send a receipt.');
      return;
    }

    renderConfirm(amount, frequency);
  });

  // ---------------------------------------------------------------------
  // Post-payment return from Pesapal, or a cancelled checkout.
  // ---------------------------------------------------------------------
  (async function checkReturn() {
    const qp = new URLSearchParams(location.search);
    const trackingId = qp.get('OrderTrackingId');
    const merchantRef = qp.get('OrderMerchantReference');

    if (qp.get('cancelled') === '1') {
      renderResult('cancelled', 'Payment cancelled', 'No charge was made. You can try again any time below.');
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/donate.html');
      return;
    }
    if (!trackingId) return;

    renderLoading('Checking your payment…');
    try {
      const res = await fetch(`${DONATE_URL}/status?orderTrackingId=${encodeURIComponent(trackingId)}`);
      const json = await res.json().catch(() => ({}));
      const status = String(json.status || '').toUpperCase();
      if (status === 'COMPLETED') {
        renderResult('success', 'Thank you — payment received!', `Your gift${merchantRef ? ` (ref. ${merchantRef})` : ''} is confirmed. A receipt has been sent to the email or phone you provided. You're directly funding AFOSI's work — thank you.`);
      } else if (status === 'FAILED') {
        renderResult('failed', 'Payment did not go through', 'Your card or M-Pesa payment was not completed, and you have not been charged.', { retry: true });
      } else {
        renderResult('pending', 'Payment pending', 'We have not received confirmation yet. If you completed an M-Pesa prompt, this can take a minute — refresh this page shortly, or check your email for a receipt.');
      }
    } catch {
      renderResult('pending', 'Could not confirm payment status', 'If you completed checkout, you should still receive a receipt shortly. If unsure, email info@afosi.org with your reference.');
    }

    if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/donate.html');
  })();
}
