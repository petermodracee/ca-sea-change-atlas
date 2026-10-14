// County Profiles county switcher. Goes to the same topic for the chosen county, keeping the current
// slide's anchor; if that county has no page for the topic, goes to that county's chooser page, where
// the grayed card says why. The availability map is embedded in the page (#cp-switch-data); nothing is
// fetched. Changing the selection (arrow keys included) never navigates: Enter or the Go button does.
(function () {
  "use strict";
  var form = document.querySelector("[data-cp-switcher]");
  var dataEl = document.getElementById("cp-switch-data");
  if (!form || !dataEl) return;
  var counties;
  try { counties = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var select = form.querySelector("select");
  var topic = form.getAttribute("data-topic");
  form.hidden = false;

  // The slide most in view in the deck, as "#s-..."; empty on a page with no deck.
  function currentSlide() {
    var deck = document.querySelector("[data-cpd-deck]");
    if (!deck) return "";
    // Measured against the part of the deck on screen: on a narrow screen the deck is the page, not a scroller.
    var rect = deck.getBoundingClientRect();
    var box = { top: Math.max(rect.top, 0), bottom: Math.min(rect.bottom, window.innerHeight) };
    var best = null, bestArea = 0;
    Array.prototype.forEach.call(deck.querySelectorAll(".cpd-slide"), function (sl) {
      var r = sl.getBoundingClientRect();
      var area = Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top));
      if (area > bestArea) { best = sl; bestArea = area; }
    });
    return best && best.id ? "#" + best.id : "";
  }

  function go() {
    var slug = select.value;
    var target = counties.filter(function (c) { return c.slug === slug; })[0];
    if (!target || slug === form.getAttribute("data-current")) return;
    var base = form.getAttribute("data-base") + slug + "/";
    if (topic && target.topics.indexOf(topic) !== -1) {
      // The slide ids are the same for every county that has the topic, so the anchor carries over.
      // The sea level rise increment (?slr=) is kept too.
      window.location.href = base + topic + "/" + window.location.search + currentSlide();
    } else {
      window.location.href = base;
    }
  }

  form.setAttribute("data-current", select.value);
  form.addEventListener("submit", function (ev) { ev.preventDefault(); go(); });
  // Arrow keys change the selection without a change-triggered navigation; Enter commits (the form's
  // implicit submission does not fire from a <select>, so handle it here).
  select.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); go(); }
  });
})();
