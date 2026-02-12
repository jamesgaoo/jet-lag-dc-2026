# Jet Lag DC 2026 — Zone Detector

An interactive map that shows proprietary zones within Washington, D.C. and uses
browser geolocation to tell you which zone you are standing in.

Built with plain HTML/CSS/JavaScript — no build step, no framework.

## How to run locally

The app loads `data/zones.geojson` via `fetch()`, so it needs an HTTP server
(opening `index.html` directly from the filesystem will fail due to CORS).

**Option A — Python (built into macOS/Linux):**

```bash
# Python 3
python3 -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

Then open <http://localhost:8000>.

**Option B — Node.js:**

```bash
npx serve .
```

**Option C — VS Code:**

Install the "Live Server" extension, right-click `index.html`, and choose
*Open with Live Server*.

## How to deploy to GitHub Pages

Push the repo to GitHub and enable Pages on the branch that contains
`index.html` at the root. No build step is required.

## Replacing the sample GeoJSON

1. Place your real GeoJSON file at `data/zones.geojson`.
2. The file must be a `FeatureCollection` containing `Polygon` or
   `MultiPolygon` features.
3. Each feature should have a `zone_name` property (the app falls back to
   `name`, then `id`).
4. **Coordinate order is [longitude, latitude]** — this is the GeoJSON
   standard (RFC 7946). Do not swap them.

Example feature:

```json
{
  "type": "Feature",
  "properties": { "zone_name": "My Zone" },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-77.04, 38.91],
      [-77.03, 38.91],
      [-77.03, 38.90],
      [-77.04, 38.90],
      [-77.04, 38.91]
    ]]
  }
}
```

## Coordinate order notes

| Context | Order | Example |
|---------|-------|---------|
| GeoJSON coordinates | `[longitude, latitude]` | `[-77.0369, 38.9072]` |
| Browser geolocation | `latitude, longitude` | `coords.latitude = 38.9072` |
| Leaflet markers | `L.marker([lat, lng])` | `L.marker([38.9072, -77.0369])` |
| Turf.js points | `turf.point([lng, lat])` | `turf.point([-77.0369, 38.9072])` |

The app handles these conversions internally — you only need to ensure your
GeoJSON follows the standard `[lng, lat]` order.

## Overlap behaviour

If a user's position falls inside multiple overlapping zone polygons, the app
selects the zone with the **smallest area** (computed via `turf.area`). This
ensures more specific zones take priority over large enclosing ones.

## Tech stack

- [Leaflet.js](https://leafletjs.com/) — interactive map
- [Turf.js](https://turfjs.org/) — point-in-polygon and area calculations
- [OpenStreetMap](https://www.openstreetmap.org/) — basemap tiles

## Project structure

```
index.html          Main page
styles.css          Styles for the map and overlay panel
app.js              All application logic
data/zones.geojson  Zone polygons (GeoJSON FeatureCollection)
```
