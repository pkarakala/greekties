// Reproducible WCAG relative-luminance measurements using actual theme tokens.
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../../theme/colors.ts'), 'utf8');
const tokens = Object.fromEntries([...source.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
function rgb(value, background = tokens.background) {
  if (value.startsWith('#')) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b, a] = value.match(/[0-9.]+/g).map(Number);
  return [r, g, b].map((v, i) => v / 255 * a + rgb(background)[i] * (1 - a));
}
function luminance(color) {
  return color.reduce((total, v, i) => total + [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), 0);
}
function ratio(a, b) {
  const [low, high] = [luminance(rgb(tokens[a])), luminance(rgb(tokens[b]))].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}
const backgrounds = ['background', 'surface', 'surfaceHover', 'goldSoft'];
for (const foreground of ['navy', 'gold', 'textSecondary', 'textTertiary', 'red', 'green', 'blue', 'borderStrong']) {
  const minimum = foreground === 'borderStrong' ? 3 : 4.5;
  const measurements = backgrounds.map((background) => {
    const contrast = ratio(foreground, background);
    if (contrast < minimum) throw new Error(`${foreground}/${background} below ${minimum}: ${contrast}`);
    return `${background} ${contrast.toFixed(2)}:1`;
  });
  console.log(`${foreground}: ${measurements.join('; ')}`);
}
console.log(`cream on navy: ${ratio('cream', 'navy').toFixed(2)}:1`);
