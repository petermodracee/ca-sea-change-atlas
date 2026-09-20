/** Colors a legend/panel swatch element — solid fill, or a dashed/hatched look. */
export function setSwatch(el, color, dashed){
  el.style.background = dashed
    ? `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)`
    : color;
}
