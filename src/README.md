# Climate Floor Map

Colours the rooms of a floor plan by their live temperature and humidity.

1. Paste an SVG floor plan into the panel options. Label each room shape `Room name [zone]` in Inkscape (or add `data-zone="Room name"`).
2. Run a query that returns sensor readings: one row per reading, one series per sensor, or a ready-made 0–100 index per sensor.
3. Bind each zone to a sensor in **Zone bindings**.

Hover a room for its readings, comfort band and status index. Set a detail link to make rooms clickable.

Full documentation, demo and source: https://github.com/dkhoa-dev/grafana-floor-panel
