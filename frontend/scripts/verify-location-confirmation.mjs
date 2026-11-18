// Browser fixtures only. All API traffic is intercepted; no real rescue requests are sent.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { needsLocationConfirmation } from '../src/utils/locationConfirmation.js';

assert.equal(needsLocationConfirmation({ accuracy: 101 }), true);
assert.equal(needsLocationConfirmation({ accuracy: 100 }), false);
assert.equal(needsLocationConfirmation({ accuracy: 500, is_manual_pin: true }), false);
assert.equal(needsLocationConfirmation({ location_source: 'approximate' }), true);
assert.equal(needsLocationConfirmation({ accuracy: 500, location_confirmed: true }), false);

const fc = (features = []) => ({ type: 'FeatureCollection', features });
const center = { id: 1, name: 'Fixture Center', longitude: 125.001, latitude: 10.751, capacity: 100 };
const assignment = { household_head_name: 'Fixture Resident', evacuation_center: center, room: { id: 1, room_number: 'Sample' } };
let blocked = false;
let rescueSends = 0;
let routeOrigin;
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
  serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: 10.75, longitude: 125, accuracy: 500 } });
await context.addInitScript((saved) => {
  localStorage.setItem('evacway_user', JSON.stringify({ id: 9999, name: 'Fixture Resident', role: 'resident' }));
  localStorage.setItem('evacway_token', 'fixture-token');
  localStorage.setItem('evacway_resident', JSON.stringify(saved));
}, assignment);
await context.route(/https:\/\/[^/]*mapbox[^/]*\//, (route) => route.fulfill({ json: route.request().url().includes('/styles/')
  ? { version: 8, sources: {}, layers: [{ id: 'background', type: 'background' }] } : { routes: [] } }));
await context.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  let data = [];
  if (path === '/api/evacuation-centers') data = fc([{ type: 'Feature', properties: center, geometry: { type: 'Point', coordinates: [125.001, 10.751] } }]);
  else if (path.endsWith('/find-center')) data = { matches: [assignment] };
  else if (path.endsWith('/buildings')) data = fc();
  else if (path.endsWith('/rooms')) data = [{ id: 1, evacuation_center_id: 1, room_number: 'Sample' }];
  else if (path === '/api/evacuation-route') {
    routeOrigin = [Number(url.searchParams.get('lat')), Number(url.searchParams.get('lng'))];
    data = blocked ? { no_roads_available: true, evacuation_center: center } : {
      evacuation_center: center, route: [routeOrigin, [10.751, 125.001]], distance_km: 1, estimated_time_min: 12,
    };
  } else if (path === '/api/rescue-requests' && route.request().method() === 'POST') {
    rescueSends++;
    data = { id: rescueSends };
  } else if (path.includes('hazard-zones') || path.includes('road-segments') || path.includes('boundary')) data = fc();
  await route.fulfill({ json: data });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const preview = () => page.locator('.route-preview-card');
const clear = () => page.getByRole('button', { name: 'Clear route', exact: true }).click();
const makeRoute = async () => {
  await page.locator('.your-room-collapsed-nav-btn').click();
  await preview().waitFor();
};
const stop = async () => {
  await page.getByRole('button', { name: 'Walking navigation guidance. Tap to expand details.' }).click();
  await page.getByRole('button', { name: 'Stop navigation', exact: true }).click();
  await clear();
};
try {
  await page.goto('http://127.0.0.1:5173/map');
  await page.waitForFunction(() => window.__mapboxMap?.getSource('evacway-buildings-source'));
  assert.equal(await page.locator('.approximate-location-notice').count(), 0);
  assert.equal(await page.locator('.approximate-location-card').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Confirm location', exact: true }).count(), 0);
  await makeRoute();
  // Tapping the map must not move the GPS origin or enable manual repositioning.
  await page.locator('.mapboxgl-canvas').first().click({ position: { x: 30, y: 400 } });
  await page.locator('.route-preview-start-btn').click();
  assert.equal(await page.getByRole('button', { name: 'Stop navigation', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Confirm and start', exact: true }).click();
  await stop();

  // Accurate GPS starts immediately.
  await context.setGeolocation({ latitude: 10.75, longitude: 125, accuracy: 5 });
  await page.reload();
  await makeRoute();
  await page.locator('.route-preview-start-btn').click();
  await stop();

  // Both the full rescue form and blocked-route shortcut must wait for confirmation.
  await context.setGeolocation({ latitude: 10.75, longitude: 125, accuracy: 500 });
  await page.reload();
  assert.equal(await page.locator('.approximate-location-notice').count(), 0);
  await page.getByRole('button', { name: 'I need rescue', exact: true }).click();
  await page.locator('.rescue-modal textarea').fill('Fixture request only');
  await page.getByPlaceholder('Landmark, street, or house details (required for approximate GPS)').fill('Fixture landmark');
  await page.getByRole('button', { name: 'Send rescue alert', exact: true }).click();
  assert.equal(rescueSends, 0);
  await page.getByRole('button', { name: 'Confirm and send', exact: true }).click();
  await page.locator('.rescue-modal').waitFor({ state: 'detached' });
  assert.equal(rescueSends, 1);
  blocked = true;
  await makeRoute();
  await page.getByRole('button', { name: 'Request assistance', exact: true }).click();
  assert.equal(rescueSends, 1);
  await page.getByRole('button', { name: 'Confirm and send', exact: true }).click();
  await page.getByText('Request sent', { exact: true }).waitFor();
  assert.equal(rescueSends, 2);
  assert.deepEqual(errors, []);
  console.log('PASS: no approximate-location banner or map repositioning, coarse-GPS confirmation, accurate GPS, rescue form and blocked-route confirmation.');
} catch (error) {
  console.error('Page errors:', errors);
  await page.screenshot({ path: 'artifacts/location-confirmation-failure.png' }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
