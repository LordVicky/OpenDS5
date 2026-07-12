import { _electron as electron } from 'playwright';
const out = '/tmp/claude-1000/-home-lordvicky/12b9e491-66db-42d5-91c0-cd735a26e2cd/scratchpad';
const app = await electron.launch({
  args: ['.'], cwd: '/home/lordvicky/Virtual-DS5-Bridge/ds5-bridge/companion', timeout: 120000,
  env: { ...process.env, DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE: '1', DS5_BRIDGE_MOCK_CONTROLLER: '1' }
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  // Force the tutorial to show.
  await page.evaluate(() => localStorage.removeItem('ds5bridge.startupTutorialCompleted.v1'));
  await page.reload();
  await page.waitForTimeout(3000);

  const tut = page.getByRole('dialog', { name: 'Feature tile tutorial' });
  await tut.waitFor({ state: 'visible', timeout: 20000 });
  console.log('R step-1 dialog visible');
  await tut.screenshot({ path: `${out}/tut.png` });

  console.log('R has "1 / 2" step counter:', (await tut.innerText()).includes('/'));
  console.log('R mentions Ko-fi:', /ko-fi|support/i.test(await tut.innerText()));

  await page.getByLabel('Toggle example effect').click();
  const cont = page.getByRole('button', { name: 'Continue' });
  console.log('R Continue enabled immediately (no countdown):', await cont.isEnabled());
  await cont.click();
  await page.waitForTimeout(600);
  console.log('R tutorial dismissed:', (await tut.count()) === 0 || !(await tut.isVisible()));
  console.log('R support dialog exists anywhere:', await page.getByRole('dialog', { name: 'Support OpenDS5' }).count());
  console.log('R DONE');
} finally { await app.close(); }
