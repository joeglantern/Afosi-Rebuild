// AFOSI opportunity application form — vanilla port of the old React
// OpportunityApply flow. Multi-step, three variants (supplier prequalification,
// standard job application, and per-consultancy custom forms like the ESD &
// Climate Storytelling one below), auto-detected from the opportunity
// slug/title. Standard + supplier submit to the legacy backend (applyAPI,
// unchanged); custom-form variants submit to this project's own VPS service
// (applicationsAPI) — documents land privately on the VPS's disk, not public
// Supabase Storage, and are retrievable from the admin dashboard's
// Applications tab.
import { opportunitiesAPI, applyAPI, applicationsAPI } from './api.js';

// ── Option data ──────────────────────────────────────────────────────────────
const SUPPLIER_CATEGORIES = [
  'Office Stationery and Supplies', 'Foodstuffs and Groceries',
  'Cleaning Materials and Detergents', 'Drinking Water Supply and Dispenser Services',
  'Insurance Brokerage Services', 'Pension Administration Services',
  'Airtime and Data Solutions', 'Office Furniture and Interior Solutions',
  'Kitchenware and Catering Equipment', 'Printing, Branding, and Promotional Materials',
  'Internet and Connectivity Services', 'Transport and Vehicle Hire Services',
  'Hotel Accommodation and Conference Facilities', 'Travel Management Services',
  'Event Management Services', 'Professional Consultancy Services',
  'ICT Equipment, Software, and Technical Support', 'Building Maintenance Services',
  'Fire Safety and First Aid Equipment', 'Research, Monitoring, and Evaluation Services',
  'Media, Photography, Videography, and Communications', 'Training and Capacity Building Services',
];
const SPECIALISATIONS = [
  'Education & Learning', 'Research, Monitoring & Evaluation', 'Training & Capacity Building',
  'Community Engagement & Mobilization', 'Policy Advocacy & Governance', 'Digital Innovation & ICT',
  'Communications & Media', 'Gender & Social Inclusion', 'Environmental Sustainability',
  'Financial & Procurement Services', 'Workshop & Event Facilitation',
  'Printing, Supplies & Logistics', 'Consultancy & Advisory Services',
];
const GEOGRAPHIC_REGIONS = [
  'National (Kenya-wide)', 'Nairobi Region', 'Coast Region', 'Central Region', 'Western Region',
  'Nyanza Region', 'Rift Valley Region', 'Eastern Region', 'North Eastern Region',
];
const YEARS_EXPERIENCE_OPTIONS = ['Less than 5 years', '5–7 years', '8–10 years', 'More than 10 years'];

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const INPUT = 'width:100%;padding:12px 14px;border:2px solid #17150F;background:#FFFFFF;color:#17150F;font-family:Manrope,sans-serif;font-size:15px;outline:none;';
const LABEL = "display:block;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;margin:0 0 6px;";
const REQ = '<span style="color:#F26522;">*</span>';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  opp: null,
  variant: 'standard', // 'standard' | 'supplier' | 'esd-storytelling'
  step: 1,
  submitting: false,
  form: {
    fullName: '', applyingAs: 'Individual Consultant', organizationName: '',
    supplierType: 'Consultant', yearsInOperation: '1–3 years', categoryApplied: SUPPLIER_CATEGORIES[0],
    primaryContact: '', jobTitle: '', phoneNumber: '', altPhoneNumber: '', emailAddress: '',
    specialisations: [], geographicCoverage: [],
    legallyRegistered: 'Yes', taxCompliance: 'Yes', activeBankAccount: 'Yes',
    bankAccountDetails: '', consentData: false, confirmTruth: false, howHeard: [], howHeardOther: '',
    applicantName: '', applicantEmail: '', applicantPhone: '', linkedinUrl: '',
    coverLetterText: '', consentJob: false, confirmTruthJob: false,
    // ESD & Climate Storytelling Consultancy (and future custom-form variants
    // reuse applicantName/applicantEmail/applicantPhone above for identity).
    applicantType: 'Individual Consultant',
    qualification: '', yearsExperience: YEARS_EXPERIENCE_OPTIONS[0],
    podcastExperience: '', childrenYouthExperience: '', climateEsdExperience: '',
    workSampleLink1: '', workSampleLink2: '', workSampleRoleOutputs: '',
    methodology: '', safeguardingApproach: '', workPlan: '',
    costPackage: '', costPlatformTools: '', costVisibility: '', costSoftware: '',
    ref1Name: '', ref1Org: '', ref1Contact: '', ref2Name: '', ref2Org: '', ref2Contact: '',
    declaration: false,
  },
  uploads: {}, // key → { url, name, loading, error }
};

