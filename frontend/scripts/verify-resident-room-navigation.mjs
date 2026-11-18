// Isolated fixtures only: no real residents, credentials, emails, or database writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { findAssignedRoom, resolveRoomBuilding } from '../src/utils/resolveRoomBuilding.js';

const fc = (features = []) => ({ type: 'FeatureCollection', features });
const center = (id, name, coordinates) => ({ type: 'Feature', id,
  properties: { id, name, center_type: 'campus', capacity: 100, occupied: 5, assigned: 10, barangays: [] },
  geometry: coordinates ? { type: 'Point', coordinates } : null });
const centers = fc([center(1, 'Sogod Central School', [125.001, 10.751]),
  center(2, 'Other Center', [125.002, 10.752]), center(3, 'Unmapped Center')]);
const roomList = Array.from({ length: 12 }, (_, i) => ({ id: 200 + i, room_number: String(i + 1),
  capacity: 20, occupied: 2, assigned: 4,
  families: [{ head_name: 'PRIVATE OTHER HOUSEHOLD', contact_number: 'PRIVATE PHONE', members: [{ name: 'PRIVATE MEMBER' }] }] }));
const building = (id, centerId, name, lng, rooms) => ({ type: 'Feature', id,
  properties: { id, evacuation_center_id: centerId, name, rooms, capacity: 100, occupied: 5, assigned: 10 },
  geometry: { type: 'Polygon', coordinates: [[[lng, 10.751], [lng + .0002, 10.751],
    [lng + .0002, 10.7512], [lng, 10.7512], [lng, 10.751]]] } });
const buildings = fc([building(11, 1, 'Central Building', 125.001, [{ id: 101, room_number: 'Sample' }]),
  building(12, 1, 'West Building', 125.0015, roomList),
  building(13, 2, 'West Building', 125.002, [{ id: 301, room_number: '12' }])]);
const own = { household_head_name: 'Fixture Own Resident', barangay: 'Fixture Barangay',
  evacuation_center: centers.features[0].properties,
  room: { id: 101, room_name: 'Room Sample', room_number: 'Sample', building_id: 11, building_name: 'Central Building' } };
const found = { household_head_name: 'Fixture Found Resident', barangay: 'Fixture Barangay',
  address: 'PRIVATE ADDRESS', contact_number: 'PRIVATE PHONE', members: [{ name: 'PRIVATE MEMBER' }],
  evacuation_center: centers.features[0].properties, room: { id: 211, room_number: '12', building_name: 'West Building' } };
assert.equal(resolveRoomBuilding({ building_id: 11, building_name: 'West Building' }, buildings, 1).id, 11);
assert.equal(resolveRoomBuilding({ building_name: ' west building ' }, buildings, 1).id, 12);
assert.equal(resolveRoomBuilding({ id: '211' }, buildings, 1).id, 12);
assert.equal(resolveRoomBuilding({ room_number: 'Room 12' }, buildings, 2).id, 13);
assert.equal(resolveRoomBuilding({ room_number: '12' }, buildings, 3), null);
assert.equal(findAssignedRoom(roomList, { id: '211', room_number: '1' }).id, 211);

let person = found;
let blocked = false;
const browser = await chromium.launch({ headless: true, channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce', serviceWorkers: 'block', permissions: ['geolocation'],
  geolocation: { longitude: 125, latitude: 10.75, accuracy: 5 } });
await context.addInitScript((assignment) => localStorage.setItem('evacway_resident', JSON.stringify(assignment)), own);
await context.route(/https:\/\/[^/]*mapbox[^/]*\//, async (route) => {
  if (route.request().url().includes('/styles/')) return route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8fafc' } }],
  } });
  return route.fulfill({ json: { routes: [] } });
});
await context.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  let data = [];
  if (path === '/api/evacuation-centers') data = centers;
  else if (path.endsWith('/buildings')) data = fc(buildings.features.filter((b) =>
    String(b.properties.evacuation_center_id) === path.split('/')[3]));
  else if (path.endsWith('/rooms')) data = roomList;
  else if (path.endsWith('/details')) data = { id: 12, name: 'West Building', rooms: roomList };
  else if (path.endsWith('/find-center')) data = { matches: [url.searchParams.get('name') === own.household_head_name ? own : person] };
  else if (path.endsWith('/autosuggest')) data = { suggestions: [{ name: found.household_head_name, barangay: found.barangay }] };
  else if (path === '/api/evacuation-route') data = blocked
    ? { no_roads_available: true, evacuation_center: { ...own.evacuation_center, longitude: 125.001, latitude: 10.751 } }
    : { route: [[10.75, 125], [10.751, 125.001]], distance_km: 13.8, estimated_time_min: 166,
      chosen_entrance: { name: 'Entrance 1', longitude: 125.001, latitude: 10.751 },
      evacuation_center: { ...own.evacuation_center, longitude: 125.001, latitude: 10.751 } };
  else if (path.includes('hazard-zones') || path.includes('road-segments') || path.includes('boundary')) data = fc();
  await route.fulfill({ json: data });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const roomCard = () => page.locator('.pinned-your-room-card');
