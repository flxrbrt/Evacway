import mapboxgl from "mapbox-gl";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faBan, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { createReportPopup } from "../components/mapReports/mapReports";

/**
 * Creates a GeoJSON circle polygon for accuracy circles or buffers.
 */
export function createGeoJSONCircle(centerLng, centerLat, radiusInMeters, points = 64) {
  const km = Math.max(radiusInMeters, 5) / 1000;
  const distanceX = km / (111.32 * Math.cos((centerLat * Math.PI) / 180));
  const distanceY = km / 110.574;
  const ret = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([centerLng + x, centerLat + y]);
  }
  ret.push(ret[0]);
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ret],
    },
    properties: {},
  };
}

/**
 * Creates the DOM element for the draggable selected location marker.
 * Minimum hit area is 44x44 px, pulsing 18 px dot with white border and label.
 */
export function createSelectedLocationElement() {
  const container = document.createElement("div");
  container.className = "selected-location-marker";
  container.setAttribute("aria-label", "Selected location");
  container.setAttribute("role", "button");

  container.innerHTML = `
    <div class="selected-location-dot-wrap">
      <div class="selected-location-pulse"></div>
      <div class="selected-location-dot"></div>
    </div>
    <span class="selected-location-label">Selected location</span>
  `;

  return container;
}

/**
 * Places or updates the selected location marker on the map.
 * Ensures only ONE marker exists in the provided ref.
 */
export function setOrUpdateSelectedLocationMarker(
  map,
  markerRef,
  location,
  onDragEnd,
  { draggable = true } = {}
) {
  if (!map) return null;

  if (markerRef && markerRef.current) {
    markerRef.current.remove();
    markerRef.current = null;
  }

  if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
    return null;
  }

  const lng = Number(location.lng);
  const lat = Number(location.lat);

  const placeMarker = () => {
    if (!map) return null;
    if (markerRef && markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const element = createSelectedLocationElement();
    const marker = new mapboxgl.Marker({
      element,
      draggable,
      anchor: "center",
    })
      .setLngLat([lng, lat])
      .addTo(map);

    if (draggable && typeof onDragEnd === "function") {
      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        onDragEnd({ lat: lngLat.lat, lng: lngLat.lng });
      });
    }

    if (markerRef) {
      markerRef.current = marker;
    }
    return marker;
  };

  if (!map.loaded()) {
    map.once("load", placeMarker);
    return null;
  }

  return placeMarker();
}

/**
 * Updates or adds the user location accuracy circle layer to the map.
 * Handles style reload and ensures clean single-source updates.
 */
export function setOrUpdateAccuracyCircle(map, lng, lat, accuracyMeters = 30) {
  if (!map) return;

  const sourceId = "user-location-accuracy-source";
  const fillLayerId = "user-location-accuracy-fill";
  const lineLayerId = "user-location-accuracy-line";

  const data = createGeoJSONCircle(lng, lat, accuracyMeters);

  function applyCircle() {
    if (!map || (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded())) return;

    try {
      const existingSource = map.getSource(sourceId);
      if (existingSource) {
        existingSource.setData(data);
        if (map.getLayer(fillLayerId)) {
          map.setPaintProperty(fillLayerId, "fill-color", "#eff6ff");
          map.setPaintProperty(fillLayerId, "fill-opacity", 0.6);
        }
        if (map.getLayer(lineLayerId)) {
          map.setPaintProperty(lineLayerId, "line-color", "#bfdbfe");
          map.setPaintProperty(lineLayerId, "line-opacity", 0.9);
          map.setPaintProperty(lineLayerId, "line-width", 1.5);
        }
        return;
      }

      map.addSource(sourceId, {
        type: "geojson",
        data,
      });

      if (!map.getLayer(fillLayerId)) {
        map.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": "#eff6ff",
            "fill-opacity": 0.6,
          },
        });
      }

      if (!map.getLayer(lineLayerId)) {
        map.addLayer({
          id: lineLayerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#bfdbfe",
            "line-opacity": 0.9,
            "line-width": 1.5,
          },
        });
      }
    } catch {
      // Style may still be mounting
    }
  }

  if (!map.loaded() || (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded())) {
    map.once("style.load", applyCircle);
  } else {
    applyCircle();
  }
}

/**
 * Removes the accuracy circle layer and source from the map.
 */