let root;

function totalSteps() {
  if (state.variant === 'supplier') return 5;
  if (state.variant === 'esd-storytelling') return 7;
  return 3;
}
function wordCount(s) { return (String(s || '').trim().match(/\S+/g) || []).length; }
function fmtMoney(n) { return Number(n || 0).toLocaleString('en-KE'); }
function costTotal() {
  return ['costPackage', 'costPlatformTools', 'costVisibility', 'costSoftware']
    .reduce((sum, k) => sum + (Number(state.form[k]) || 0), 0);
}

// ── Field helpers ────────────────────────────────────────────────────────────
function textField(key, label, opts = {}) {
  const v = esc(state.form[key]);
  return (
    `<div>
       <label style="${LABEL}">${label} ${opts.required ? REQ : ''}</label>
       <input data-field="${key}" type="${opts.type || 'text'}" value="${v}" placeholder="${esc(opts.placeholder || '')}" style="${INPUT}">
     </div>`
  );
}
function selectField(key, label, options, opts = {}) {
  const cur = state.form[key];
  const opt = options.map((o) => {
    const val = typeof o === 'string' ? o : o.value;
    const text = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(val)}" ${val === cur ? 'selected' : ''}>${esc(text)}</option>`;
  }).join('');
  return (
    `<div>
       <label style="${LABEL}">${label} ${opts.required ? REQ : ''}</label>
       <select data-field="${key}" style="${INPUT}">${opt}</select>
     </div>`
  );
}
function checkGroup(key, label, options, cols) {
  const cur = state.form[key] || [];
  const boxes = options.map((o) =>
    `<label style="display:flex;align-items:flex-start;gap:8px;font-size:14px;cursor:pointer;padding:2px;">
       <input data-check="${key}" value="${esc(o)}" type="checkbox" ${cur.indexOf(o) > -1 ? 'checked' : ''} style="margin-top:3px;accent-color:#F26522;">
       <span>${esc(o)}</span>
     </label>`
  ).join('');
  return (
    `<div>
       <label style="${LABEL}">${label}</label>
       <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;background:#FFFFFF;border:2px solid #17150F;padding:16px;">${boxes}</div>
     </div>`
  );
}
function consentBox(key, text) {
  return (
    `<label style="display:flex;align-items:flex-start;gap:12px;font-size:14px;cursor:pointer;background:#FFFFFF;border:2px solid #17150F;padding:16px;">
       <input data-field="${key}" type="checkbox" ${state.form[key] ? 'checked' : ''} style="margin-top:3px;accent-color:#F26522;">
       <span>${text} ${REQ}</span>
     </label>`
  );
}
function uploader(key, label, required) {
  const u = state.uploads[key];
  let status;
  if (u && u.loading) status = `<span style="font-family:'Space Mono',monospace;font-size:12px;color:#F26522;">Uploading…</span>`;
  else if (u && u.url) status = `<span style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:#2E7D32;">✓ Uploaded</span>`;
  else status = `<label style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;background:#17150F;color:#FBF6EE;padding:9px 16px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:13px;">Select file<input data-upload="${key}" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style="display:none;"></label>`;
  return (
    `<div style="background:#FFFFFF;border:2px dashed #17150F;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
       <div>
         <p style="font-size:14px;font-weight:600;margin:0;">${label} ${required ? REQ : ''}</p>
         ${u && u.name ? `<p style="font-family:'Space Mono',monospace;font-size:12px;color:#8A8175;margin:4px 0 0;">${esc(u.name)}</p>` : ''}
         ${u && u.error ? `<p style="font-size:12px;color:#B23A2E;margin:4px 0 0;">${esc(u.error)}</p>` : ''}
       </div>
       ${status}
     </div>`
  );
}

function textareaField(key, label, opts = {}) {
  const v = esc(state.form[key]);
  const hint = opts.maxWords
    ? `<span style="font-weight:400;color:#8A8175;text-transform:none;letter-spacing:0;font-size:12.5px;"> — max ${opts.maxWords} words</span>`
    : '';
  return (
    `<div>
       <label style="${LABEL}">${label}${hint} ${opts.required ? REQ : ''}</label>
       ${opts.help ? `<p style="font-size:12.5px;color:#8A8175;margin:0 0 8px;">${esc(opts.help)}</p>` : ''}
       <textarea data-field="${key}" rows="${opts.rows || 5}" placeholder="${esc(opts.placeholder || '')}" style="${INPUT}resize:vertical;">${v}</textarea>
     </div>`
  );
}

