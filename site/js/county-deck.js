// County Profiles topic deck: the dot nav, keyboard paging, snap toggle, Chart/Table switches, the
// sea-level-rise increment picker, and the citation Copy button. Every chart and every increment
// state is already in the markup at build time; nothing here computes or draws anything — it only
// shows or hides what is already there.
(function () {
  "use strict";

  var deck = document.querySelector("[data-cpd-deck]");
  if (!deck) return;
  var slides = Array.prototype.slice.call(deck.querySelectorAll(".cpd-slide"));

  // ---- snap only when there is room: >=900px wide AND >=620px tall, and motion isn't reduced ----
  var mqWide = window.matchMedia("(min-width: 900px)");
  var mqTall = window.matchMedia("(min-height: 620px)");
  var mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function syncSnap() {
    deck.classList.toggle("is-snap", mqWide.matches && mqTall.matches && !mqMotion.matches);
  }
  [mqWide, mqTall, mqMotion].forEach(function (mq) {
    (mq.addEventListener ? mq.addEventListener.bind(mq) : mq.addListener.bind(mq))("change", syncSnap);
  });
  syncSnap();

  // ---- dot nav --------------------------------------------------------------------------------
  var dots = document.querySelector("[data-cpd-dots]");
  if (dots && slides.length) {
    var buttons = slides.map(function (sl) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", sl.getAttribute("data-label") || "");
      b.addEventListener("click", function () { sl.scrollIntoView({ block: "start" }); });
      dots.appendChild(b);
      return b;
    });
    function setActive(i) {
      buttons.forEach(function (b, j) { b.setAttribute("aria-current", String(j === i)); });
    }
    setActive(0);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) setActive(slides.indexOf(e.target)); });
      }, { root: deck, threshold: 0.55 });
      slides.forEach(function (s) { io.observe(s); });
    }
  }

  // ---- keyboard paging: Page Up/Down and arrow keys move between slides when the deck has focus --
  deck.addEventListener("keydown", function (ev) {
    var keys = { PageDown: 1, ArrowDown: 1, PageUp: -1, ArrowUp: -1 };
    var dir = keys[ev.key];
    if (!dir) return;
    var here = slides.findIndex(function (sl) {
      var r = sl.getBoundingClientRect();
      return r.top > -r.height / 2 && r.top < r.height / 2;
    });
    var next = slides[(here < 0 ? 0 : here) + dir];
    if (next) { next.scrollIntoView({ block: "start" }); ev.preventDefault(); }
  });

  // ---- title-slide contents list: smooth-scroll to the target slide -----------------------------
  document.querySelectorAll(".cpd-contents a").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      var t = document.querySelector(a.getAttribute("href"));
      if (t) { ev.preventDefault(); t.scrollIntoView({ block: "start" }); }
    });
  });

  // ---- Chart / Table switch: the timing chart only (every other figure stands alone) ----------
  document.querySelectorAll("[data-cpd-timing-view]").forEach(function (view) {
    var stage = view.closest(".cpd-fighead").nextElementSibling;
    var btns = view.querySelectorAll("button");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var want = b.getAttribute("data-show");
        btns.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        stage.querySelectorAll("[data-cpd-pane]").forEach(function (p) {
          p.classList.toggle("cpd-pane-hidden", p.getAttribute("data-cpd-pane") !== want);
        });
      });
    });
  });

  // ---- per-mark tooltips: a shared styled tooltip for the denser charts' [data-tip] marks ------
  document.querySelectorAll("[data-cpd-tips]").forEach(function (chart) {
    var tip = document.createElement("div");
    tip.className = "cpd-tooltip";
    tip.hidden = true;
    document.body.appendChild(tip);
    function place(x, y) {
      tip.style.left = x + "px";
      tip.style.top = (y - 10) + "px";
    }
    function show(mark, x, y) {
      var text = mark.getAttribute("data-tip");
      if (!text) return;
      tip.textContent = text;
      tip.hidden = false;
      place(x, y);
    }
    function hide() { tip.hidden = true; }
    chart.addEventListener("mousemove", function (ev) {
      var mark = ev.target.closest("[data-tip]");
      if (!mark) { hide(); return; }
      show(mark, ev.clientX, ev.clientY);
    });
    chart.addEventListener("mouseleave", hide);
    chart.addEventListener("touchstart", function (ev) {
      var mark = ev.target.closest("[data-tip]");
      if (!mark) return;
      var t = ev.touches[0];
      show(mark, t.clientX, t.clientY);
    }, { passive: true });
    chart.addEventListener("touchend", hide);
  });

  // ---- shared vertical-slider wiring: every increment picker is now a single <input type=range>
  // at the five discrete ft stops (min/max/step already set in the markup), not a row of buttons.
  // This only drives the slider's own chrome (fill fraction, the <output> value badge, aria-valuetext
  // for screen readers) and calls the picker's own select(ft) — everything select() does with that
  // value is unchanged from the button-row version. ------------------------------------------------
  function wireSlider(box, select) {
    var input = box.querySelector("input.cpd-slider");
    var output = box.querySelector(".cpd-slider-value");
    if (!input) return null;
    function apply(ft, updateUrl) {
      var min = Number(input.min), max = Number(input.max);
      input.style.setProperty("--cpd-slider-frac", String((Number(ft) - min) / (max - min)));
      input.setAttribute("aria-valuetext", ft + " ft");
      if (output) output.textContent = ft + " ft";
      select(String(ft), updateUrl);
    }
    input.addEventListener("input", function () { apply(input.value, true); });
    return apply;
  }

  // ---- sea level rise increment picker: toggles a precomputed overlay group + readout, hides the
  // selected increment's own muted threshold line/label (its bold twin draws in the same place),
  // and syncs the URL's ?slr= parameter. Default is the lowest increment (2 ft) unless the URL says
  // otherwise.
  document.querySelectorAll("[data-cpd-incs]").forEach(function (box) {
    var root = box.closest(".cpd-pane");
    var stateGroups = root.querySelectorAll("[data-cpd-state]");
    var mutedGroups = root.querySelectorAll("[data-cpd-muted]");
    var readouts = root.querySelectorAll("[data-cpd-readout]");
    function select(ft, updateUrl) {
      stateGroups.forEach(function (g) {
        var match = g.getAttribute("data-cpd-state") === ft;
        if (match) g.removeAttribute("hidden"); else g.setAttribute("hidden", "");
      });
      mutedGroups.forEach(function (g) {
        var match = g.getAttribute("data-cpd-muted") === ft;
        if (match) g.setAttribute("hidden", ""); else g.removeAttribute("hidden");
      });
      readouts.forEach(function (p) {
        var match = p.getAttribute("data-cpd-readout") === ft;
        if (match) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
      });
      if (updateUrl) {
        try {
          var u = new URL(window.location.href);
          u.searchParams.set("slr", ft);
          history.replaceState(null, "", u.toString());
        } catch (e) { /* the picker still works without a shareable URL */ }
      }
    }
    var apply = wireSlider(box, select);
    if (!apply) return;
    var wanted = null;
    try { wanted = new URL(window.location.href).searchParams.get("slr"); } catch (e) { /* ignore */ }
    var input = box.querySelector("input.cpd-slider");
    if (wanted && ["2", "4", "6", "8", "10"].indexOf(wanted) !== -1) {
      input.value = wanted;
    }
    apply(input.value, false);
  });

  // ---- SLR grouped-columns increment picker: every column for every increment is already drawn;
  // this only marks which increment's columns take their full ramp colour (the rest are muted) and
  // which increment's value labels are visible, matching the timing chart's picker. ---------------
  document.querySelectorAll("[data-cpd-col-incs]").forEach(function (box) {
    var scope = box.closest(".cpd-panel-body") || box.parentElement;
    var labels = scope.querySelectorAll("[data-cpd-collabel]");
    var cols = scope.querySelectorAll("[data-cpd-col]");
    function select(ft) {
      labels.forEach(function (t) {
        var match = t.getAttribute("data-cpd-collabel") === ft;
        if (match) t.removeAttribute("hidden"); else t.setAttribute("hidden", "");
      });
      cols.forEach(function (c) {
        c.classList.toggle("cpd-col-active", c.getAttribute("data-cpd-col") === ft);
      });
    }
    var apply = wireSlider(box, select);
    if (!apply) return;
    var input = box.querySelector("input.cpd-slider");
    apply(input.value, false);
  });

  // ---- SLR Flooded Facilities increment picker: every row's exposed/not-exposed split for every
  // increment is already drawn, one <g data-cpd-fac-state> per increment per row; this only shows
  // one state per row at a time, matching the timing chart's threshold overlays. ------------------
  document.querySelectorAll("[data-cpd-fac-incs]").forEach(function (box) {
    var scope = box.closest(".cpd-panel-body") || box.parentElement;
    var groups = scope.querySelectorAll("[data-cpd-fac-state]");
    function select(ft) {
      groups.forEach(function (g) {
        var match = g.getAttribute("data-cpd-fac-state") === ft;
        if (match) g.removeAttribute("hidden"); else g.setAttribute("hidden", "");
      });
    }
    var apply = wireSlider(box, select);
    if (!apply) return;
    var input = box.querySelector("input.cpd-slider");
    apply(input.value, false);
  });

  // ---- SLR view toggle (Connected only / Including low-lying areas / Both): every mark for every
  // view is already drawn and tagged data-cpd-show; this only sets the chosen view on each section
  // (data-cpd-mode, which the stylesheet turns into what is drawn), keeps every toggle on the page in
  // step, and mirrors the choice in the URL's ?low= so a shared link reproduces the view. -----------
  var lowToggles = document.querySelectorAll("[data-cpd-low-toggle]");
  if (lowToggles.length) {
    var LOW_MODES = ["conn", "withlow", "both"];
    var setLowMode = function (mode, updateUrl) {
      document.querySelectorAll("[data-cpd-moded]").forEach(function (el) { el.setAttribute("data-cpd-mode", mode); });
      lowToggles.forEach(function (t) {
        t.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode)); });
      });
      if (updateUrl) {
        try {
          var u = new URL(window.location.href);
          u.searchParams.set("low", mode);
          history.replaceState(null, "", u.toString());
        } catch (e) { /* the toggle still works without a shareable URL */ }
      }
    };
    lowToggles.forEach(function (t) {
      t.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () { setLowMode(b.getAttribute("data-mode"), true); });
      });
    });
    var wantedLow = null;
    try { wantedLow = new URL(window.location.href).searchParams.get("low"); } catch (e) { /* ignore */ }
    if (wantedLow && LOW_MODES.indexOf(wantedLow) !== -1) setLowMode(wantedLow, false);
  }

  // ---- copy citation ---------------------------------------------------------------------------
  var copy = document.getElementById("cpd-copy");
  if (copy) {
    copy.addEventListener("click", function () {
      var t = document.getElementById("cpd-cite").textContent;
      try {
        navigator.clipboard.writeText(t).then(function () {
          copy.textContent = "Copied";
          setTimeout(function () { copy.textContent = "Copy citation"; }, 1600);
        });
      } catch (e) { /* the citation stays selectable text either way */ }
    });
  }
})();
