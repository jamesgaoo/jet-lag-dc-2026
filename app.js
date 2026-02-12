// ── app.js ────────────────────────────────────────────────────────
// Jet Lag DC 2026 — Zone Detector
//
// Loads zones from data/zones.geojson, renders them on a Leaflet map,
// and uses browser geolocation + Turf.js to determine which zone the
// user is currently in.
//
// Overlap behaviour: if a point falls inside multiple zone polygons,
// the zone with the smallest area (turf.area) is chosen. This favours
// more specific / smaller zones over large enclosing ones.
// ──────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── DOM refs ────────────────────────────────────────────────────
  var btnLocate  = document.getElementById('locate-btn');
  var elStatus   = document.getElementById('geo-status');
  var elCoords   = document.getElementById('coords');
  var elZoneName = document.getElementById('zone-name');

  // ── Map setup ──────────────────────────────────────────────────
  var map = L.map('map', {
    center: [38.9072, -77.0369],   // Washington DC
    zoom: 13,
    zoomControl: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // ── State ──────────────────────────────────────────────────────
  var geojsonLayer    = null;   // Leaflet GeoJSON layer
  var geojsonData     = null;   // raw FeatureCollection
  var userMarker      = null;   // Leaflet marker for user location
  var highlightedLayer = null;  // currently highlighted zone layer

  // ── Zone colours (rotate through a palette) ────────────────────
  var PALETTE = [
    '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
    '#42d4f4', '#f032e6', '#bfef45', '#fabebe', '#469990',
    '#e6beff', '#9A6324', '#fffac8', '#800000', '#aaffc3',
    '#808000', '#ffd8b1', '#000075', '#a9a9a9', '#ffffff',
    '#dcbeff', '#808080', '#ffe119', '#000000',
  ];
  var colourIndex = 0;

  function nextColour() {
    var c = PALETTE[colourIndex % PALETTE.length];
    colourIndex++;
    return c;
  }

  // ── Default style for zone polygons ────────────────────────────
  var featureColours = {};  // feature index -> colour

  function defaultStyle(feature) {
    // Assign a stable colour per feature
    var idx = geojsonData.features.indexOf(feature);
    if (!featureColours[idx]) {
      featureColours[idx] = nextColour();
    }
    return {
      color: featureColours[idx],
      weight: 2,
      fillColor: featureColours[idx],
      fillOpacity: 0.22,
    };
  }

  function highlightStyle(feature) {
    var idx = geojsonData.features.indexOf(feature);
    var c = featureColours[idx] || '#e94560';
    return {
      color: c,
      weight: 5,
      fillColor: c,
      fillOpacity: 0.45,
    };
  }

  // ── Helper: get a display name for a zone feature ──────────────
  function zoneName(feature) {
    var p = feature.properties || {};
    return p.zone_name || p.name || p.id || 'Unnamed zone';
  }

  // ── Load GeoJSON ───────────────────────────────────────────────
  function loadZones() {
    fetch('data/zones.geojson')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        geojsonData = data;
        renderZones();
      })
      .catch(function (err) {
        console.error('Failed to load zones:', err);
        setStatus('error', 'Zone data failed to load');
      });
  }

  // ── Render zones on the map ────────────────────────────────────
  function renderZones() {
    geojsonLayer = L.geoJSON(geojsonData, {
      style: defaultStyle,
      onEachFeature: function (feature, layer) {
        layer.bindPopup('<strong>' + zoneName(feature) + '</strong>');
      },
    }).addTo(map);

    // Fit map to zone bounds
    map.fitBounds(geojsonLayer.getBounds(), { padding: [30, 30] });
  }

  // ── Status helpers ─────────────────────────────────────────────
  function setStatus(cls, text) {
    elStatus.className = cls;
    elStatus.textContent = text;
  }

  // ── Find zone for a given lat/lng ──────────────────────────────
  // Returns { feature, layer } or null.
  //
  // If the point is inside multiple overlapping zones, the zone with
  // the smallest area (turf.area) is returned so that more specific
  // zones take priority over large enclosing ones.
  function findZone(lat, lng) {
    if (!geojsonData) return null;

    // GeoJSON uses [lng, lat]; Turf follows that convention.
    var pt = turf.point([lng, lat]);
    var matches = [];

    geojsonData.features.forEach(function (feature) {
      var dominated = false;
      // booleanPointInPolygon works for Polygon; for MultiPolygon we
      // need to test each sub-polygon individually.
      if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(function (polyCoords) {
          if (!dominated) {
            var poly = turf.polygon(polyCoords);
            if (turf.booleanPointInPolygon(pt, poly)) {
              dominated = true;
            }
          }
        });
      } else {
        dominated = turf.booleanPointInPolygon(pt, feature);
      }

      if (dominated) {
        matches.push(feature);
      }
    });

    if (matches.length === 0) return null;

    // If multiple zones match, pick the smallest area.
    var best = matches[0];
    var bestArea = turf.area(best);
    for (var i = 1; i < matches.length; i++) {
      var a = turf.area(matches[i]);
      if (a < bestArea) {
        best = matches[i];
        bestArea = a;
      }
    }

    // Find the matching Leaflet layer so we can highlight it.
    var matchedLayer = null;
    if (geojsonLayer) {
      geojsonLayer.eachLayer(function (layer) {
        if (layer.feature === best) {
          matchedLayer = layer;
        }
      });
    }

    return { feature: best, layer: matchedLayer };
  }

  // ── Show result in UI ──────────────────────────────────────────
  function showResult(lat, lng) {
    elCoords.textContent = lat.toFixed(6) + ', ' + lng.toFixed(6);

    var result = findZone(lat, lng);

    // Reset previous highlight
    if (highlightedLayer) {
      geojsonLayer.resetStyle(highlightedLayer);
      highlightedLayer = null;
    }

    if (result) {
      var name = zoneName(result.feature);
      elZoneName.textContent = name;
      elZoneName.className = '';
      var idx = geojsonData.features.indexOf(result.feature);
      elZoneName.style.color = featureColours[idx] || '#e94560';

      // Highlight the matched zone
      if (result.layer) {
        result.layer.setStyle(highlightStyle(result.feature));
        result.layer.bringToFront();
        highlightedLayer = result.layer;
      }
    } else {
      elZoneName.textContent = 'No zone found / outside coverage';
      elZoneName.className = 'none';
      elZoneName.style.color = '';
    }

    // Place / move user marker. Leaflet uses [lat, lng].
    if (userMarker) {
      userMarker.setLatLng([lat, lng]);
    } else {
      userMarker = L.marker([lat, lng]).addTo(map);
    }
  }

  // ── Geolocation ────────────────────────────────────────────────
  function locateUser() {
    if (!navigator.geolocation) {
      setStatus('error', 'Geolocation not supported by browser');
      return;
    }

    btnLocate.disabled = true;
    btnLocate.textContent = 'Locating\u2026';
    setStatus('waiting', 'Acquiring location\u2026');

    navigator.geolocation.getCurrentPosition(
      function onSuccess(pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;

        setStatus('found', 'Location found');
        showResult(lat, lng);
        map.setView([lat, lng], 15);

        btnLocate.disabled = false;
        btnLocate.textContent = 'Locate Me';
      },
      function onError(err) {
        btnLocate.disabled = false;
        btnLocate.textContent = 'Locate Me';

        switch (err.code) {
          case err.PERMISSION_DENIED:
            setStatus('denied', 'Permission denied');
            break;
          case err.POSITION_UNAVAILABLE:
            setStatus('error', 'Position unavailable');
            break;
          case err.TIMEOUT:
            setStatus('error', 'Location request timed out');
            break;
          default:
            setStatus('error', 'Unknown error');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  // ── Map click to test any point ────────────────────────────────
  map.on('click', function (e) {
    showResult(e.latlng.lat, e.latlng.lng);
  });

  // ── Wire up button ─────────────────────────────────────────────
  btnLocate.addEventListener('click', locateUser);

  // ── Init ───────────────────────────────────────────────────────
  loadZones();
})();
