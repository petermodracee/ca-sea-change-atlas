// Builds a table of contents from the <h2> headings inside [data-toc-source]
// and fills the [data-toc] nav (_includes/toc.njk). Headings without an id get
// a slug id, so existing pages can adopt this without editing their content.
// Highlights the section currently in view.
(function(){
  const nav = document.querySelector("[data-toc]");
  const source = document.querySelector("[data-toc-source]");
  if(!nav || !source) return;
  const headings = [...source.querySelectorAll("h2")];
  if(headings.length < 2) return;

  const used = new Set(headings.map(h => h.id).filter(Boolean));
  const slug = text => {
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
    let id = base, n = 2;
    while(used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };

  const list = nav.querySelector(".toc-list");
  const links = new Map();
  headings.forEach(h => {
    if(!h.id) h.id = slug(h.textContent);
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.textContent;
    li.appendChild(a);
    list.appendChild(li);
    links.set(h, a);
  });
  nav.classList.add("toc-ready");

  if(!("IntersectionObserver" in window)) return;
  let current = null;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting) current = e.target; });
    links.forEach((a, h) => a.classList.toggle("active", h === current));
  }, { rootMargin: "0px 0px -70% 0px" });
  headings.forEach(h => observer.observe(h));
})();
