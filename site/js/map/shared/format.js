/** Locale-formatted number with a fixed decimal count, used by several popup-row builders. */
export function fmtNum(n, decimals){
  const num = Number(n);
  if(Number.isNaN(num)) return String(n);
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
