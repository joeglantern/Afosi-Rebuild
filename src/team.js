// AFOSI team page — click-to-reveal profile modal + a flippable "business
// card" component. Every .af-team-card on the page (built in team.html,
// data-* attributes carry the copy) wires into this same system, so hover
// affordance and the modal work identically for every person on the team.
//
// Bio copy is placeholder (lorem ipsum) until real bios are supplied per
// person — swap the data-team-bio value on each card in team.html when
// that copy is ready; nothing here needs to change.

const AVATAR_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 8l9 6 9-6"/></svg>`;
const PHONE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>`;
const GLOBE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>`;

function buildModal() {
  if (document.getElementById('team-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div id="team-modal">
    <div id="team-modal-card" style="position:relative;width:100%;max-width:820px;max-height:calc(100vh - 44px);overflow-y:auto;background:#FBF6EE;border:2px solid #17150F;box-shadow:14px 14px 0 #F26522;">
      <button id="team-modal-close" aria-label="Close profile" class="hov-ink" style="cursor:pointer;position:absolute;top:16px;right:16px;z-index:2;width:40px;height:40px;background:#17150F;color:#FBF6EE;border:none;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;">&times;</button>
      <div id="team-modal-grid" style="display:grid;grid-template-columns:280px 1fr;">
        <div style="position:relative;background:#141210;">
          <div style="position:absolute;top:-16px;left:-16px;width:80px;height:80px;background:#F26522;z-index:0;"></div>
          <img id="team-modal-img" src="" alt="" style="position:relative;z-index:1;display:block;width:100%;height:100%;min-height:280px;object-fit:cover;object-position:top;">
        </div>
        <div style="padding:40px 40px 36px;">
          <span id="team-modal-section" style="display:inline-flex;align-items:center;gap:9px;font-family:'Space Mono',monospace;font-size:11.5px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#F26522;"></span>
          <h3 id="team-modal-name" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(24px,2.6vw,32px);line-height:1.1;letter-spacing:-0.02em;margin:10px 0 4px;"></h3>
          <div id="team-modal-role" style="font-family:'Space Mono',monospace;font-size:13px;color:#8A8175;margin-bottom:18px;"></div>
          <p id="team-modal-bio" style="font-size:15px;line-height:1.75;color:#5A5346;margin:0 0 26px;"></p>

          <div class="af-bcard" id="team-bcard">
            <div class="af-bcard-inner" id="team-bcard-inner" role="button" tabindex="0" aria-label="Flip business card">
              <div class="af-bcard-face af-bcard-front" style="background:#17150F;color:#FBF6EE;padding:22px 24px;display:flex;flex-direction:column;justify-content:space-between;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <img src="/assets/afosi/afosi_logo_white.png" alt="AFOSI" style="height:22px;width:auto;">
                  <span style="width:9px;height:9px;background:#F26522;"></span>
                </div>
                <div>
                  <div id="team-bcard-name" style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:19px;letter-spacing:-0.01em;"></div>
                  <div id="team-bcard-role" style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#F26522;margin-top:4px;"></div>
                </div>
              </div>
              <div class="af-bcard-face af-bcard-back" style="background:#F26522;color:#141210;padding:22px 24px;display:flex;flex-direction:column;justify-content:space-between;">
                <div style="font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Action for Sustainability Initiative</div>
                <div style="display:flex;flex-direction:column;gap:6px;font-family:'Space Mono',monospace;font-size:12px;font-weight:600;">
                  <span style="display:flex;align-items:center;gap:8px;">${AVATAR_ICON}info@afosi.org</span>
                  <span style="display:flex;align-items:center;gap:8px;">${PHONE_ICON}+254 115 963 306</span>
                  <span style="display:flex;align-items:center;gap:8px;">${GLOBE_ICON}afosi.org</span>
                </div>
              </div>
            </div>
          </div>
          <div style="font-family:'Space Mono',monospace;font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:#8A8175;margin-top:10px;">Tap the card to flip →</div>
        </div>
      </div>
    </div>
  </div>`);

  const modal = document.getElementById('team-modal');
  const bcard = document.getElementById('team-bcard');
  const bcardInner = document.getElementById('team-bcard-inner');

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    bcard.classList.remove('flipped');
  }
  function flipCard() { bcard.classList.toggle('flipped'); }

  document.getElementById('team-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.style.display !== 'none') closeModal(); });
  bcardInner.addEventListener('click', flipCard);
  bcardInner.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); } });

  modal._afClose = closeModal;
}

function openTeamModal(card) {
  const modal = document.getElementById('team-modal');
  const d = card.dataset;

  document.getElementById('team-modal-img').src = d.teamPhoto || '';
  document.getElementById('team-modal-img').alt = d.teamName || '';
  document.getElementById('team-modal-section').textContent = d.teamSection || 'Team';
  document.getElementById('team-modal-name').textContent = d.teamName || '';
  document.getElementById('team-modal-role').textContent = d.teamRole || '';
  document.getElementById('team-modal-bio').textContent = d.teamBio || '';
  document.getElementById('team-bcard-name').textContent = d.teamName || '';
  document.getElementById('team-bcard-role').textContent = d.teamRole || '';
  document.getElementById('team-bcard').classList.remove('flipped');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

(function () {
  const cards = document.querySelectorAll('.af-team-card');
  if (!cards.length) return;
  buildModal();
  cards.forEach((card) => {
    card.addEventListener('click', () => openTeamModal(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTeamModal(card); }
    });
  });
})();