const COST_ROWS = [
  ['costPackage', 'Consultancy package — design, production & dissemination support'],
  ['costPlatformTools', 'Digital platform management tools — monthly'],
  ['costVisibility', 'Online visibility / boosted reach support — monthly'],
  ['costSoftware', 'Audio editing & basic design software/licensing — monthly'],
];
function costTable() {
  const rowsHtml = COST_ROWS.map(([key, label]) => (
    `<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid rgba(23,21,15,0.12);flex-wrap:wrap;">
       <span style="font-size:14px;flex:1;min-width:220px;">${esc(label)}</span>
       <div style="display:flex;align-items:center;gap:6px;">
         <span style="font-family:'Space Mono',monospace;font-size:12px;color:#8A8175;">KES</span>
         <input data-field="${key}" data-cost type="number" min="0" step="1" value="${esc(state.form[key])}" placeholder="0" style="${INPUT}width:140px;padding:8px 10px;text-align:right;">
       </div>
     </div>`
  )).join('');
  return (
    `<div style="background:#FFFFFF;border:2px solid #17150F;padding:20px 22px;">
       ${rowsHtml}
       <div style="display:flex;justify-content:space-between;align-items:center;padding-top:16px;">
         <span style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;">Total</span>
         <span data-cost-total style="font-family:'Space Mono',monospace;font-weight:700;font-size:16px;">KES ${fmtMoney(costTotal())}</span>
       </div>
     </div>`
  );
}

function referenceBlock(prefix, label) {
  const f = (suffix, placeholder) =>
    `<input data-field="${prefix}${suffix}" placeholder="${placeholder}" value="${esc(state.form[prefix + suffix])}" style="${INPUT}">`;
  return (
    `<div>
       <label style="${LABEL}">${label} ${REQ}</label>
       <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
         ${f('Name', 'Name')}${f('Org', 'Organisation')}${f('Contact', 'Email or phone')}
       </div>
     </div>`
  );
}

