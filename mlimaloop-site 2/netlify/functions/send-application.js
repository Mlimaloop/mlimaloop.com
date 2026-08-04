// MlimaLoop investor application, email function (Netlify Functions, Node 18+)
// Emails the investor a confirmation with the bank details for their chosen currency,
// and emails MlimaLoop the application data + the signed PDF.
// Requires env vars: RESEND_API_KEY  (and optionally MAIL_FROM, ADMIN_EMAIL)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.MAIL_FROM || 'MlimaLoop <invest@mlimaloop.com>';
  const ADMIN = process.env.ADMIN_EMAIL || 'graham@mlimaloop.com';
  if (!KEY) return { statusCode: 500, body: 'Email not configured' };

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: 'Bad request' }; }

  // exact IBANs (Vitpi - FZCO, WIO Bank, Abu Dhabi, UAE)
  const BANKS = {
    USD: 'AE790860000009798301552',
    EUR: 'AE350860000009331143651',
    GBP: 'AE360860000009735218182',
    AED: 'AE650860000009651278710'
  };
  const cur = String(d.currency || '').toUpperCase();
  const iban = BANKS[cur];
  const ref = d.fullname || 'your name';

  const bankHtml = iban ? `
    <table style="border-collapse:collapse;font-size:14px;color:#1A1C1B;margin-top:6px">
      <tr><td style="padding:4px 16px 4px 0;color:#6b6b6b">Account holder</td><td style="padding:4px 0"><b>VITPI - FZCO</b></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b6b6b">Bank</td><td style="padding:4px 0">WIO Bank, Etihad Airways Centre, 5th Floor, Abu Dhabi, UAE</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b6b6b">IBAN (${cur})</td><td style="padding:4px 0"><b>${iban}</b></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b6b6b">BIC / SWIFT</td><td style="padding:4px 0">WIOBAEADXXX</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#6b6b6b">Payment reference</td><td style="padding:4px 0"><b>${esc(ref)}</b></td></tr>
    </table>`
    : `<p>We'll send you account details for your currency shortly. Please contact ${ADMIN}.</p>`;

  const investorHtml = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1A1C1B;max-width:580px">
    <div style="background:#2C0A05;color:#F6EFE8;padding:16px 20px;font-weight:bold;letter-spacing:.04em">MLIMALOOP &nbsp;·&nbsp; Investment confirmation</div>
    <div style="padding:20px">
      <p>Dear ${esc(d.fullname || 'Investor')},</p>
      <p>Thank you for your application to invest in the MlimaLoop private placement (Secured Convertible Placement Notes, issued by Vitpi - FZCO). We have received your signed application for <b>${esc(d.amount)} ${esc(cur)}</b>.</p>
      <p style="font-weight:bold;color:#4E1710;margin:18px 0 2px">Transfer your funds to</p>
      ${bankHtml}
      <p style="margin-top:18px"><b>To complete your subscription:</b></p>
      <ol style="padding-left:18px;margin:0">
        <li style="margin-bottom:6px">Send a copy of your passport and a proof of address (dated within 3 months) on WhatsApp <b>+971 528166070</b> or reply to this email.</li>
        <li>Transfer your investment to the account above, using <b>your name</b> as the payment reference.</li>
      </ol>
      <p style="font-size:13px;color:#6b6b6b;margin-top:16px"><b>Security:</b> these bank details will not change. If you ever receive a message asking you to send funds to a different account, do not act on it, contact us first to verify.</p>
      <p style="font-size:11px;color:#8a8a86;margin-top:18px">Issued by Vitpi - FZCO (reg. 36120), the MlimaLoop group holding company, in reliance on the high-net-worth and self-certified sophisticated investor exemptions under the Financial Promotion Order. This investment carries a degree of risk and you may not get back the amount invested. This is not advice.</p>
    </div>
  </div>`;

  const adminHtml = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1A1C1B">
    <h2 style="color:#4E1710">New investor application</h2>
    <ul style="line-height:1.7">
      <li><b>Name:</b> ${esc(d.fullname)}</li>
      <li><b>Amount:</b> ${esc(d.amount)} ${esc(cur)}</li>
      <li><b>Email:</b> ${esc(d.email)} &nbsp; <b>Phone:</b> ${esc(d.phone)}</li>
      <li><b>DOB:</b> ${esc(d.dob)} &nbsp; <b>Nationality:</b> ${esc(d.nationality)} &nbsp; <b>Residence:</b> ${esc(d.country)}</li>
      <li><b>Address:</b> ${esc(d.address)}</li>
      <li><b>Eligibility:</b> ${esc(d.eligibility)} ${d.soph_cond ? '(' + esc(d.soph_cond) + ')' : ''}</li>
      <li><b>Return-payment bank:</b> ${esc(d.bank_name)} / ${esc(d.bank)} / ${esc(d.iban)} / ${esc(d.swift)}</li>
      <li><b>Signed:</b> ${esc(d.signname)} on ${esc(d.signdate)}</li>
    </ul>
    <p>Signed application PDF is attached. Await the passport and proof of address (WhatsApp/email) and verify identity before proceeding.</p>
  </div>`;

  const attachments = [];
  if (d.pdf && d.pdf.indexOf('base64,') > -1) {
    attachments.push({ filename: 'MlimaLoop_Subscription_' + safe(d.fullname) + '.pdf', content: d.pdf.split('base64,')[1] });
  }

  try {
    if (d.email) {
      await send(KEY, { from: FROM, to: [d.email], subject: 'Your MlimaLoop investment, payment details (' + cur + ')', html: investorHtml });
    }
    await send(KEY, { from: FROM, to: [ADMIN], reply_to: d.email || undefined, subject: 'New application, ' + (d.fullname || '') + ' (' + (d.amount || '') + ' ' + cur + ')', html: adminHtml, attachments });
  } catch (e) {
    return { statusCode: 502, body: 'Email send failed' };
  }
  return { statusCode: 200, body: 'ok' };
};

async function send(KEY, body) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()));
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function safe(s) { return String(s || 'application').replace(/[^a-z0-9]/gi, '_'); }