const search = async () => {
  await page.getByRole('button', { name: 'Find someone', exact: true }).click();
  await page.locator('#fs-name').fill(found.household_head_name);
  await page.locator('#fs-autosuggest-listbox').waitFor();
  await page.locator('#fs-name').press('Escape');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('.find-someone-card').waitFor();
};
const clearRoute = async () => page.getByRole('button', { name: 'Clear route', exact: true }).click();
try {
  await page.goto('http://127.0.0.1:5173/map');
  await roomCard().waitFor();
  await page.waitForFunction(() => window.__mapboxMap?.getSource('evacway-buildings-source'));
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/resident-room-mobile.png' });
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction((mobile) => document.querySelector('.pinned-your-room-card').classList.contains('mobile') === mobile, width <= 768);
    const box = await roomCard().boundingBox();
    if (width <= 768) {
      assert.equal(Math.round(box.x), 12);
      assert.equal(Math.round(box.width), Math.min(width - 72, 360));
      assert.equal(await page.locator('.your-room-collapsed-nav-btn').evaluate((el) => el.offsetWidth), 36);
    }
    await page.locator('.your-room-collapsed-nav-btn').click();
    await page.locator('.route-preview-card').waitFor();
    assert.equal(await roomCard().isVisible(), false);
    assert.equal(await roomCard().count(), 1, 'Hidden room card must stay mounted');
    const preview = await page.locator('.route-preview-card').boundingBox();
    const dock = await page.locator('.bottom-actions-container').boundingBox();
    assert(preview.y < 100 && preview.y + preview.height < dock.y);
    assert.equal(await page.locator('.route-preview-start-btn').evaluate((el) => el.offsetHeight), 44);
    if (width <= 768) {
      const controls = await page.locator('.right-control-stack').boundingBox();
      assert(preview.x + preview.width <= controls.x, 'Preview must leave map controls free');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await clearRoute();
    await roomCard().waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Expand room details' }).click();
  await page.locator('.pinned-navigate-btn').click();
  await page.locator('.route-preview-card').waitFor();
  assert.equal(await page.locator('.pinned-your-room-card.is-expanded').count(), 1);
  await page.locator('.route-preview-start-btn').click();
  await page.getByRole('button', { name: 'Walking navigation guidance. Tap to expand details.' }).click();
  await page.getByRole('button', { name: 'Stop navigation' }).waitFor();
  assert.equal(await roomCard().isVisible(), false);
  await page.getByRole('button', { name: 'Stop navigation' }).click();
  await clearRoute();
  await page.locator('.pinned-your-room-card.is-expanded').waitFor();
  await page.getByRole('button', { name: 'Collapse room details' }).click();
  blocked = true;
  await page.locator('.your-room-collapsed-nav-btn').click();
  await page.locator('.route-blocked-card').waitFor();
  assert((await page.locator('.route-blocked-card').boundingBox()).y < 100);
  assert.equal(await roomCard().isVisible(), false);
  await page.getByRole('button', { name: 'Dismiss notice' }).click();
  blocked = false;
  await page.evaluate(() => {
    window.fixtureFlights = [];
    const map = window.__mapboxMap;
    const original = map.flyTo.bind(map);
    map.flyTo = (options) => { window.fixtureFlights.push(options); return original({ ...options, duration: 0 }); };
  });
  await search();
  assert.equal((await page.locator('.find-someone-card').innerText()).includes('PRIVATE'), false);
  assert.equal(await page.locator('.find-someone-room-location').innerText(), 'West Building · Room 12');
  await page.getByRole('button', { name: 'View on map' }).click();
  const assigned = page.locator('.bldg-room-card.is-found-room');
  await assigned.waitFor();
  assert.equal(await assigned.locator('.bldg-room-card-btn').getAttribute('aria-expanded'), 'true');
  assert.equal(await assigned.locator('.bldg-badge-assigned').innerText(), 'Assigned');
  assert.equal(await assigned.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(255, 251, 235)');
  assert.equal((await page.locator('.bldg-modal-dialog').innerText()).includes('PRIVATE'), false);
  await page.waitForFunction(() => {
    const el = document.querySelector('.bldg-room-card.is-found-room');
    if (!el) return false;
    const card = el.getBoundingClientRect();
    const body = el.closest('.bldg-modal-body').getBoundingClientRect();
    return card.top >= body.top && card.top < body.bottom;
  });
  assert.deepEqual(await page.evaluate(() => {
    const map = window.__mapboxMap;
    return [map.getFeatureState({ source: 'evacway-buildings-source', id: 11 }).user_building,
      map.getFeatureState({ source: 'evacway-buildings-source', id: 12 }).found_person,
      window.fixtureFlights.at(-1).zoom];
  }), [true, true, 18]);
  await page.screenshot({ path: 'artifacts/resident-found-room-mobile.png' });
  await page.locator('.bldg-modal-close-btn').click();
  assert.equal(await page.evaluate(() => window.__mapboxMap.getFeatureState({ source: 'evacway-buildings-source', id: 12 }).found_person), false);
  await page.getByRole('button', { name: 'Close details' }).click();
  // A room without a mapped building selects the center and keeps its room text.
  person = { ...found, room: { room_number: 'Single Venue' }, evacuation_center: centers.features[1].properties };
  await search();
  await page.getByRole('button', { name: 'View on map' }).click();
  await page.locator('.found-person-room-text').waitFor();
  assert.equal(await page.locator('.bldg-modal-dialog').count(), 0);
  await page.getByRole('button', { name: 'Close details' }).click();
  person = { ...found, room: null, evacuation_center: centers.features[2].properties };
  await search();
  const flights = await page.evaluate(() => window.fixtureFlights.length);
  await page.getByRole('button', { name: 'View on map' }).click();
  await page.getByText('This center isn’t on the map yet.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixtureFlights.length), flights);
  assert.deepEqual(errors, []);
  console.log('PASS: shared lookup, mobile/desktop layout, mounted state restoration, preview/blocked/navigation states, assigned-room scroll and privacy, independent highlights, center-only and unmapped fallbacks.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/resident-room-verification-failure.png' });
  console.log('Page errors:', errors);
  throw error;
} finally {
  await browser.close();
}
