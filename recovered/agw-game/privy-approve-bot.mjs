import { chromium } from 'playwright';

const TARGET_URL = process.env.BOT_URL || 'http://localhost:5173';
const PROFILE_DIR = process.env.BOT_PROFILE_DIR || './.privy-profile';

const APPROVE_REGEX = /approve/i;
const NOT_NOW_REGEX = /not\s*now/i;

function log(...args) {
  console.log('[privy-bot]', ...args);
}

async function tryClickApprove(page) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

    const approve = page.getByRole('button', { name: APPROVE_REGEX });
    if (await approve.count()) {
      await approve.first().click({ timeout: 5000 }).catch(() => {});
      log('clicked Approve');
      return true;
    }

    // Fallback: click by text
    const approveText = page.getByText(APPROVE_REGEX, { exact: false });
    if (await approveText.count()) {
      await approveText.first().click({ timeout: 5000 }).catch(() => {});
      log('clicked Approve (text fallback)');
      return true;
    }

    return false;
  } catch (e) {
    log('tryClickApprove error', String(e?.message || e));
    return false;
  }
}

async function maybeClosePopup(page) {
  try {
    // If there's a "Not now" or close button after approve, click it.
    const notNow = page.getByRole('button', { name: NOT_NOW_REGEX });
    if (await notNow.count()) {
      await notNow.first().click({ timeout: 1500 }).catch(() => {});
      return;
    }
  } catch {}
}

async function main() {
  log('starting with', { TARGET_URL, PROFILE_DIR });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1100, height: 800 },
    args: [
      '--disable-popup-blocking',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  page.on('popup', async (popup) => {
    try {
      log('popup opened', popup.url());

      // Some popups open as about:blank then navigate. Wait a moment.
      await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      const urlNow = popup.url();
      log('popup url', urlNow);
      if (!/privy\.abs\.xyz\/cross-app\/transact/i.test(urlNow)) {
        // Still try: sometimes the UI loads before URL is fully updated.
        log('popup not matched by url; attempting approve anyway');
      }

      // Wait for approve button and click it.
      await popup.waitForTimeout(300);
      const clicked = await tryClickApprove(popup);
      if (!clicked) {
        log('approve button not found yet; retrying...');
        for (let i = 0; i < 10; i++) {
          await popup.waitForTimeout(500);
          if (await tryClickApprove(popup)) break;
        }
      }

      // Optional: try to click "Not now" if it appears.
      await popup.waitForTimeout(800);
      await maybeClosePopup(popup);

      // Do not force-close; let Privy close itself after approval.
      // If it stays open, keep it open to avoid breaking the request.
      log('approve flow handled; leaving popup open if still present');
    } catch (e) {
      log('popup handler error', String(e?.message || e));
    }
  });

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  log('opened target page. Keep this running; it will auto-approve Privy popups.');

  // Keep process alive
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await page.waitForTimeout(60_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
