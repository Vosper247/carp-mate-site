// Run: node --test tests/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appLink, confirmHereLink, platformOf, view } from '../auth/link.js';

const PAGE = 'https://carpmateapp.com/auth/';
const confirm = `${PAGE}#type=email&token_hash=HASH1`;
const reset = `${PAGE}#type=recovery&token_hash=HASH2`;
const labels = (v) => v.actions.map((a) => `${a.primary ? '*' : ''}${a.label}`);

test('reads the platform from the user agent', () => {
  assert.equal(platformOf('Mozilla/5.0 (Linux; Android 15; Pixel 8)'), 'android');
  assert.equal(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)'), 'ios');
  assert.equal(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)'), 'computer');
});

test('a confirm link on a phone opens the app, with confirming here as the way round', () => {
  const v = view(confirm, 'android');
  assert.equal(v.title, 'Confirm your email');
  assert.deepEqual(labels(v), ['*Open Carp Mate', 'Confirm my email here']);
  assert.match(v.actions[0].href, /^intent:\/\/auth-callback\?token_hash=HASH1&type=email#Intent;scheme=fishingweatherapp;package=com\.vosper247\.fishingweatherapp;/);
  assert.equal(view(confirm, 'ios').actions[0].href, 'fishingweatherapp://auth-callback?token_hash=HASH1&type=email');
});

test('a confirm link on a computer confirms here and says to sign in on the phone', () => {
  const v = view(confirm, 'computer');
  assert.deepEqual(labels(v), ['*Confirm my email here']);
  assert.match(v.lead, /open Carp Mate on your phone and sign in/);
  assert.equal(
    v.actions[0].href,
    'https://spnsjzjfqbxhqfggctfy.supabase.co/auth/v1/verify?token=HASH1&type=email&redirect_to=' +
      encodeURIComponent(`${PAGE}?done=email`)
  );
});

test('Android without the app comes back here and is told so', () => {
  const fallback = decodeURIComponent(/S\.browser_fallback_url=([^;]+)/.exec(appLink('email', 'HASH1', 'android'))[1]);
  assert.equal(fallback, `${PAGE}?noapp=1#type=email&token_hash=HASH1`);
  const v = view(fallback, 'android');
  assert.equal(v.state, 'no-app');
  assert.deepEqual(labels(v), ['*Confirm my email here']);
});

test('after confirming here: says so, and wipes the session from the address', () => {
  const v = view(`${PAGE}?done=email#access_token=SECRET&refresh_token=R&type=signup`, 'computer');
  assert.equal(v.title, 'Your email is confirmed');
  assert.equal(v.lead, 'Open Carp Mate on your phone and sign in with your email and password.');
  assert.equal(v.scrub, true);
  assert.equal(JSON.stringify(v).includes('SECRET'), false);
});

test('a used or expired link says what to do next', () => {
  const v = view(`${PAGE}?done=email#error=access_denied&error_code=otp_expired&error_description=x`, 'android');
  assert.equal(v.title, 'That link has expired');
  assert.match(v.lead, /open Carp Mate and sign in/);
  assert.match(v.lead, /send a fresh link/);
});

test('a reset link on a phone opens the app', () => {
  const v = view(reset, 'ios');
  assert.deepEqual(labels(v), ['*Open Carp Mate']);
  assert.equal(v.actions[0].href, 'fishingweatherapp://reset-password?token_hash=HASH2&type=recovery');
  assert.match(v.note, /Open this email on the phone that has it/);
});

test('a reset link on a computer never dead-ends: it says where to open it', () => {
  const v = view(reset, 'computer');
  assert.equal(v.actions.length, 0);
  assert.match(v.lead, /Open this email on the phone with Carp Mate and tap the button there/);
  assert.match(v.note, /keeps working until it’s used or it expires/);
  assert.match(v.note, /Forgotten your password\?/);
});

test('without a token it explains where the page comes from', () => {
  assert.equal(view(PAGE, 'computer').state, 'empty');
  assert.equal(view(`${PAGE}#type=other&token_hash=X`, 'android').state, 'empty');
});

test('the token never goes to a server: it rides in the fragment', () => {
  for (const kind of ['email', 'recovery']) {
    const fallback = decodeURIComponent(/S\.browser_fallback_url=([^;]+)/.exec(appLink(kind, 'H', 'android'))[1]);
    assert.equal(new URL(fallback).search, '?noapp=1');
  }
  assert.ok(!confirmHereLink('H').startsWith(PAGE));
});

test('sent here as the Site URL: a confirmation is still recognised, and any session wiped', () => {
  const v = view(`${PAGE}#access_token=SECRET&refresh_token=R&type=signup`, 'computer');
  assert.equal(v.title, 'Your email is confirmed');
  assert.equal(v.scrub, true);
  const other = view(`${PAGE}#access_token=SECRET&type=magiclink`, 'computer');
  assert.equal(other.scrub, true);
  assert.equal(JSON.stringify(other).includes('SECRET'), false);
  assert.equal(view(`${PAGE}#error=access_denied&error_code=otp_expired`, 'android').title, 'That link has expired');
});
