import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRescueMessage, createEmergencyContacts, createSmsUri } from "./emergencyContacts.js";

test("emergency destinations stay empty until configured", () => {
  assert.deepEqual(createEmergencyContacts({}), {
    hotlines: [],
    rescueSmsNumber: "",
  });
});

test("emergency destinations are loaded from environment values", () => {
  const contacts = createEmergencyContacts({
    VITE_HOTLINE_MUNICIPAL_DRRMO: "+63 900 000 0000",
    VITE_HOTLINE_EMERGENCY_OPERATIONS: "not a phone number",
    VITE_RESCUE_SMS_DESTINATION: "(02) 8000-0000",
  });
  assert.deepEqual(contacts, {
    hotlines: [{ label: "Municipal DRRMO", number: "+63 900 000 0000" }],
    rescueSmsNumber: "(02) 8000-0000",
  });
});

test("SMS links prefill a message using iOS and Android URI forms", () => {
  const body = "Help needed at a location";
  const encodedBody = encodeURIComponent(body);
  assert.equal(
    createSmsUri("1234567", body, "iPhone"),
    `sms:1234567&body=${encodedBody}`
  );
  assert.equal(
    createSmsUri("1234567", body, "Android"),
    `sms:1234567?body=${encodedBody}`
  );
  assert.equal(createSmsUri("", body), "");
});

test("rescue SMS includes a map link and only an entered people count", () => {
  assert.equal(
    buildRescueMessage({
      coordinates: { latitude: 10.1, longitude: 125.2 },
      location: "ignored if GPS is available",
      people: "4",
    }),
    "I need rescue assistance.\nhttps://www.openstreetmap.org/?mlat=10.1&mlon=125.2#map=18/10.1/125.2\nPeople needing help: 4"
  );
  assert.equal(
    buildRescueMessage({ location: "Purok 2", people: "" }),
    "I need rescue assistance.\nLocation: Purok 2"
  );
});