// ── Step markup ──────────────────────────────────────────────────────────────
function stepMarkup() {
  const s = state.step;
  if (state.variant === 'esd-storytelling') {
    if (s === 1) return section('Section 1: Applicant Details', [
      selectField('applicantType', 'Applicant Type', ['Individual Consultant', 'Consultancy Firm/Organisation'], { required: true }),
      textField('applicantName', 'Full Name / Organisation Name', { required: true, placeholder: 'e.g. Jane Doe / Acme Media Ltd' }),
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">${textField('applicantEmail', 'Email Address', { required: true, type: 'email', placeholder: 'you@example.com' })}${textField('applicantPhone', 'Phone Number', { required: true, type: 'tel', placeholder: '+254 700 000 000' })}</div>`,
    ]);
    if (s === 2) return section('Section 2: Experience & Qualifications', [
      textField('qualification', 'Highest relevant academic/professional qualification', { required: true, placeholder: 'Qualification, field of study & institution' }),
      selectField('yearsExperience', 'Years of relevant experience in multimedia production, storytelling or digital communications', YEARS_EXPERIENCE_OPTIONS, { required: true }),
      textareaField('podcastExperience', 'Experience in podcast, audio production and digital storytelling', { required: true, help: 'Highlight your most relevant work and your role in the assignments.' }),
      textareaField('childrenYouthExperience', 'Experience working with children and young people', { required: true }),
      textareaField('climateEsdExperience', 'Experience or knowledge in climate change, environmental sustainability and/or Education for Sustainable Development (ESD)', { required: true }),
    ]);
    if (s === 3) return section('Section 3: Relevant Work', [
      `<p style="font-size:13px;color:#5A5346;margin:0;">Provide links to at least two relevant previous assignments — podcast/audio production, digital storytelling, media for social change, climate/ESD content, or work involving children and young people.</p>`,
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">${textField('workSampleLink1', 'Work sample link 1', { required: true, type: 'url', placeholder: 'https://…' })}${textField('workSampleLink2', 'Work sample link 2', { required: true, type: 'url', placeholder: 'https://…' })}</div>`,
      textareaField('workSampleRoleOutputs', 'Your role and key outputs in the work samples above', { required: true }),
    ]);
    if (s === 4) return section('Section 4: Proposed Approach', [
      textareaField('methodology', 'How would you approach developing and producing child-led climate and ESD stories and podcasts in Kibera and/or Mukuru?', { required: true, maxWords: 500, rows: 7 }),
      textareaField('safeguardingApproach', 'How would you ensure child safeguarding, informed consent and ethical representation throughout the storytelling and podcast production process?', { required: true, maxWords: 300, rows: 6 }),
      textareaField('workPlan', 'Proposed work plan (Planning → Story Development → Recording → Production → Dissemination)', { required: true, maxWords: 300, rows: 6 }),
    ]);
    if (s === 5) return section('Section 5: Financial Proposal', [
      `<p style="font-size:13px;color:#5A5346;margin:0;">All amounts in Kenyan Shillings (KES).</p>`,
      costTable(),
    ]);
    if (s === 6) return section('Section 6: Supporting Documents & References', [
      `<p style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#8A8175;margin:0;">PDF, DOC, DOCX, JPG, PNG — max 10 MB each</p>`,
      uploader('esdProfile', 'Consultant / Organisation Profile (max 3 pages)', true),
      uploader('esdCv', 'CV(s) of Key Personnel', true),
      uploader('esdInsurance', 'Proof of Relevant Insurance', true),
      uploader('esdSafeguarding', 'Safeguarding / Child Protection Evidence (where applicable)', false),
      referenceBlock('ref1', 'Reference 1'),
      referenceBlock('ref2', 'Reference 2'),
    ]);
    if (s === 7) return section('Section 7: Declaration', [
      consentBox('declaration', "I confirm that the information provided in this application is accurate and complete. I have read and agree to comply with AFOSI's applicable safeguarding, Code of Conduct, PSEAH, data protection and other relevant requirements, as well as the applicable requirements referenced in the Terms of Reference. I also confirm that I am not subject to the exclusion grounds specified in the TOR."),
    ]);
    return '';
  }
  if (state.variant === 'supplier') {
    if (s === 1) return section('Section 1: Applicant Identity', [
      textField('fullName', 'Full Name of Applicant', { required: true, placeholder: 'e.g. John Doe / Acme Services Ltd' }),
      selectField('applyingAs', 'Applying as', ['Individual Consultant', 'Registered Organization / Company', 'Both (Individual within an Organization)'], { required: true }),
      state.form.applyingAs !== 'Individual Consultant' ? textField('organizationName', 'Name of Organization / Business', { required: true, placeholder: 'Legal business name' }) : '',
      selectField('supplierType', 'Type of Supplier / Service Provider', ['Qualified Supplier', 'Service Provider', 'Consultant', 'Trainer / Facilitator', 'Researcher / Evaluator', 'OTHER'], { required: true }),
      selectField('yearsInOperation', 'Years in Operation / Practice', ['Less than 1 year', '1–3 years', '4–6 years', '7–10 years', 'Over 10 years'], { required: true }),
      selectField('categoryApplied', 'Category you are applying for', SUPPLIER_CATEGORIES.map((c, i) => ({ value: c, label: `${i + 1}. ${c}` })), { required: true }),
    ]);
    if (s === 2) return section('Section 2: Contact Information', [
      textField('primaryContact', 'Primary Contact Person', { required: true, placeholder: 'e.g. Jane Smith' }),
      textField('jobTitle', 'Job Title / Designation', { placeholder: 'e.g. Director / Managing Partner' }),
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">${textField('phoneNumber', 'Phone Number', { required: true, type: 'tel', placeholder: '+254 700 000 000' })}${textField('altPhoneNumber', 'Alternative Phone', { type: 'tel', placeholder: 'Optional' })}</div>`,
      textField('emailAddress', 'Email Address', { required: true, type: 'email', placeholder: 'contact@business.com' }),
    ]);
    if (s === 3) return section('Section 3: Areas of Specialisation', [
      checkGroup('specialisations', `Primary Area of Specialisation ${REQ}`, SPECIALISATIONS, 2),
      checkGroup('geographicCoverage', `Geographic Coverage ${REQ}`, GEOGRAPHIC_REGIONS, 3),
    ]);
    if (s === 4) return section('Section 4: Compliance & Uploads', [
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">${selectField('legallyRegistered', 'Legally Registered?', ['Yes', 'No'])}${selectField('taxCompliance', 'Valid Tax Compliance?', ['Yes', 'No', 'In Progress'])}${selectField('activeBankAccount', 'Active Bank Account?', ['Yes', 'No'])}</div>`,
      textField('bankAccountDetails', 'Bank Account Details', { required: true, placeholder: 'Bank Name, Account Name (must match registration)' }),
      `<p style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#8A8175;margin:6px 0 0;">Document uploads: PDF, JPG, PNG (max 10 MB each)</p>`,
      state.form.applyingAs !== 'Individual Consultant' ? uploader('registrationCertificate', 'Certificate of Registration / Incorporation', true) : '',
      uploader('taxComplianceCert', 'Tax Compliance Certificate', true),
      uploader('leadCv', 'CV / Resume of Lead Consultant or Key Contact', true),
      uploader('licenses', 'Professional Certificates or Licenses', false),
    ]);
    if (s === 5) return section('Section 5: Consent & Declaration', [
      consentBox('consentData', 'I consent to AFOSI collecting, storing, and using my submitted information for prequalification, program engagement, and procurement purposes, in line with applicable data protection laws.'),
      consentBox('confirmTruth', 'I confirm that all information and documents submitted in this form are accurate, complete, and truthful. I understand that providing false information may lead to immediate disqualification.'),
      checkGroup('howHeard', 'How did you hear about this opportunity?', ['LinkedIn', 'AFOSI Network', 'AFOSI Website', 'Facebook'], 2),
      textField('howHeardOther', 'Other (please specify)'),
    ]);
  } else {
    if (s === 1) return section('Section 1: Personal Details', [
      textField('applicantName', 'Full Name', { required: true, placeholder: 'e.g. John Doe' }),
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">${textField('applicantEmail', 'Email Address', { required: true, type: 'email', placeholder: 'john@example.com' })}${textField('applicantPhone', 'Phone Number', { required: true, type: 'tel', placeholder: '+254 700 000 000' })}</div>`,
      textField('linkedinUrl', 'LinkedIn Profile', { type: 'url', placeholder: 'https://linkedin.com/in/username' }),
    ]);
    if (s === 2) return section('Section 2: CV & Documents', [
      `<p style="font-size:13px;color:#5A5346;margin:0;">Accepted: PDF, DOC, DOCX, JPG, PNG — max 10 MB each</p>`,
      uploader('jobCv', 'CV / Resume', true),
      uploader('jobCoverLetter', 'Cover Letter Document', false),
      uploader('jobCertificates', 'Certificates / Academic Transcripts', false),
    ]);
    if (s === 3) return section('Section 3: Cover Letter & Review', [
      `<div><label style="${LABEL}">Cover Letter / Brief Pitch</label><textarea data-field="coverLetterText" rows="6" placeholder="Briefly pitch yourself and why you're the best fit for this role..." style="${INPUT}resize:vertical;">${esc(state.form.coverLetterText)}</textarea></div>`,
      consentBox('consentJob', 'I consent to AFOSI collecting, storing, and using my submitted information for recruitment purposes, in line with applicable data protection laws.'),
      consentBox('confirmTruthJob', 'I confirm that all information and documents in this application are accurate and truthful.'),
    ]);
  }
  return '';
}

