export function getMappedBuildingsForCenter(buildingsGeoJSON, centerId) {
  if (centerId == null || !Array.isArray(buildingsGeoJSON?.features)) return [];

  return buildingsGeoJSON.features
    .filter(
      (feature) =>
        feature?.geometry &&
        String(feature.properties?.evacuation_center_id) === String(centerId)
    )
    .map((feature) => feature.properties)
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}
