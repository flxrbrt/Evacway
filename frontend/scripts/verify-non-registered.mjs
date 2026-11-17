// Isolated browser fixtures: no production authentication, reports or database writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const today = new Date().toISOString().slice(0, 10);
const center = { id: 1, name: 'Fake Test Shelter', capacity: 100, assigned: 0, checked_in: 0,
  evacuation_open_date: today, evacuation_cutoff_date: '2035-12-31', evacuation_status: 'open', can_check_in: true };
const operation = { id: 1, event_name: 'Fake Test Operation', status: 'active', open_date: today, cutoff_date: '2035-12-31' };
const group = (index) => ({ group_code: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  head_name: index === 1 ? 'Fake Very Long Family Name '.repeat(6) : `Fake Group ${index}`,
  people_count: 1, present_count: 1, center_id: 1, center_name: center.name, operation_id: 1,
  operation_name: operation.event_name, arrived_at: '2026-01-01T08:00:00+08:00', status: 'present',
  members: [{ id: index, name: `Fake Member ${index}`, first_name: 'Fake', middle_name: '', last_name: 'Testperson',
    sex: 'female', age_years: 30, is_group_head: true, arrived_at: '2026-01-01T08:00:00+08:00', departed_at: null }] });
let scenario = 'active';
let rows = [];
let saves = 0;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await context.addInitScript(() => {
  localStorage.setItem('evacway_user', JSON.stringify({ id: 9999, name: 'Fake Test Admin', role: 'admin' }));
  localStorage.setItem('evacway_token', 'fake-browser-fixture-token');
});
await context.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  let data = [];
  if (path.endsWith('/check-in-list')) data = { centers: [center], evacuees: [], operations: scenario === 'none' ? [] : [scenario === 'closed' ? { ...operation, status: 'concluded' } : operation],
    summary: { total_assigned: 0, total_checked_in: 0, total_partial: 0, total_pending: 0 },
    evacuation_schedule: { ...center, center_id: 1, operation_id: scenario === 'none' ? null : 1, evacuation_event_name: operation.event_name, is_schedule_set: true } };
  else if (path.endsWith('/duplicates')) data = { matches: [{ id: 9999, source: 'resident', name: 'Fake Existing Testperson', first_name: 'Fakeexisting', last_name: 'Testperson', middle_name: '', sex: 'female', age_years: 35 }] };
  else if (path === '/api/non-registered-evacuees' && request.method() === 'POST') {
    saves++;
    const body = request.postDataJSON();
    if (body.people[0].contact_number === 'bad') return route.fulfill({ status: 422, json: { error: 'Please correct the highlighted fields.', fields: { 'people.0.contact_number': 'Use 09XXXXXXXXX or +639XXXXXXXXX.' } } });
    const created = group(101);
    created.head_name = `${body.people[0].first_name} ${body.people[0].last_name}`;
    created.people_count = created.present_count = body.people.length;
    rows = [created];
    data = { group: created };
  } else if (path === '/api/non-registered-evacuees') {
    const page = Number(url.searchParams.get('page') || 1);
    data = { groups: rows.slice((page - 1) * 10, page * 10), total: rows.length,
      summary: { people: rows.reduce((sum, row) => sum + row.people_count, 0), groups: rows.length, present: rows.length } };
  } else if (path === '/api/notifications') data = [];
  else if (path.includes('/vapid-public-key')) data = { public_key: null };
  else if (path === '/api/evacuation-centers') data = { type: 'FeatureCollection', features: [] };
  await route.fulfill({ status: 200, json: data });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const add = () => page.locator('.checkin-controls-card .nre-add-button');
try {
  await page.goto('http://127.0.0.1:5173/admin?tab=checkin');
  await add().waitFor();
  await page.waitForFunction(() => !document.querySelector('.checkin-controls-card .nre-add-button')?.disabled);
  let searchBox = await page.locator('.checkin-search-wrap').boundingBox();
  let buttonBox = await add().boundingBox();
  assert(Math.abs(searchBox.y - buttonBox.y) < 8, 'Desktop add button must share the search row');
  assert.equal(Math.round(buttonBox.height), 40);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/non-registered-desktop.png', fullPage: true });
  await add().click();
  await page.locator('#nre-shelter').selectOption('1');
  await page.locator('#nre-person-0-first_name').fill('Fakehead');
  await page.locator('#nre-person-0-last_name').fill('Testperson');
  await page.getByRole('button', { name: 'Use this record', exact: true }).first().click();
  assert.equal(await page.locator('#nre-person-0-first_name').inputValue(), 'Fakeexisting');
  await page.locator('#nre-person-0-contact_number').fill('bad');
  await page.getByRole('button', { name: 'Add family member', exact: true }).click();
  await page.locator('#nre-person-1-first_name').fill('Fakemember');
  await page.locator('#nre-person-1-last_name').fill('Testperson');
  await page.locator('#nre-sex-1').selectOption('male');
  await page.locator('#nre-person-1-age_years').fill('12');
  await page.getByRole('button', { name: 'Save arrivals', exact: true }).click();
  await page.locator('#nre-person-0-contact_number-error').waitFor();
  assert.equal(await page.locator('#nre-person-0-contact_number-error').evaluate((el) => getComputedStyle(el).color), 'rgb(185, 28, 28)');
  assert.equal(await page.locator('#nre-person-0-contact_number-error').evaluate((el) => getComputedStyle(el).fontSize), '12px');
  await page.locator('#nre-person-0-contact_number').fill('09123456789');
  await page.getByRole('button', { name: 'Save arrivals', exact: true }).click();
  await page.locator('.nre-modal').waitFor({ state: 'detached' });
  assert.equal(saves, 2);
  await page.locator('.nre-table tbody tr').first().waitFor();
  rows = Array.from({ length: 100 }, (_, i) => group(i + 1));
  await page.reload();
  await page.getByText('100 groups', { exact: true }).waitFor();
  assert.equal(await page.locator('.nre-table tbody > tr').count(), 10);
  await page.getByRole('navigation', { name: 'Non-registered groups pagination' }).getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Fake Group 11', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  searchBox = await page.locator('.checkin-search-wrap').boundingBox();
  buttonBox = await add().boundingBox();
  const controlsBox = await page.locator('.checkin-controls-card').boundingBox();
  assert(buttonBox.y >= searchBox.y + searchBox.height, 'Mobile add button must be below search');
  assert(buttonBox.width >= controlsBox.width - 40, 'Mobile add button must span the row');
  await add().click();
  const modalBox = await page.locator('.nre-modal').boundingBox();
  assert.equal(Math.round(modalBox.width), 390);
  assert(Math.abs(modalBox.y + modalBox.height - 844) < 2, 'Mobile modal must be a bottom sheet');
  await page.screenshot({ path: 'artifacts/non-registered-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close arrival form' }).click();
  for (scenario of ['none', 'closed']) {
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.checkin-controls-card .nre-add-button')?.disabled);
    assert.equal(await add().getAttribute('title'), 'Select an operation first');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: desktop search-row action; mobile full-width action and bottom sheet; field errors; duplicate record selection; save; 100-group pagination; inactive-operation lock.');
} finally { await browser.close(); }
