import { test } from "node:test";
import assert from "node:assert/strict";
import { getMappedBuildingsForCenter } from "./centerBuildings.js";

test("center building list includes only buildings with mapped geometry", () => {
  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: null,
        properties: { id: 1, evacuation_center_id: 7, name: "Unmapped" },
      },
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { id: 2, evacuation_center_id: 7, name: "Mapped" },
      },
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
        properties: { id: 3, evacuation_center_id: 8, name: "Other center" },
      },
    ],
  };

  assert.deepEqual(getMappedBuildingsForCenter(geojson, 7), [
    { id: 2, evacuation_center_id: 7, name: "Mapped" },
  ]);
});
