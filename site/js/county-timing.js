// County Profiles: the "When is the time to act?" graph view. The table is the default and works
// without JavaScript; this adds a Table/Graph switch, a slider that moves the threshold line, and
// ?slr=<feet> in the URL so a view can be shared. All geometry is precomputed in the page.
(function () {
  "use strict";
  var SCENARIOS = ["Intermediate", "Intermediate-high", "High"];

  document.querySelectorAll("[data-timing]").forEach(function (root) {
    var tabs = root.querySelector(".cp-tabs");
    var graph = root.querySelector('[data-panel="graph"]');
    var table = root.querySelector('[data-panel="table"]');
    var slider = root.querySelector("[data-slider]");
    var out = root.querySelector("[data-out]");
    var line = root.querySelector("[data-threshold]");
    var readout = root.querySelector("[data-readout]");
    var steps = Array.prototype.slice.call(root.querySelectorAll("[data-step]"));
    if (!tabs || !graph || !slider || !line || !steps.length) return;

    function show(view) {
      var isGraph = view === "graph";
      graph.hidden = !isGraph;
      table.hidden = isGraph;
      tabs.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === view));
      });
    }

    function setStep(i, updateUrl) {
      var s = steps[i];
      var ft = s.getAttribute("data-ft");
      var y = s.getAttribute("data-y");
      slider.value = String(i);
      out.textContent = ft + " ft";
      slider.setAttribute("aria-valuetext", ft + " feet");
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      var years = s.getAttribute("data-years").split(",");
      readout.textContent = "Reaches " + ft + " ft: " + SCENARIOS.map(function (n, k) { return n + " " + years[k]; }).join(" · ") + ".";
      if (updateUrl) {
        try {
          var u = new URL(window.location.href);
          u.searchParams.set("slr", ft);
          history.replaceState(null, "", u.toString());
        } catch (e) { /* the view still works without a shareable URL */ }
      }
    }

    tabs.hidden = false;
    tabs.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { show(b.getAttribute("data-view")); });
    });
    slider.addEventListener("input", function () { setStep(Number(slider.value), true); });

    var wanted = null;
    try { wanted = new URL(window.location.href).searchParams.get("slr"); } catch (e) { /* ignore */ }
    var idx = steps.findIndex(function (s) { return s.getAttribute("data-ft") === wanted; });
    setStep(idx >= 0 ? idx : 0, false);
    show(idx >= 0 ? "graph" : "table");
  });
})();
