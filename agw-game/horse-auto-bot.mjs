import { chromium } from 'playwright';

const TARGET_URL = process.env.BOT_URL || 'http://localhost:5173/horse-racing.html';
const PROFILE_DIR = process.env.BOT_PROFILE_DIR || './.privy-profile';
const RUNS = Math.max(1, parseInt(process.env.BOT_RUNS || '25', 10) || 25);

const APPROVE_REGEX = /approve/i;

function log(...args) {
  console.log('[horse-bot]', ...args);
}

async function clickApproveInPopup(popup) {
  await popup.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  // The popup might still be navigating.
  for (let i = 0; i < 40; i++) {
    const btn = popup.getByRole('button', { name: APPROVE_REGEX });
    if (await btn.count()) {
      await btn.first().click({ timeout: 3000 }).catch(() => {});
      log('clicked Approve');
      return true;
    }
    await popup.waitForTimeout(250);
  }
  return false;
}

async function waitForResultAndNext(page) {
  // Wait for result banner to show
  await page.waitForSelector('#resBanner.on', { timeout: 120000 });
  const nextBtn = page.locator('#nxtBtn');
  await nextBtn.waitFor({ state: 'visible', timeout: 10000 });
  await nextBtn.click();
}

async function ensureHorseSelected(page) {
  // If already selected, nothing to do.
  const chosen = page.locator('.hcard.chosen');
  if (await chosen.count()) return;

  // Choose the highest odds horse by reading card text.
  const cards = page.locator('.hcard');
  const n = await cards.count();
  if (!n) throw new Error('No horse cards found');

  let bestIdx = 0;
  let bestOdds = -1;
  for (let i = 0; i < n; i++) {
    const txt = await cards.nth(i).innerText();
    const m = txt.match(/x\s*([0-9]+(?:\.[0-9]+)?)/i);
    const odds = m ? Number(m[1]) : 0;
    if (odds > bestOdds) {
      bestOdds = odds;
      bestIdx = i;
    }
  }
  await cards.nth(bestIdx).click();
  log('selected horse', { bestOdds });
}

async function clickRunAndApprove(page) {
  const goBtn = page.locator('#goBtn');
  await goBtn.waitFor({ state: 'visible', timeout: 10000 });

  // Trigger popup by a real click.
  const popupPromise = page.waitForEvent('popup', { timeout: 20000 }).catch(() => null);
  await goBtn.click();

  const popup = await popupPromise;
  if (!popup) {
    // Sometimes wallet opens in same tab or is blocked. Surface a clear error.
    throw new Error('No popup opened for approval (popup blocked or request failed)');
  }

  log('popup opened', popup.url());
  await clickApproveInPopup(popup);

  // Wait until game continues (payment ok will start race). Race start sets isRacing and disables go button.
  // A rough proxy: countdown overlay or running state.
  await page.waitForTimeout(800);
}

async function main() {
  log('starting', { TARGET_URL, PROFILE_DIR, RUNS });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-popup-blocking'],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

  // Sanity: wait for UI
  await page.waitForSelector('#goBtn', { timeout: 30000 });

  for (let i = 0; i < RUNS; i++) {
    log(`run ${i + 1}/${RUNS}`);

    // Ensure we are not stuck on result banner.
    const resOn = await page.locator('#resBanner.on').count();
    if (resOn) {
      await page.locator('#nxtBtn').click().catch(() => {});
      await page.waitForTimeout(500);
    }

    await ensureHorseSelected(page);
    await clickRunAndApprove(page);
    await waitForResultAndNext(page);

    // Cooldown between races
    await page.waitForTimeout(700);
  }

  log('done');
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
