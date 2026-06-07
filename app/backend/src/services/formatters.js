export function labelize(value = '') {
  return String(value)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

export function average(values) {
  const usable = values.filter((value) => Number.isFinite(Number(value)));
  if (!usable.length) return 0;
  return Math.round(usable.reduce((sum, value) => sum + Number(value), 0) / usable.length);
}

export function stateFromScore(score, inverse = false) {
  const value = Number(score) || 0;
  if (inverse) {
    if (value >= 75) return 'Success';
    if (value >= 50) return 'Warning';
    return 'Error';
  }
  if (value >= 75) return 'Error';
  if (value >= 55) return 'Warning';
  return 'Success';
}
