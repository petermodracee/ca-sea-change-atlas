/**
 * Address/place search box, geocoding via OpenStreetMap Nominatim. Not a
 * "layer" — it repositions the map and drops the shared click marker,
 * same as clicking the map directly.
 *
 * Search runs on submit only (never per keystroke), per Nominatim's usage policy.
 * The best match is shown immediately; other candidates are listed so the user
 * can pick a different one.
 *
 * @param {L.Map} map
 * @param {{getMarker: () => L.Marker|null, setMarker: (m: L.Marker) => void}} markerState -
 *   shared with app-shell.js's map-click handler so both keep the same single marker in sync.
 */

// Rough California bounding box (west,north,east,south), used to rank in-state matches first without excluding others.
const CALIFORNIA_VIEWBOX = "-124.5,42.1,-114.1,32.4";
const MAX_RESULTS = 5;

export function wireSearch(map, markerState){
  const statusEl = document.getElementById("searchStatus");
  const resultsEl = document.getElementById("searchResults");

  /** Moves the map to a Nominatim result and drops the shared marker on it. */
  function showResult(result){
    const lat = parseFloat(result.lat), lon = parseFloat(result.lon);
    if(result.boundingbox){
      const [south, north, west, east] = result.boundingbox.map(parseFloat);
      map.fitBounds([[south, west], [north, east]], { maxZoom: 16 }); // a street zooms in tight, a county stays wide
    } else {
      map.setView([lat, lon], 10);
    }
    const existing = markerState.getMarker();
    if(existing) map.removeLayer(existing);
    markerState.setMarker(L.marker([lat, lon]).addTo(map));
    statusEl.textContent = `Showing results for: ${result.display_name}`;
    statusEl.classList.remove("error");
  }

  /** Lists the other candidates as buttons under the search bar. */
  function renderAlternatives(alternatives){
    resultsEl.replaceChildren();
    if(!alternatives.length){ resultsEl.hidden = true; return; }
    const heading = document.createElement("span");
    heading.textContent = "Other matches:";
    resultsEl.appendChild(heading);
    alternatives.forEach(result => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = result.display_name;
      button.addEventListener("click", () => showResult(result));
      resultsEl.appendChild(button);
    });
    resultsEl.hidden = false;
  }

  async function geocode(query){
    statusEl.textContent = "Searching…";
    statusEl.classList.remove("error");
    renderAlternatives([]);
    try{
      const params = new URLSearchParams({
        format: "json", limit: String(MAX_RESULTS), countrycodes: "us", viewbox: CALIFORNIA_VIEWBOX, q: query
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "Accept": "application/json" } });
      const results = await res.json();
      if(!results.length){
        statusEl.textContent = `No match found for "${query}".`;
        statusEl.classList.add("error");
        return;
      }
      showResult(results[0]);
      renderAlternatives(results.slice(1));
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