export function removeAccuracyCircle(map) {
  if (!map) return;
  try {
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;
    if (map.getLayer("user-location-accuracy-line")) map.removeLayer("user-location-accuracy-line");
    if (map.getLayer("user-location-accuracy-fill")) map.removeLayer("user-location-accuracy-fill");
    if (map.getSource("user-location-accuracy-source")) map.removeSource("user-location-accuracy-source");
  } catch {
    // Ignore cleanup errors on unmount
  }
}

/**
 * Animates marker position and accuracy circle smoothly over duration ms (default 300ms).
 * Honors prefers-reduced-motion by immediately jumping without animation.
 */
export function animateLocationTransition({
  map,
  marker,
  fromLng,
  fromLat,
  toLng,
  toLat,
  fromAccuracy,
  toAccuracy,
  duration = 300,
  onFrame,
}) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const validFrom = Number.isFinite(fromLng) && Number.isFinite(fromLat);
  const validTo = Number.isFinite(toLng) && Number.isFinite(toLat);

  if (!validTo) return null;

  if (prefersReducedMotion || !validFrom || duration <= 0) {
    if (marker && typeof marker.setLngLat === "function") {
      marker.setLngLat([toLng, toLat]);
    }
    if (map) {
      setOrUpdateAccuracyCircle(map, toLng, toLat, toAccuracy || 30);
    }
    if (onFrame) onFrame(toLng, toLat, toAccuracy || 30);
    return null;
  }

  const startAccuracy = Number.isFinite(fromAccuracy) ? fromAccuracy : toAccuracy || 30;
  const targetAccuracy = Number.isFinite(toAccuracy) ? toAccuracy : 30;
  let startTime = null;
  let frameId = null;

  function step(timestamp) {
    if (startTime === null) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Cubic ease-out
    const ease = 1 - Math.pow(1 - progress, 3);

    const curLng = fromLng + (toLng - fromLng) * ease;
    const curLat = fromLat + (toLat - fromLat) * ease;
    const curAccuracy = startAccuracy + (targetAccuracy - startAccuracy) * ease;

    if (marker && typeof marker.setLngLat === "function") {
      marker.setLngLat([curLng, curLat]);
    }
    if (map) {
      setOrUpdateAccuracyCircle(map, curLng, curLat, curAccuracy);
    }
    if (onFrame) onFrame(curLng, curLat, curAccuracy);

    if (progress < 1) {
      frameId = requestAnimationFrame(step);
    }
  }

  frameId = requestAnimationFrame(step);
  return () => {
    if (frameId) cancelAnimationFrame(frameId);
  };
}

/**
 * Refines GPS location for up to 20 seconds using watchPosition.
 * Retains the reading with lowest coords.accuracy.
 * Calls onFirstFix on first fix and onImprovement whenever a better fix arrives.
 * Resolves with the best position at 20 seconds (or immediately if accuracy <= 10m).
 * Rejects with user-friendly error string if no fix could be acquired.
 */
