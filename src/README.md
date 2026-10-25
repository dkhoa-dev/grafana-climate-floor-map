# Climate Floor Map

Draws a floor plan from SVG and colours each room by its live temperature and humidity, judged against that sensor's own limits.

## Features

- **Any floor plan.** Tag room shapes with `data-room="Name"`, or give them an id of `room-Name` or `room:Name`. The markup is sanitised before it is shown.
- **Any data source.** Reads tables (one row per reading, with a sensor column) and labelled series such as InfluxDB/Flux results. Field names are detected automatically or can be set by hand.
- **Status at a glance.** Each room is within limits, near a limit, out of limits, offline (no recent reading) or without a sensor. Rooms can also be coloured by where the temperature or humidity sits inside its band.
- **Per-sensor limits** from the data (`18-26`, or separate min/max columns), with panel defaults as a fallback.
- **Sensor binding** by name, or by picking a sensor for each room in the options pane.
- **Hover** for the full reading. **Click** a room to open a URL that can use dashboard variables plus `${room}`, `${sensor}` and `${location}`.

## Getting started

1. Add the panel. It shows a small demo office plan until you paste your own SVG under **Floor plan**.
2. Query your sensor data. The newest reading of each sensor is used.
3. Rooms whose name matches a sensor's location or id are bound automatically. Bind the rest under **Rooms → Sensor per room**.

Full documentation: https://github.com/dkhoa-dev/grafana-climate-floor-map#readme
