// Opens every <details> in the data changelog for printing and restores each one's state afterwards: the fallback
// for browsers without ::details-content, which the print rule in css/style.css uses. Used on the County Profiles
// changelog (site/county-profiles/about/changelog.njk).
(function(){
  let opened = [];
  window.addEventListener("beforeprint", () => {
    opened = [...document.querySelectorAll(".data-changelog details:not([open])")];
    opened.forEach(d => { d.open = true; });
  });
  window.addEventListener("afterprint", () => {
    opened.forEach(d => { d.open = false; });
    opened = [];
  });
})();