export function refineGeolocation({
  onFirstFix,
  onImprovement,
  onProgress,
  maxRefineMs = 20000,
} = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Your browser does not support geolocation."));
      return;
    }

    let bestReading = null;
    let watchId = null;
    let timerId = null;
    let settled = false;

    const cleanup = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (bestReading) {
        resolve(bestReading);
      } else {
        reject(new Error("Location request timed out. Please try again or pin on the map."));
      }
    };

    timerId = setTimeout(finish, maxRefineMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (settled) return;
          const currentAcc = pos.coords.accuracy ?? Infinity;
          const isFirst = !bestReading;
          const isBetter = !bestReading || currentAcc < (bestReading.coords.accuracy ?? Infinity);

          if (isFirst) {
            bestReading = pos;
            if (onFirstFix) onFirstFix(pos);
          } else if (isBetter) {
            bestReading = pos;
            if (onImprovement) onImprovement(pos);
          }

          if (onProgress) onProgress(pos, isBetter);

          if (currentAcc <= 10) {
            finish();
          }
        },
        (err) => {
          if (settled) return;
          if (bestReading) {
            finish();
            return;
          }
          settled = true;
          cleanup();
          let message = "Couldn't get your location. Pin on the map instead.";
          if (err.code === 1) {
            message = "Location access is blocked. Allow it in your browser settings or pin on the map.";
          } else if (err.code === 2) {
            message = "Location information is unavailable. Try moving to an area with clear GPS or pin on the map.";
          } else if (err.code === 3) {
            message = "Location request timed out. Please try again or pin on the map.";
          }
          const errorObj = new Error(message);
          errorObj.code = err.code;
          reject(errorObj);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

/**
 * Flies to a saved hazard report, displays a highlighted marker with
 * a 3-second pulsing ring, and opens the report popup.
 */
export function highlightAndOpenSavedReport(map, highlightMarkerRef, report, showPopup = true) {
  if (!map || !report) return null;
  const lng = Number(report.longitude ?? report.lng);
  const lat = Number(report.latitude ?? report.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const doHighlight = () => {
    if (!map) return null;
    // Remove previous highlight marker if present so markers never pile up
    if (highlightMarkerRef && highlightMarkerRef.current) {
      highlightMarkerRef.current.remove();
      highlightMarkerRef.current = null;
    }

    const currentZoom = typeof map.getZoom === "function" ? map.getZoom() : 14;
    const targetZoom = Math.max(currentZoom, 16);
    map.flyTo({
      center: [lng, lat],
      zoom: targetZoom,
      duration: 1000,
      essential: true,
    });

    const isBlocked =
      report?.blocks_road === true ||
      report?.road_segment_id != null ||
      report?.road_id != null ||
      (Array.isArray(report?.closed_roads) && report.closed_roads.length > 0) ||
      /block|closed|obstruct/i.test(`${report?.report_type || ""} ${report?.hazard_type || ""}`);

    if (isBlocked) {
      // For blocked roads: do not spawn any white circle with red slash marker or pulsing ring.
      // Show the blockage details popup directly on the map.
      if (showPopup) {
        const popup = new mapboxgl.Popup({
          offset: [0, -28],
          className: "ew-popup",
          maxWidth: "340px",
          closeButton: true,
          closeOnClick: true,
        })
          .setLngLat([lng, lat])
          .setDOMContent(createReportPopup(report))
          .addTo(map);

        if (highlightMarkerRef) {
          highlightMarkerRef.current = popup;
        }
        return popup;
      }
      return null;
    }

    // Create highlight marker container with >= 44x44px touch area
    const container = document.createElement("div");
    container.className = "hazard-highlight-marker-wrap";
    container.setAttribute("aria-label", `Hazard: ${report.report_type || "Hazard report"}`);
    container.setAttribute("role", "button");

    // Outer ring that pulses for about 3 seconds
    const ring = document.createElement("div");
    ring.className = "hazard-highlight-ring";
    container.appendChild(ring);

    // Inner icon / pin using the hazard's existing icon
    const core = document.createElement("div");
    core.className = "hazard-highlight-core";
    core.innerHTML = icon(isBlocked ? faBan : faTriangleExclamation).html.join("");
    container.appendChild(core);

    // Auto-remove the ring animation after 3.2s
    window.setTimeout(() => {
      ring.remove();
    }, 3200);

    const marker = new mapboxgl.Marker({
      element: container,
      anchor: "center",
    }).setLngLat([lng, lat]);

    if (showPopup) {
      const popup = new mapboxgl.Popup({
        offset: [0, -32],
        className: "ew-popup",
        maxWidth: "320px",
      }).setDOMContent(createReportPopup(report));

      marker.setPopup(popup);
      marker.addTo(map);
      popup.addTo(map);
    } else {
      marker.addTo(map);
    }

    // Add / update 100m impact zone circle buffer only for area hazards (flood, landslide),
    // NEVER for road blockages, which stop strictly at intersections.
    try {
      if (typeof map.isStyleLoaded === "function" && map.isStyleLoaded()) {
        const sourceId = "hazard-report-100m-buffer";
        if (isBlocked) {
          if (map.getLayer("hazard-report-100m-fill")) map.removeLayer("hazard-report-100m-fill");
          if (map.getLayer("hazard-report-100m-line")) map.removeLayer("hazard-report-100m-line");
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        } else {
          const circleGeoJSON = createGeoJSONCircle(lng, lat, 100);
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: "geojson",
              data: circleGeoJSON,
            });
            map.addLayer({
              id: "hazard-report-100m-fill",
              type: "fill",
              source: sourceId,
              paint: {
                "fill-color": "#ef4444",
                "fill-opacity": 0.18,
              },
            });
            map.addLayer({
              id: "hazard-report-100m-line",
              type: "line",
              source: sourceId,
              paint: {
                "line-color": "#dc2626",
                "line-width": 2,
                "line-dasharray": [2, 2],
              },
            });
          } else {
            map.getSource(sourceId).setData(circleGeoJSON);
          }
        }
      }
    } catch {
      // Ignore layer errors if map style is changing
    }

    if (highlightMarkerRef) {
      highlightMarkerRef.current = marker;
    }

    return marker;
  };

  if (!map.loaded()) {
    map.once("load", doHighlight);
    return null;
  }

  return doHighlight();
}