function section(heading, blocks) {
  return (
    `<h3 style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;border-bottom:2px solid #17150F;padding-bottom:10px;margin:0 0 20px;">${esc(heading)}</h3>
     <div style="display:flex;flex-direction:column;gap:18px;">${blocks.filter(Boolean).join('')}</div>`
  );
}

// ── Validation ───────────────────────────────────────────────────────────────
function validateStep() {
  const f = state.form, u = state.uploads, s = state.step;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (state.variant === 'esd-storytelling') {
    if (s === 1) {
      if (!f.applicantName.trim()) return 'Full Name / Organisation Name is required.';
      if (!f.applicantEmail.trim()) return 'Email Address is required.';
      if (!email.test(f.applicantEmail)) return 'Enter a valid email address.';
      if (!f.applicantPhone.trim()) return 'Phone Number is required.';
    }
    if (s === 2) {
      if (!f.qualification.trim()) return 'Please state your highest relevant qualification.';
      if (!f.podcastExperience.trim()) return 'Please describe your podcast/audio production experience.';
      if (!f.childrenYouthExperience.trim()) return 'Please describe your experience working with children and young people.';
      if (!f.climateEsdExperience.trim()) return 'Please describe your climate change / ESD experience.';
    }
    if (s === 3) {
      if (!f.workSampleLink1.trim() || !f.workSampleLink2.trim()) return 'Please provide at least two work sample links.';
      if (!f.workSampleRoleOutputs.trim()) return 'Please describe your role and outputs in the work samples above.';
    }
    if (s === 4) {
      if (!f.methodology.trim()) return 'Please describe your proposed approach.';
      if (wordCount(f.methodology) > 500) return 'Proposed approach must be 500 words or fewer.';
      if (!f.safeguardingApproach.trim()) return 'Please describe your safeguarding and consent approach.';
      if (wordCount(f.safeguardingApproach) > 300) return 'Safeguarding & consent approach must be 300 words or fewer.';
      if (!f.workPlan.trim()) return 'Please outline your proposed work plan.';
      if (wordCount(f.workPlan) > 300) return 'Work plan must be 300 words or fewer.';
    }
    if (s === 6) {
      if (!(u.esdProfile && u.esdProfile.url)) return 'Please upload your Consultant / Organisation Profile.';
      if (!(u.esdCv && u.esdCv.url)) return 'Please upload the CV(s) of key personnel.';
      if (!(u.esdInsurance && u.esdInsurance.url)) return 'Please upload proof of relevant insurance.';
      if (!f.ref1Name.trim() || !f.ref2Name.trim()) return 'Please provide both professional references.';
    }
    if (s === 7) {
      if (!f.declaration) return 'You must agree to the declaration to submit.';
    }
    return null;
  }
  if (state.variant === 'supplier') {
    if (s === 1) {
      if (!f.fullName.trim()) return 'Full Name of Applicant is required.';
      if (f.applyingAs !== 'Individual Consultant' && !f.organizationName.trim()) return 'Organization / Business Name is required.';
    }
    if (s === 2) {
      if (!f.primaryContact.trim()) return 'Primary Contact Person is required.';
      if (!f.phoneNumber.trim()) return 'Phone Number is required.';
      if (!f.emailAddress.trim()) return 'Email Address is required.';
      if (!email.test(f.emailAddress)) return 'Enter a valid email address.';
    }
    if (s === 3) {
      if (!f.specialisations.length) return 'Select at least one area of specialisation.';
      if (!f.geographicCoverage.length) return 'Select at least one geographic region.';
    }
    if (s === 4) {
      if (f.applyingAs !== 'Individual Consultant' && !(u.registrationCertificate && u.registrationCertificate.url)) return 'Please upload your Certificate of Registration / Incorporation.';
      if (!(u.taxComplianceCert && u.taxComplianceCert.url)) return 'Please upload your Tax Compliance Certificate.';
      if (!(u.leadCv && u.leadCv.url)) return 'Please upload the CV / Resume.';
    }
    if (s === 5) {
      if (!f.consentData) return 'You must agree to the data protection consent.';
      if (!f.confirmTruth) return 'You must confirm the accuracy of your information.';
    }
  } else {
    if (s === 1) {
      if (!f.applicantName.trim()) return 'Full Name is required.';
      if (!f.applicantEmail.trim()) return 'Email Address is required.';
      if (!email.test(f.applicantEmail)) return 'Enter a valid email address.';
      if (!f.applicantPhone.trim()) return 'Phone Number is required.';
    }
    if (s === 2) { if (!(u.jobCv && u.jobCv.url)) return 'Please upload your CV / Resume.'; }
    if (s === 3) {
      if (!f.consentJob) return 'You must agree to the data protection consent.';
      if (!f.confirmTruthJob) return 'You must confirm the accuracy of your information.';
    }
  }
  return null;
}

