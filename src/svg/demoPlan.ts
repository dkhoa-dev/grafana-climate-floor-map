/** A small made-up office floor, used as the default plan and in the demo dashboard. */
export const DEMO_FLOOR_PLAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480">
  <g fill="none" stroke="#8e8e8e" stroke-width="1.5" stroke-dasharray="6 4">
    <rect x="20" y="200" width="760" height="60"/>
  </g>
  <g fill="#cfd6de" fill-opacity="0.35" stroke="#5c6670" stroke-width="3">
    <rect data-room="Office A" x="20" y="20" width="200" height="180"/>
    <rect data-room="Office B" x="220" y="20" width="180" height="180"/>
    <rect data-room="Meeting room" x="400" y="20" width="160" height="180"/>
    <rect data-room="Server room" x="560" y="20" width="100" height="180"/>
    <rect data-room="Storage" x="660" y="20" width="120" height="180"/>
    <polygon data-room="Lobby" points="20,260 260,260 260,380 180,380 180,460 20,460"/>
    <rect data-room="Lab 1" x="260" y="260" width="260" height="200"/>
    <rect data-room="Lab 2" x="520" y="260" width="260" height="200"/>
  </g>
  <text x="400" y="236" text-anchor="middle" font-size="14" fill="#8e8e8e" font-family="sans-serif">Corridor</text>
</svg>`;
