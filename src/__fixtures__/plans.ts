/** Small hand-written plans for tests. Names are deliberately awkward. */
export const INKSCAPE_PLAN = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
  width="200" height="100">
  <sodipodi:namedview id="view1" pagecolor="#ffffff"/>
  <title>Test floor</title>
  <g inkscape:label="Rooms" inkscape:groupmode="layer" id="layer1">
    <rect id="r1" inkscape:label="Lab 1 [zone]" x="0" y="0" width="100" height="100" style="fill:#dddddd;stroke:#000000"/>
    <rect id="r2" inkscape:label="Store B.2 (cold) [zone]" x="100" y="0" width="100" height="50" style="fill:#eeeeee"/>
    <rect id="r3" inkscape:label="Store B.2 (cold) [zone]" x="100" y="50" width="100" height="50" style="fill:#eeeeee"/>
    <text id="t1" inkscape:label="Lab 1 [zone title]" x="10" y="20"><tspan sodipodi:role="line" x="10" y="20">Lab 1</tspan></text>
    <text id="t2" inkscape:label="Lab 1 [zone readout]" x="10" y="60"><tspan sodipodi:role="line" x="10" y="60">--</tspan></text>
    <rect id="decor" x="0" y="0" width="5" height="5" style="fill:#000000"/>
  </g>
</svg>`;

export const ATTRIBUTE_PLAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10">
  <rect data-zone="Meeting &amp; Focus" x="0" y="0" width="10" height="10"/>
  <rect data-zone="Server room" x="10" y="0" width="10" height="10"/>
  <text data-zone-readout="Server room" x="12" y="5">x</text>
  <rect data-zone="Lobby" x="20" y="0" width="10" height="10"/>
</svg>`;