// ── Render ───────────────────────────────────────────────────────────────────
function render() {
  const opp = state.opp;
  const bars = Array.from({ length: totalSteps() }, (_, i) =>
    `<div style="height:6px;flex:1;background:${i + 1 <= state.step ? '#F26522' : 'rgba(23,21,15,0.15)'};"></div>`
  ).join('');

  root.innerHTML = (
    `<section data-section style="max-width:820px;margin:0 auto;padding:48px 40px 100px;">
       <a href="/opportunity.html?slug=${encodeURIComponent(opp.slug || opp.id)}" style="display:inline-flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:26px;">← Back to Opportunity</a>
       <div style="background:#FFFFFF;border:2px solid #17150F;box-shadow:8px 8px 0 #17150F;padding:34px;">
         <div style="border-bottom:2px solid #17150F;padding-bottom:20px;margin-bottom:24px;">
           <span style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F26522;">Online Application Form</span>
           <h1 style="font-family:'Space Grotesk',sans-serif;font-size:clamp(26px,3.4vw,38px);font-weight:700;line-height:1.1;margin:10px 0 6px;">${esc(opp.title)}</h1>
           <p style="font-size:14px;color:#5A5346;margin:0;">Complete all fields below. Your submission${state.variant === 'esd-storytelling' ? ' and documents are securely recorded and reviewed by' : ' goes directly to'} our HR team${state.variant === 'esd-storytelling' ? '' : ' at <strong>careers@afosi.org</strong>'}.</p>
         </div>
         <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px;">
           <span style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;white-space:nowrap;">Step ${state.step} of ${totalSteps()}</span>
           <div style="display:flex;gap:6px;flex:1;">${bars}</div>
         </div>
         <form data-form>${stepMarkup()}
           <div data-error style="display:none;background:#FBE4E0;border:2px solid #B23A2E;color:#8A241A;padding:12px 14px;font-size:14px;margin-top:20px;"></div>
           <div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid #17150F;padding-top:22px;margin-top:26px;">
             ${state.step > 1 ? `<button type="button" data-back style="cursor:pointer;background:transparent;border:2px solid #17150F;color:#17150F;padding:12px 24px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;">← Back</button>` : '<span></span>'}
             ${state.step < totalSteps()
               ? `<button type="button" data-next class="hov-ink" style="cursor:pointer;background:#F26522;border:2px solid #17150F;color:#141210;padding:12px 26px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;">Continue →</button>`
               : `<button type="submit" data-submit ${state.submitting ? 'disabled' : ''} class="hov-ink" style="cursor:pointer;background:#F26522;border:2px solid #17150F;color:#141210;padding:12px 28px;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;${state.submitting ? 'opacity:0.6;' : ''}">${state.submitting ? 'Submitting…' : 'Submit Application'}</button>`}
           </div>
         </form>
       </div>
     </section>`
  );
  wire();
}

