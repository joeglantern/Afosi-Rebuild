// AFOSI donate page — amount/frequency picker, a confirm-then-pay modal, and
// Paystack's inline checkout popup.
//
// Security note: this page never touches a Paystack secret. It POSTs
// donor-entered amount/contact details to our own backend, which returns a
// server-generated reference, the PUBLIC key (safe to expose client-side by
// design) and an authoritative amount/currency. Once Paystack's own popup
// reports success (onSuccess), we hand the reference straight back to our
// backend, which verifies the charge against Paystack's API before treating
// the gift as real — the client-side callback is never trusted on its own.

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

  function renderConfirm(amount, freq) {
    modalLocked = false;
    modalCard.innerHTML = `
      ${iconCircle('#F26522', HEART_SVG)}
      <h3 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;margin:0 0 10px;">Confirm your gift</h3>
      <p style="font-size:15px;color:#5A5346;line-height:1.6;margin:0 0 26px;">You're about to give <strong style="color:#17150F;">${fmtKES(amount)}</strong>${freq === 'MONTHLY' ? ', <strong style="color:#17150F;">every month</strong>,' : ''} to AFOSI. A secure checkout window will open for you to pay by ${freq === 'MONTHLY' ? 'card (required for automatic monthly billing)' : 'M-Pesa, card, or bank transfer'}.</p>
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
    modalCard.innerHTML = `
      ${iconCircle('#FDF3E0', '<svg class="af-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9922E" stroke-width="3"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round"/></svg>')}
      <h3 style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;margin:0 0 10px;">${text}</h3>
      <p style="font-size:14.5px;color:#5A5346;margin:0;">Please don't close this window.</p>`;
  }

  function renderResult(kind, title, body, opts = {}) {
    modalLocked = false;
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

  async function submitDonation(amount, freq) {
    renderLoading('Connecting to secure checkout…');
    const name = document.getElementById('donate-name').value.trim();
    const email = document.getElementById('donate-email').value.trim();
    const phone = document.getElementById('donate-phone').value.trim();
    let order;
    try {
      const res = await fetch(`${DONATE_URL}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, name, email, phone, frequency: freq }),
      });
      order = await res.json().catch(() => ({}));
      if (!res.ok || !order.reference || !order.publicKey) {
        modalLocked = false;
        renderResult('failed', 'Could not start payment', order.message || 'Something went wrong on our end. Please try again shortly.', { retry: true });
        return;
      }
    } catch (err) {
      console.error('[donate] /initiate request failed:', err);
      modalLocked = false;
      renderResult('failed', 'Network error', 'Please check your connection and try again.', { retry: true });
      return;
    }

    // Separate try/catch: a failure here is Paystack's popup itself, not the
    // network — conflating the two under one message previously hid the real
    // error (an unsupported 'ussd' channel for KES) behind a generic
    // "Network error" toast with nothing logged to diagnose it.
    try {
      openPaystackCheckout(order, freq);
    } catch (err) {
      console.error('[donate] could not open Paystack checkout:', err);
      modalLocked = false;
      renderResult('failed', 'Payment could not load', 'The secure checkout could not start. Please refresh the page and try again, or email info@afosi.org.', { retry: true });
    }
  }

  // Paystack's own script renders its checkout as a popup on top of the page
  // — no redirect, no iframe of ours needed. Our modal just steps out of the
  // way while it's open, and comes back for the loading/result states.
  function openPaystackCheckout(order, freq) {
    if (typeof window.PaystackPop === 'undefined') {
      renderResult('failed', 'Payment could not load', 'The secure checkout script failed to load. Please refresh the page and try again.', { retry: true });
      return;
    }
    modal.style.display = 'none';
    document.body.style.overflow = '';

    let settled = false;
    const popup = new window.PaystackPop();
    // Built conditionally rather than as one literal with `field: x || undefined`
    // — Paystack's SDK validates transaction params against a schema, and a
    // key that's *present but undefined* can fail that validation
    // differently than a key that's simply absent (this is what caused the
    // "Invalid transaction parameters" error on donations with no phone
    // number / a one-time gift with no planCode).
    const options = {
      key: order.publicKey,
      email: order.customer.email,
      amount: Math.round(order.amount * 100), // Paystack wants KES cents, not shillings
      currency: order.currency,
      reference: order.reference,
      channels: order.channels,
      firstName: order.customer.name,
      metadata: {
        custom_fields: [{ display_name: 'Donation type', variable_name: 'donation_type', value: freq === 'MONTHLY' ? 'Monthly donation to AFOSI' : 'Donation to AFOSI' }],
      },
      onSuccess: function () {
        settled = true;
        verifyDonation(order.reference);
      },
      onCancel: function () {
        if (!settled) renderResult('cancelled', 'Payment cancelled', 'No charge was made. You can try again any time below.');
      },
      onError: function () {
        settled = true;
        renderResult('failed', 'Payment failed', 'Something went wrong during checkout. If you were charged, email info@afosi.org with your reference and we will sort it out.', { retry: true });
      },
    };
    if (order.planCode) options.planCode = order.planCode;
    if (order.customer.phone) options.phone = order.customer.phone;

    popup.newTransaction(options);
  }

  // Never trust Paystack's own client-side callback claim of success — ask
  // our backend to verify the transaction server-side before showing it.
  async function verifyDonation(reference) {
    renderLoading('Confirming your payment…');
    try {
      const res = await fetch(`${DONATE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        renderResult('success', 'Thank you — payment received!', "Your gift is confirmed. A receipt has been sent to the email or phone you provided. You're directly funding AFOSI's work — thank you.");
      } else {
        renderResult('failed', 'Payment could not be verified', json.message || 'We could not confirm this payment. If you were charged, email info@afosi.org with your reference and we will sort it out.', { retry: true });
      }
    } catch {
      renderResult('pending', 'Could not confirm payment status', 'If you completed checkout, you should still receive a receipt shortly. If unsure, email info@afosi.org with your reference.');
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
    if (!email) {
      showError('Please provide an email address so we can process your payment and send a receipt.');
      return;
    }

    renderConfirm(amount, frequency);
  });

  // No post-redirect return handling needed — Paystack's inline popup never
  // navigates the page away, so payment resolution happens entirely through
  // the callbacks wired up in openPaystackCheckout() above.
}
