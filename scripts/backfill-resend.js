#!/usr/bin/env node
/**
 * Backfill email_log from the Resend API (historical emails, ~last 30 days).
 *
 * Resend only retains emails for a limited window, so this pulls what's still
 * there into our permanent email_log (with rendered HTML for preview).
 *
 * Requires a READ-enabled Resend API key — the app's normal RESEND_API_KEY is
 * send-only. Create a Full Access key in the Resend dashboard and set it as
 * RESEND_READ_API_KEY.
 *
 * Usage:
 *   node scripts/backfill-resend.js                 # dry run, last 35 days
 *   node scripts/backfill-resend.js --days 30       # dry run, last 30 days
 *   node scripts/backfill-resend.js --apply         # actually write rows
 *   node scripts/backfill-resend.js --days 30 --apply
 */

require('dotenv').config();
const { getSupabaseClient } = require('../lib/supabase');

const READ_KEY = process.env.RESEND_READ_API_KEY || process.env.RESEND_API_KEY;
const API = 'https://api.resend.com';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const APPLY = process.argv.includes('--apply');
const DAYS = parseInt(arg('days', '35'), 10) || 35;
const CUTOFF = Date.now() - DAYS * 24 * 60 * 60 * 1000;

function classify(subject) {
  const s = (subject || '').toLowerCase();
  if (s.includes('gift card')) {
    return { type: 'gift_card', role: s.includes('received a') ? 'recipient' : 'purchaser' };
  }
  if (s.includes('workshop details')) return { type: 'workshop', role: null };
  if (s.includes('retreat details')) return { type: 'retreat', role: null };
  return null;
}

function amountCentsFromSubject(subject) {
  const m = /\$([0-9]+(?:\.[0-9]{2})?)/.exec(subject || '');
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}

function giftCodeFromHtml(html) {
  const m = /KAC-[A-Z0-9-]{4,}/.exec(html || '');
  return m ? m[0] : null;
}

async function resendGet(path) {
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + READ_KEY } });
  if (r.status === 429) {
    await new Promise((res) => setTimeout(res, 1500));
    return resendGet(path);
  }
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function listPage(after) {
  const qs = new URLSearchParams({ limit: '100' });
  if (after) qs.set('after', after);
  const { status, body } = await resendGet('/emails?' + qs.toString());
  if (status !== 200) {
    throw new Error(`List failed (${status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  const items = Array.isArray(body) ? body : (Array.isArray(body.data) ? body.data : (body.data && body.data.data) || []);
  return items;
}

async function main() {
  if (!READ_KEY) {
    console.error('❌ No Resend key available.');
    console.error('   Set RESEND_READ_API_KEY (Full Access), or ensure RESEND_API_KEY has read access.');
    process.exit(1);
  }

  console.log(`\n📥 Resend backfill — ${APPLY ? 'APPLY' : 'DRY RUN'}, last ${DAYS} days (since ${new Date(CUTOFF).toISOString()})\n`);

  const supabase = getSupabaseClient();
  const collected = [];
  let after = null;
  let pages = 0;
  let reachedCutoff = false;

  while (!reachedCutoff) {
    const items = await listPage(after);
    if (!items.length) break;
    pages++;
    for (const it of items) {
      const created = new Date(it.created_at).getTime();
      if (created < CUTOFF) { reachedCutoff = true; break; }
      collected.push(it);
    }
    if (items.length < 100) break;
    after = items[items.length - 1].id;
    if (pages > 50) { console.warn('Stopping after 50 pages (safety cap).'); break; }
  }

  console.log(`Scanned ${pages} page(s), ${collected.length} email(s) in window.\n`);

  const stats = { imported: 0, updated: 0, skippedExisting: 0, skippedType: 0, failed: 0 };
  const samples = [];

  for (const it of collected) {
    const subject = it.subject || '';
    const cls = classify(subject);
    if (!cls) { stats.skippedType++; continue; }

    const to = Array.isArray(it.to) ? it.to[0] : it.to;
    const createdAtIso = new Date(it.created_at).toISOString();

    // Already imported by message id?
    const { data: existingById } = await supabase
      .from('email_log').select('id').eq('resend_message_id', it.id).maybeSingle();
    if (existingById) { stats.skippedExisting++; continue; }

    // Match an existing DB-backfilled row (no message id) to upgrade it.
    const windowLo = new Date(new Date(it.created_at).getTime() - 90000).toISOString();
    const windowHi = new Date(new Date(it.created_at).getTime() + 90000).toISOString();
    const { data: near } = await supabase
      .from('email_log').select('id')
      .eq('email_type', cls.type).eq('to_email', to)
      .is('resend_message_id', null)
      .gte('created_at', windowLo).lte('created_at', windowHi)
      .limit(1).maybeSingle();

    if (samples.length < 8) {
      samples.push(`${createdAtIso}  ${cls.type.padEnd(9)}  ${to}  ${near ? '(upgrade)' : '(new)'}  ${subject.slice(0, 50)}`);
    }

    if (!APPLY) {
      if (near) stats.updated++; else stats.imported++;
      continue;
    }

    // Fetch full email for html.
    let html = null;
    let lastEvent = it.last_event || null;
    try {
      const { status, body } = await resendGet('/emails/' + it.id);
      if (status === 200) {
        html = body.html || null;
        lastEvent = body.last_event || lastEvent;
      }
    } catch (e) {
      console.warn('  retrieve failed for', it.id, e.message);
    }
    await new Promise((res) => setTimeout(res, 250)); // gentle throttle

    const amountCents = cls.type === 'gift_card' ? amountCentsFromSubject(subject) : null;
    const payload = { source: 'resend_backfill' };
    if (cls.type === 'gift_card') {
      const code = giftCodeFromHtml(html);
      if (code) payload.code = code;
      if (amountCents) payload.amountCents = amountCents;
      payload.isRecipient = cls.role === 'recipient';
    }

    try {
      if (near) {
        await supabase.from('email_log')
          .update({ resend_message_id: it.id, html, last_event: lastEvent })
          .eq('id', near.id);
        stats.updated++;
      } else {
        await supabase.from('email_log').insert({
          email_type: cls.type,
          to_email: to,
          recipient_role: cls.role,
          subject,
          status: 'sent',
          resend_message_id: it.id,
          amount_cents: amountCents,
          html,
          last_event: lastEvent,
          payload,
          created_at: createdAtIso
        });
        stats.imported++;
      }
    } catch (e) {
      console.warn('  write failed for', it.id, e.message);
      stats.failed++;
    }
  }

  console.log('Sample of matched emails:');
  samples.forEach((s) => console.log('  ' + s));
  console.log('\nSummary:');
  console.log(`  ${APPLY ? 'Inserted' : 'Would insert'}:  ${stats.imported}`);
  console.log(`  ${APPLY ? 'Upgraded' : 'Would upgrade'}:  ${stats.updated} (existing rows enriched with html/message id)`);
  console.log(`  Skipped (already imported): ${stats.skippedExisting}`);
  console.log(`  Skipped (not a KAC email):  ${stats.skippedType}`);
  if (stats.failed) console.log(`  Failed writes: ${stats.failed}`);
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write these rows.');
  console.log('');
}

main().catch((e) => { console.error('\n❌ Error:', e.message); process.exit(1); });