function renderSuccess() {
  root.innerHTML = (
    `<section data-section style="max-width:720px;margin:0 auto;padding:70px 40px 120px;">
       <div style="background:#FFFFFF;border:2px solid #17150F;box-shadow:8px 8px 0 #17150F;padding:48px 40px;text-align:center;">
         <div style="width:64px;height:64px;background:#2E7D32;color:#FBF6EE;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px;">✓</div>
         <h1 style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700;margin:0 0 12px;">Application submitted!</h1>
         <p style="font-size:16px;color:#5A5346;margin:0 0 6px;">Your application for <strong>${esc(state.opp.title)}</strong> has been received by our HR team.</p>
         <p style="font-size:14px;color:#8A8175;margin:0 0 28px;">A confirmation email has been sent to your inbox. Our team will reach out within <strong>7–14 business days</strong>.</p>
         <a href="/opportunities.html" class="hov-ink" style="display:inline-block;background:#F26522;color:#141210;padding:15px 30px;font-family:'Space Grotesk',sans-serif;font-weight:700;">Browse more opportunities</a>
       </div>
     </section>`
  );
}

function showError(msg) {
  const box = root.querySelector('[data-error]');
  if (box) { box.textContent = msg; box.style.display = 'block'; }
}

// ── Wiring ───────────────────────────────────────────────────────────────────
function wire() {
  root.querySelectorAll('[data-field]').forEach((el) => {
    const key = el.dataset.field;
    const evt = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const before = state.form[key];
      state.form[key] = el.type === 'checkbox' ? el.checked : el.value;
      // Re-render only when a change toggles conditional fields (applyingAs).
      if (key === 'applyingAs' && before !== state.form[key]) render();
    });
  });
  root.querySelectorAll('[data-check]').forEach((el) => {
    el.addEventListener('change', () => {
      const key = el.dataset.check, val = el.value;
      const list = state.form[key] || [];
      state.form[key] = el.checked ? [...list, val] : list.filter((v) => v !== val);
    });
  });
  root.querySelectorAll('[data-upload]').forEach((el) => {
    el.addEventListener('change', () => {
      const file = el.files && el.files[0];
      if (file) handleUpload(el.dataset.upload, file);
    });
  });
  // Financial proposal step: update the visible total on keystroke without a
  // full re-render (a full render() on every keystroke would drop focus/caret
  // position, which is why plain text inputs above don't re-render either).
  root.querySelectorAll('[data-cost]').forEach((el) => {
    el.addEventListener('input', () => {
      const totalEl = root.querySelector('[data-cost-total]');
      if (totalEl) totalEl.textContent = `KES ${fmtMoney(costTotal())}`;
    });
  });
  const back = root.querySelector('[data-back]');
  if (back) back.addEventListener('click', () => { state.step--; render(); scrollTop(); });
  const next = root.querySelector('[data-next]');
  if (next) next.addEventListener('click', () => {
    const err = validateStep();
    if (err) { showError(err); return; }
    state.step++; render(); scrollTop();
  });
  const form = root.querySelector('[data-form]');
  if (form) form.addEventListener('submit', onSubmit);
}

