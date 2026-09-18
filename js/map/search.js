/**
 * Address/place search box, geocoding via OpenStreetMap Nominatim. Not a
 * "layer" — it repositions the map and drops the shared click marker,
 * same as clicking the map directly.
 *
 * @param {L.Map} map
 * @param {{getMarker: () => L.Marker|null, setMarker: (m: L.Marker) => void}} markerState -
 *   shared with app-shell.js's map-click handler so both keep the same single marker in sync.
 */
export function wireSearch(map, markerState){
  async function geocode(query){
    const statusEl = document.getElementById("searchStatus");
    statusEl.textContent = "Searching…";
    statusEl.classList.remove("error");
    try{
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const results = await res.json();
      if(!results.length){
        statusEl.textContent = `No match found for "${query}".`;
        statusEl.classList.add("error");
        return;
      }
      const { lat, lon, display_name } = results[0];
      const latN = parseFloat(lat), lonN = parseFloat(lon);
      map.setView([latN, lonN], 10);
      const existing = markerState.getMarker();
      if(existing) map.removeLayer(existing);
      markerState.setMarker(L.marker([latN, lonN]).addTo(map));
      statusEl.textContent = `Showing results for: ${display_name}`;
    } catch(err){
      statusEl.textContent = "Search failed — check your connection and try again.";
      statusEl.classList.add("error");
    }
  }

  document.getElementById("searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("searchInput").value.trim();
    if(q) geocode(q);
  });
}
