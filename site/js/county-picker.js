// County Profiles picker: an accessible combobox (ARIA 1.2 editable combobox with list autocomplete).
// Focusing the empty box lists every county; typing filters; Up and Down move through the matches,
// Enter opens the highlighted county (or the first match if none is highlighted), Escape closes the
// list (a second Escape clears the box). The options are already in the markup, and the combobox is
// hidden until this script runs; without JavaScript the plain list in <noscript> is the way in.
(function () {
  "use strict";
  var root = document.querySelector("[data-cp-combo]");
  if (!root) return;
  var input = root.querySelector("input");
  var list = root.querySelector("[role=listbox]");
  var status = document.getElementById("cp-combo-status");
  var options = Array.prototype.slice.call(list.querySelectorAll("[role=option]"));
  var empty = document.createElement("li");
  empty.className = "cp-combo-empty";
  empty.setAttribute("role", "presentation");
  empty.textContent = "No county matches.";
  empty.hidden = true;
  list.appendChild(empty);
  root.hidden = false;

  var shown = []; // options currently listed, in order
  var active = -1; // index into `shown`, or -1

  function setActive(i) {
    if (shown[active]) shown[active].setAttribute("aria-selected", "false");
    active = i;
    if (shown[active]) {
      shown[active].setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", shown[active].id);
      shown[active].scrollIntoView({ block: "nearest" });
    } else {
      input.setAttribute("aria-activedescendant", "");
    }
  }

  function isOpen() { return !list.hidden; }
  function open() { list.hidden = false; input.setAttribute("aria-expanded", "true"); }
  function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); setActive(-1); }

  // Names that start with the text come before names that only contain it.
  function filter() {
    var q = input.value.trim().toLowerCase();
    var starts = [], contains = [];
    options.forEach(function (li) {
      var name = li.getAttribute("data-name");
      var at = q ? name.indexOf(q) : 0;
      if (at === 0) starts.push(li); else if (at > 0) contains.push(li);
    });
    shown = starts.concat(contains);
    options.forEach(function (li) { li.hidden = shown.indexOf(li) === -1; });
    shown.forEach(function (li) { list.insertBefore(li, empty); });
    empty.hidden = shown.length > 0;
    setActive(-1);
    status.textContent = shown.length ? shown.length + (shown.length === 1 ? " county" : " counties") + " listed." : "No county matches.";
  }

  function go(li) { if (li) window.location.href = li.getAttribute("data-href"); }

  input.addEventListener("focus", function () { filter(); open(); });
  input.addEventListener("input", function () { filter(); open(); });
  input.addEventListener("click", function () { if (!isOpen()) { filter(); open(); } });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!isOpen()) { filter(); open(); }
      if (!shown.length) return;
      var step = ev.key === "ArrowDown" ? 1 : -1;
      setActive(active === -1 ? (step === 1 ? 0 : shown.length - 1) : (active + step + shown.length) % shown.length);
    } else if (ev.key === "Enter") {
      var target = shown[active] || (isOpen() ? shown[0] : null);
      if (target) { ev.preventDefault(); go(target); }
    } else if (ev.key === "Escape") {
      if (isOpen()) { ev.preventDefault(); close(); }
      else if (input.value) { ev.preventDefault(); input.value = ""; filter(); }
    }
  });
  // Mouse: keep focus in the box while choosing, and open the county on click.
  list.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
  list.addEventListener("click", function (ev) {
    var li = ev.target.closest("[role=option]");
    if (li) go(li);
  });
  list.addEventListener("mousemove", function (ev) {
    var li = ev.target.closest("[role=option]");
    if (li && shown.indexOf(li) !== active) setActive(shown.indexOf(li));
  });
})();
