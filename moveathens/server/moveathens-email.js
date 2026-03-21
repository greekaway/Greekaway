/**
 * MoveAthens Email Service
 * Handles all email sending for the MoveAthens transfer system:
 * - Hotel submits transfer request via email (auto-notification to admin + auto-reply to hotel)
 * - Admin replies to hotel via email (ack, driver found, driver not found)
 */
'use strict';

let nodemailer;
try { nodemailer = require('nodemailer'); } catch (_) { /* optional */ }

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTransport() {
  if (!nodemailer) return null;
  const host = process.env.MAIL_HOST;
  if (!host) return null;
  const port = parseInt(process.env.MAIL_PORT || '587', 10);
  const auth = (process.env.MAIL_USER && process.env.MAIL_PASS)
    ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    : null;
  const secure = port === 465;
  return nodemailer.createTransport({ host, port, secure, auth });
}

function getFrom() {
  return process.env.MAIL_FROM || process.env.MAIL_USER || 'info@moveathens.com';
}

function grGreeting() {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens', hour: 'numeric', hour12: false }), 10);
  return h < 12 ? 'Καλημέρα' : 'Καλησπέρα';
}

/**
 * Build formatted route summary (reused across templates)
 */
function buildRouteSummary(request) {
  const isArrival = request.is_arrival;
  const lines = [];

  if (isArrival) {
    lines.push(`✈️ Άφιξη: ${request.destination_name || '—'}`);
    lines.push(`🏨 Προορισμός: ${request.hotel_name || '—'}`);
  } else {
    lines.push(`🏨 Ξενοδοχείο: ${request.hotel_name || '—'}`);
    lines.push(`🎯 Προορισμός: ${request.destination_name || '—'}`);
  }

  if (request.scheduled_date) {
    const dayNames = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
    const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    const dt = new Date(`${request.scheduled_date}T${request.scheduled_time || '00:00'}`);
    const hh = parseInt((request.scheduled_time || '00:00').split(':')[0], 10);
    const mm = (request.scheduled_time || '00:00').split(':')[1];
    const suffix = hh < 12 ? 'πμ' : 'μμ';
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    lines.push(`📅 ${dayNames[dt.getDay()]} ${dt.getDate()} ${monthNames[dt.getMonth()]}, ώρα ${h12}:${mm} ${suffix}`);
  } else if (request.booking_type === 'instant') {
    lines.push('⚡ Άμεσα');
  }

  if (request.vehicle_name) lines.push(`🚗 Όχημα: ${request.vehicle_name}`);
  if (request.passenger_name) lines.push(`👤 Επιβάτης: ${request.passenger_name}`);
  if (request.flight_number) {
    let fl = `🛫 Πτήση: ${request.flight_number}`;
    if (request.flight_airline) fl += ` (${request.flight_airline})`;
    lines.push(fl);
    if (request.flight_origin) lines.push(`📍 Από: ${request.flight_origin}`);
    if (request.flight_eta) {
      const etaT = new Date(request.flight_eta).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
      lines.push(`⏱️ ETA: ${etaT}`);
    }
  }
  if (request.room_number) lines.push(`🚪 Δωμάτιο: ${request.room_number}`);
  if (request.notes) lines.push(`📝 Σημειώσεις: ${request.notes}`);
  if (request.price) lines.push(`💰 Τιμή: €${parseFloat(request.price).toFixed(0)}`);

  return lines;
}

/**
 * Common HTML email wrapper
 */
function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="el">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <tr><td style="background:linear-gradient(135deg,#0b0f1a 0%,#1c2438 100%);padding:24px 32px;text-align:center">
    <h1 style="margin:0;color:#46d3ff;font-size:22px;font-weight:700">MoveAthens</h1>
  </td></tr>
  <tr><td style="padding:32px">${bodyHtml}</td></tr>
  <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:12px;color:#94a3b8">MoveAthens — Premium Transfer Service</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Send auto-reply to hotel: "We received your request"
 */
