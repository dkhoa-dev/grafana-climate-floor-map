/**
 * Builds a plan close to the largest real-world size the panel must handle: about 1.1 MB of
 * Inkscape-style markup, 40 zones and about 260 text spans, padded with furniture paths.
 */
export function buildBigPlan(): { markup: string; zones: string[] } {
  const zones: string[] = [];
  const parts: string[] = [];
  let spans = 0;
  for (let i = 0; i < 40; i++) {
    const zone = `Room ${String(i + 1).padStart(2, '0')}`;
    zones.push(zone);
    const x = (i % 8) * 150;
    const y = Math.floor(i / 8) * 150;
    parts.push(
      `<rect id="z${i}" inkscape:label="${zone} [zone]" x="${x}" y="${y}" width="140" height="140" style="fill:#eeeeee;stroke:#333333;stroke-width:2"/>`,
      `<text id="n${i}" inkscape:label="${zone} [zone title]" x="${x + 6}" y="${y + 18}"><tspan sodipodi:role="line" x="${x + 6}" y="${y + 18}">${zone}</tspan></text>`,
      `<text id="v${i}" inkscape:label="${zone} [zone readout]" x="${x + 70}" y="${y + 80}"><tspan sodipodi:role="line" x="${x + 70}" y="${y + 80}">-</tspan></text>`
    );
    spans += 2;
    for (let d = 0; d < 4; d++) {
      parts.push(
        `<text id="d${i}-${d}" x="${x + 10}" y="${y + 40 + d * 20}"><tspan sodipodi:role="line">desk ${d + 1}</tspan></text>`
      );
      spans++;
    }
  }
  for (let t = spans; t < 260; t++) {
    parts.push(`<text id="s${t}" x="5" y="${t}"><tspan sodipodi:role="line">note ${t}</tspan></text>`);
  }
  let furniture = 0;
  const body = () => parts.join('\n').length;
  while (body() < 1_100_000) {
    const points = Array.from(
      { length: 40 },
      (_, k) => `${(furniture * 7 + k * 13) % 1200},${(furniture * 11 + k * 17) % 750}`
    ).join(' L ');
    parts.push(`<path id="f${furniture}" d="M ${points} Z" style="fill:none;stroke:#999999;stroke-width:0.5"/>`);
    furniture++;
  }
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="1200" height="750" viewBox="0 0 1200 750">\n${parts.join('\n')}\n</svg>`;
  return { markup, zones };
}