function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

async function handleUpload(key, file) {
  if (file.size > 10 * 1024 * 1024) {
    state.uploads[key] = { url: '', name: file.name, loading: false, error: 'File exceeds 10 MB limit.' };
    render(); return;
  }
  state.uploads[key] = { url: '', name: file.name, loading: true, error: null };
  render();
  try {
    // Custom-form variants (e.g. esd-storytelling) upload to this project's
    // own VPS service, which keeps documents private; standard/supplier
    // uploads keep using the existing legacy backend, unchanged.
    const api = state.variant === 'esd-storytelling' ? applicationsAPI : applyAPI;
    const data = await api.upload(file);
    state.uploads[key] = { url: data.url, name: file.name, loading: false, error: null };
  } catch (err) {
    state.uploads[key] = { url: '', name: file.name, loading: false, error: err.message || 'Upload failed.' };
  }
  render();
}

async function onSubmit(e) {
  e.preventDefault();
  const err = validateStep();
  if (err) { showError(err); return; }
  state.submitting = true; render();
  try {
    let res;
    if (state.variant === 'esd-storytelling') {
      res = await applicationsAPI.submit({
        opportunity: { id: state.opp.id, title: state.opp.title, slug: state.opp.slug, type: state.opp.type },
        variant: state.variant,
        fields: { ...state.form, totalCostKES: costTotal() },
        uploads: state.uploads,
      });
    } else {
      res = await applyAPI.submit({
        opportunity: { id: state.opp.id, title: state.opp.title, slug: state.opp.slug },
        fields: state.form,
        uploads: state.uploads,
        isSupplier: state.variant === 'supplier',
      });
    }
    if (!res || !res.success) throw new Error((res && res.message) || 'Submission failed.');
    renderSuccess();
    scrollTop();
  } catch (err) {
    state.submitting = false; render();
    showError(err.message || 'An error occurred. Please try again.');
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  root = document.querySelector('[data-apply-root]');
  if (!root) return;
  const slug = new URLSearchParams(location.search).get('slug');
  if (!slug) { root.innerHTML = notFound(); return; }
  try {
    const res = await opportunitiesAPI.getBySlug(slug);
    const opp = res && res.data;
    if (!opp) { root.innerHTML = notFound(); return; }
    state.opp = opp;
    // Variant is auto-detected from the opportunity's slug/title, same as the
    // original supplier-vs-standard split — no per-opportunity config needed
    // in the CMS. Add more `else if` keyword checks here as future
    // consultancies need their own custom form.
    const hay = `${opp.slug || ''} ${opp.title || ''}`.toLowerCase();
    if (hay.includes('prequalification') || hay.includes('supplier')) {
      state.variant = 'supplier';
    } else if (hay.includes('storytelling') && (hay.includes('esd') || hay.includes('climate') || hay.includes('podcast'))) {
      state.variant = 'esd-storytelling';
    } else {
      state.variant = 'standard';
    }
    document.title = `Apply — ${opp.title} — AFOSI`;
    render();
  } catch (err) {
    console.error('[Apply] load:', err);
    root.innerHTML = notFound();
  }
})();

function notFound() {
  return (
    `<section data-section style="max-width:1320px;margin:0 auto;padding:120px 40px;text-align:center;">
       <h1 style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:clamp(34px,5vw,60px);margin:0 0 16px;">Opportunity not found</h1>
       <p style="font-size:17px;color:#5A5346;max-width:520px;margin:0 auto 28px;">This opportunity may no longer be active.</p>
       <a href="/opportunities.html" class="hov-ink" style="display:inline-block;background:#F26522;color:#141210;padding:15px 30px;font-weight:700;">← Back to Opportunities</a>
     </section>`
  );
}
