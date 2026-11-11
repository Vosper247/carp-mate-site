/**
 * Where the buttons in Carp Mate's account emails land.
 *
 * The email carries a one-time token in this page's #fragment, which never
 * reaches a server. Nothing is used up by loading the page, so a mail scanner
 * that opens the link first spoils nothing; only a tap does.
 *
 * - On a phone, "Open Carp Mate" hands the token to the app, which signs in on
 *   whichever phone opens it: the phone that asked for the link no longer
 *   matters.
 * - Anywhere, a sign-up can be confirmed here instead; the page then says to
 *   sign in on the phone.
 * - A password can only be changed in the app, so a reset opened on a
 *   computer says where to open it. The link still works there afterwards.
 *
 * view() is pure, so it is tested without a browser (tests/auth-link.test.mjs).
 */

export const SUPABASE_URL = 'https://spnsjzjfqbxhqfggctfy.supabase.co';
export const PAGE_URL = 'https://carpmateapp.com/auth/';
const SCHEME = 'fishingweatherapp';
const ANDROID_PACKAGE = 'com.vosper247.fishingweatherapp';

/** The two kinds of link the emails send, keyed by Supabase's token type. */
const KINDS = {
  email: { route: 'auth-callback' },
  recovery: { route: 'reset-password' },
};

function paramsOf(part) {
  return new URLSearchParams(part ? part.replace(/^[?#]/, '') : '');
}

/** Which phone family the page is on, from the user agent. */
export function platformOf(userAgent) {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'computer';
}

/** The link that opens the app with this token. */
export function appLink(type, tokenHash, platform) {
  const route = KINDS[type].route;
  const query = `token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
  if (platform !== 'android') return `${SCHEME}://${route}?${query}`;
  // Android's own form: when the app isn't installed, Chrome comes back here
  // and the page says so, instead of doing nothing.
  const fallback = `${PAGE_URL}?noapp=1#type=${type}&token_hash=${encodeURIComponent(tokenHash)}`;
  return (
    `intent://${route}?${query}#Intent;scheme=${SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
  );
}

/** Confirms a sign-up in the browser; Supabase then sends the browser back here. */
export function confirmHereLink(tokenHash) {
  const back = `${PAGE_URL}?done=email`;
  return (
    `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}` +
    `&type=email&redirect_to=${encodeURIComponent(back)}`
  );
}

const EXPIRED = {
  state: 'expired',
  title: 'That link has expired',
  lead:
    'Each link works once, and only for a while. If you’ve already confirmed your email, open Carp Mate and sign in. If not, try signing in: the app offers to send a fresh link.',
  actions: [],
};

/**
 * What the page shows for its own address. `scrub` is true when the address
 * holds a session Supabase handed back, which the page must wipe at once.
 */
export function view(href, platform) {
  const url = new URL(href);
  const query = paramsOf(url.search);
  const fragment = paramsOf(url.hash);
  const get = (k) => fragment.get(k) ?? query.get(k);

  // Back from Supabase after "Confirm my email here".
  if (query.get('done') === 'email') {
    const error = get('error_code') ?? get('error');
    if (error) return { ...EXPIRED, scrub: true };
    if (fragment.get('access_token')) {
      return {
        state: 'confirmed',
        title: 'Your email is confirmed',
        lead: 'Open Carp Mate on your phone and sign in with your email and password.',
        actions: [],
        scrub: true,
      };
    }
  }

  const type = fragment.get('type');
  const tokenHash = fragment.get('token_hash');
  if (!KINDS[type] || !tokenHash) {
    return {
      state: 'empty',
      title: 'Nothing to do here',
      lead: 'This page opens from the button in a Carp Mate email.',
      actions: [],
      scrub: false,
    };
  }

  const onPhone = platform !== 'computer';
  const noApp = query.get('noapp') === '1';
  const open = { label: 'Open Carp Mate', href: appLink(type, tokenHash, platform), primary: true };

  if (type === 'email') {
    const here = { label: 'Confirm my email here', href: confirmHereLink(tokenHash), primary: !onPhone || noApp };
    if (onPhone && !noApp) {
      return {
        state: 'open',
        title: 'Confirm your email',
        lead: 'Tap below and Carp Mate opens, signed in.',
        actions: [open, { ...here, primary: false }],
        note: 'No Carp Mate on this phone? Confirm here, then sign in on the phone that has it.',
        scrub: false,
      };
    }
    return {
      state: noApp ? 'no-app' : 'open',
      title: 'Confirm your email',
      lead: noApp
        ? 'Carp Mate isn’t on this phone. Confirm your email here, then sign in on the phone that has it.'
        : 'Confirm here, then open Carp Mate on your phone and sign in.',
      actions: [here],
      scrub: false,
    };
  }

  // A password reset.
  if (onPhone && !noApp) {
    return {
      state: 'open',
      title: 'Choose a new password',
      lead: 'Tap below and Carp Mate opens, ready for a new password.',
      actions: [open],
      note: 'Nothing happened? Carp Mate isn’t on this phone. Open this email on the phone that has it and tap the button there.',
      scrub: false,
    };
  }
  return {
    state: noApp ? 'no-app' : 'open',
    title: 'Choose a new password',
    lead: noApp
      ? 'Carp Mate isn’t on this phone. Open this email on the phone that has it and tap the button there.'
      : 'Passwords are changed in the app. Open this email on the phone with Carp Mate and tap the button there.',
    actions: [],
    note: 'This link keeps working until it’s used or it expires. If it has expired, ask the app for a new one: Sign in → Forgotten your password?',
    scrub: false,
  };
}