async function sendHotelAckEmail(hotelEmail, request) {
  const transporter = buildTransport();
  if (!transporter || !hotelEmail) return 'skipped';

  const greeting = grGreeting();
  const summary = buildRouteSummary(request);

  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e">${greeting}! Λάβαμε το αίτημά σας</h2>
    <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 20px">
      Το αίτημά σας καταχωρήθηκε επιτυχώς. Θα σας ενημερώσουμε σύντομα για τον οδηγό.
    </p>
    <div style="background:#f0fdf4;border-left:4px solid #10b981;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      ${summary.map(l => `<p style="margin:4px 0;font-size:14px;color:#1f2937">${escapeHtml(l)}</p>`).join('')}
    </div>
    <p style="color:#6b7280;font-size:13px;margin:0">Ευχαριστούμε για την εμπιστοσύνη σας! 🙏</p>
  `;

  const html = wrapHtml('Λάβαμε το αίτημά σας — MoveAthens', bodyHtml);
  const text = `${greeting}! Λάβαμε το αίτημά σας.\n\n${summary.join('\n')}\n\nΘα σας ενημερώσουμε σύντομα! 🙏`;

  try {
    await transporter.sendMail({
      from: `MoveAthens <${getFrom()}>`,
      to: hotelEmail,
      subject: `✅ Λάβαμε το αίτημά σας — MoveAthens`,
      text,
      html
    });
    console.log('[ma-email] ACK email sent to', hotelEmail);
    return 'sent';
  } catch (e) {
    console.error('[ma-email] ACK email failed:', e.message);
    return 'error';
  }
}

/**
 * Send notification to admin: "New transfer request via email"
 */
async function sendAdminNotificationEmail(request) {
  const transporter = buildTransport();
  if (!transporter) return 'skipped';

  const adminEmail = getFrom(); // send to ourselves
  const summary = buildRouteSummary(request);

  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e">📧 Νέο αίτημα Transfer (μέσω Email)</h2>
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      ${summary.map(l => `<p style="margin:4px 0;font-size:14px;color:#1f2937">${escapeHtml(l)}</p>`).join('')}
    </div>
    <p style="color:#6b7280;font-size:13px;margin:0">
      Αίτημα από: <b>${escapeHtml(request.hotel_name || '—')}</b> (${escapeHtml(request.orderer_phone || '—')})<br>
      Email: <b>${escapeHtml(request.hotel_email || '—')}</b>
    </p>
  `;

  const html = wrapHtml('Νέο αίτημα Transfer — MoveAthens', bodyHtml);
  const text = `Νέο αίτημα Transfer (μέσω Email)\n\n${summary.join('\n')}\n\nΞενοδοχείο: ${request.hotel_name || '—'}\nEmail: ${request.hotel_email || '—'}`;

  try {
    await transporter.sendMail({
      from: `MoveAthens <${getFrom()}>`,
      to: adminEmail,
      subject: `📧 Νέο αίτημα: ${request.hotel_name || '—'} → ${request.destination_name || '—'}`,
      text,
      html
    });
    console.log('[ma-email] Admin notification sent');
    return 'sent';
  } catch (e) {
    console.error('[ma-email] Admin notification failed:', e.message);
    return 'error';
  }
}

/**
 * Admin reply: "We found a driver — arriving in X minutes"
 */
