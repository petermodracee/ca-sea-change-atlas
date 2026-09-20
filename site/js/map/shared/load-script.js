/** Injects a <script> with a Subresource Integrity hash and resolves once it has loaded. */
export function loadScript({ src, integrity }){
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.integrity = integrity;
    el.crossOrigin = "";
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}
