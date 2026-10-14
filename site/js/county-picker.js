// County Profiles picker: filters the county list as you type. The list is complete in the markup and
// the search box is hidden until this script runs, so the page works without JavaScript.
(function () {
  "use strict";
  var box = document.querySelector("[data-cp-search]");
  var input = document.getElementById("cp-county-search");
  var list = document.getElementById("cp-county-list");
  var status = document.getElementById("cp-picker-status");
  if (!box || !input || !list) return;
  box.hidden = false;
  var items = Array.prototype.slice.call(list.querySelectorAll("li"));

  function filter() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    items.forEach(function (li) {
      var match = !q || li.getAttribute("data-county-name").indexOf(q) !== -1;
      li.hidden = !match;
      if (match) shown++;
    });
    status.textContent = !q ? "" : shown === 0 ? "No county matches “" + input.value.trim() + "”." : shown + (shown === 1 ? " county" : " counties") + " match.";
  }
  input.addEventListener("input", filter);
  // Enter opens the first county still showing.
  input.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    var first = items.filter(function (li) { return !li.hidden; })[0];
    if (first) { ev.preventDefault(); window.location.href = first.querySelector("a").href; }
  });
  filter();
})();