async function sendDriverFoundEmail(hotelEmail, request, etaMinutes) {
  const transporter = buildTransport();
  if (!transporter || !hotelEmail) return 'skipped';

  const greeting = grGreeting();
  const route = request.is_arrival
    ? `${request.destination_name || '—'} → ${request.hotel_name || '—'}`
    : `${request.hotel_name || '—'} → ${request.destination_name || '—'}`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e">${greeting}! Βρήκαμε οδηγό 🚗</h2>
    <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 20px">
      Βρήκαμε οδηγό για τη διαδρομή σας.
    </p>
    <div style="background:#f0fdf4;border-left:4px solid #10b981;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="margin:4px 0;font-size:14px;color:#1f2937">🚗 Διαδρομή: ${escapeHtml(route)}</p>
      <p style="margin:4px 0;font-size:16px;color:#059669;font-weight:700">🕐 Θα είναι εκεί σε ${etaMinutes} λεπτ${etaMinutes === 1 ? 'ό' : 'ά'}!</p>
    </div>
    <p style="color:#6b7280;font-size:13px;margin:0">Ευχαριστούμε! 🙏</p>
  `;

  const html = wrapHtml('Βρήκαμε οδηγό — MoveAthens', bodyHtml);
  const text = `${greeting}! Βρήκαμε οδηγό για ${route}.\n\n🕐 Θα είναι εκεί σε ${etaMinutes} λεπτά!\n\nΕυχαριστούμε! 🙏`;

  try {
    await transporter.sendMail({
      from: `MoveAthens <${getFrom()}>`,
      to: hotelEmail,
      subject: `🚗 Βρήκαμε οδηγό — MoveAthens`,
      text,
      html
    });
    console.log('[ma-email] Driver-found email sent to', hotelEmail);
    return 'sent';
  } catch (e) {
    console.error('[ma-email] Driver-found email failed:', e.message);
    return 'error';
  }
}

/**
 * Admin reply: "We couldn't find a driver"
 */
async function sendNoDriverEmail(hotelEmail, request) {
  const transporter = buildTransport();
  if (!transporter || !hotelEmail) return 'skipped';

  const greeting = grGreeting();
  const route = request.is_arrival
    ? `${request.destination_name || '—'} → ${request.hotel_name || '—'}`
    : `${request.hotel_name || '—'} → ${request.destination_name || '—'}`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e">${greeting}!</h2>
    <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 20px">
      Ζητούμε συγνώμη, δυστυχώς δεν καταφέραμε να βρούμε διαθέσιμο οδηγό για τη διαδρομή:
    </p>
    <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;padding:16px 20px;margin:0 0 20px">
      <p style="margin:4px 0;font-size:14px;color:#1f2937">🚗 ${escapeHtml(route)}</p>
      ${request.passenger_name ? `<p style="margin:4px 0;font-size:14px;color:#1f2937">👤 Επιβάτης: ${escapeHtml(request.passenger_name)}</p>` : ''}
      ${request.flight_number ? `<p style="margin:4px 0;font-size:14px;color:#1f2937">🛫 Πτήση: ${escapeHtml(request.flight_number)}</p>` : ''}
    </div>
    <p style="color:#4b5563;font-size:14px;margin:0 0 8px">
      Παρακαλούμε επικοινωνήστε μαζί μας αν χρειάζεστε εναλλακτική λύση.
    </p>
    <p style="color:#6b7280;font-size:13px;margin:0">Ευχαριστούμε για την κατανόηση! 🙏</p>
  `;

  const html = wrapHtml('Δεν βρέθηκε οδηγός — MoveAthens', bodyHtml);
  const text = `${greeting}!\n\nΖητούμε συγνώμη, δεν βρήκαμε οδηγό για: ${route}\n\nΠαρακαλούμε επικοινωνήστε μαζί μας αν χρειάζεστε εναλλακτική λύση.\n\nΕυχαριστούμε! 🙏`;

  try {
    await transporter.sendMail({
      from: `MoveAthens <${getFrom()}>`,
      to: hotelEmail,
      subject: `🚫 Δεν βρέθηκε οδηγός — MoveAthens`,
      text,
      html
    });
    console.log('[ma-email] No-driver email sent to', hotelEmail);
    return 'sent';
  } catch (e) {
    console.error('[ma-email] No-driver email failed:', e.message);
    return 'error';
  }
}

module.exports = {
  sendHotelAckEmail,
  sendAdminNotificationEmail,
  sendDriverFoundEmail,
  sendNoDriverEmail,
  buildTransport
};
