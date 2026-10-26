# Climate Floor Map

A Grafana panel plugin that draws a floor plan from SVG and colours each room by its live temperature and humidity, judged against that sensor's own limits.

![Status and temperature views of the demo floor plan](src/img/screenshot.png)

- **Any floor plan.** Draw it in any vector editor and tag the room shapes. The markup is sanitised before it is shown.
- **Any data source.** It reads plain tables (one row per reading) and per-sensor series (InfluxDB/Flux, Prometheus-style labels). Field names are detected automatically or set by hand.
- **Status at a glance.** Each room is _within limits_, _near a limit_, _out of limits_, _offline_ (no recent reading) or _no sensor_. You can also colour rooms by where the temperature or humidity sits inside its band.
- **Per-sensor limits.** Limits can come with the data (`18-26`, or separate min/max columns). The panel defaults apply when the data has none.
- **Bind sensors to rooms** by name automatically, or pick one per room in the options pane.
- **Hover** for the full reading. **Click** a room to open a URL built from dashboard variables plus `${room}`, `${sensor}` and `${location}`. Rooms are keyboard-focusable when a link is set.

## Floor plan

You do not have to write SVG by hand. Under **Plan drawing** in the panel options:

- **Edit floor plan** opens a drawing editor. Drag to draw rectangles, or click corners to draw a polygon. Move rooms, resize them by their corners, drag polygon vertices, and rename or duplicate rooms. Shapes snap to a grid (hold Alt to place freely). Ctrl+Z undoes, Delete removes, arrows nudge.
- **Generate from data** creates one room for each sensor location in the query result and lays them out as a grid. Rearrange the rooms in the editor to match the building. Because the names match the sensors, they bind automatically.
- **AI assistant** (in the editor sidebar) asks Claude to draw the plan:
  - from a description ("open office on the left, three meeting rooms along the top…"),
  - by tracing an image or PDF of an existing floor plan, or
  - with **Fix format**, by rewriting a pasted SVG into the format the panel expects (rooms as `rect`/`polygon` with `data-room`, no transforms or text labels).

  The result replaces the canvas, and Ctrl+Z brings the previous plan back. Pick the provider under **Settings** in the assistant:

  | Provider                    | Reads             | Notes                                                                                                                                                    |
  | --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Claude (Anthropic API)      | text, images, PDF | Default, `claude-opus-5-5`. Refused requests are retried on a fallback model.                                                                            |
  | Claude on Microsoft Foundry | text, images, PDF | Your Foundry resource name and model deployment.                                                                                                         |
  | OpenAI-compatible           | text, images      | Presets for OpenAI, OpenRouter and DeepSeek (text only), or any custom base URL such as Ollama or LM Studio. The model list is loaded from the endpoint. |
  | Grafana LLM app             | text              | Uses the provider your Grafana admin configured in the [Grafana LLM app](https://grafana.com/grafana/plugins/grafana-llm-app/). Keys stay on the server. |

  The first three call the provider directly from your browser with your own API key. The key stays in your browser (remembered in local storage only if you tick the box) and is never written to the dashboard. The endpoint must accept browser requests (CORS), and if Grafana sets a content security policy, `connect-src` must allow it. OpenAI and OpenRouter accept browser requests. If an endpoint does not, use the Grafana LLM app.

- **SVG source** still accepts pasted markup.

![The floor plan editor](docs/img/editor.png)

### SVG format

Any element with a `data-room` attribute, or an id of the form `room-<name>`, is a room:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <rect data-room="Lab 1" x="0" y="0" width="200" height="200"/>
  <polygon id="room-Office" points="200,0 400,0 400,200 200,200"/>
</svg>
```

The panel writes the room name and its values at the centre of each shape, so the plan does not need text labels. Scripts, event handlers, `<foreignObject>`, `<style>`, `<image>`, links and animations are removed, and so is any attribute that would make the browser fetch something: a link to another document, or CSS such as `url(https://…)`, `image-set()` or `@import`. References inside the plan, such as `fill="url(#gradient)"` or `<use href="#shape">`, are kept. `<title>` elements are dropped so the browser's own tooltip does not cover the panel's tooltip.

The default plan is a small made-up office, so the panel shows something as soon as it is added.

## Data

The panel keeps the newest reading per sensor. It accepts two shapes, and you can mix them across queries.

**Table.** One row per reading, with a string column that names the sensor:

| time             | sensor | location | temperature | humidity | temperature_limits | humidity_limits |
| ---------------- | ------ | -------- | ----------- | -------- | ------------------ | --------------- |
| 2026-01-01 00:00 | n-01   | Office A | 22.4        | 44       | 18-26              | 30-60           |

**Series.** One numeric field per metric, with the sensor in a label (`sensor`, `sensor_id`, `device`, `device_id` or `id`) and, optionally, the location in a `location`, `room` or `place` label. If there is no such label, the frame name is used. Flux results work as they are: the metric name is taken from the `_field` label.

If you leave the field options blank, the panel recognises these names. Matching ignores case, spaces, `_`, `-` and `.`:

| Meaning           | Names                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| Sensor            | `sensor`, `sensor_id`, `device`, `device_id`, `id`                           |
| Location          | `location`, `room`, `description`, `place`                                   |
| Temperature       | `temperature`, `t`                                                           |
| Humidity          | `humidity`, `rh`                                                             |
| Limits as text    | `temperature_limits`, `humidity_limits` (`min-max`, `min..max` or `min,max`) |
| Limits as numbers | `temperature_min` / `temperature_max`, `humidity_min` / `humidity_max`       |

### ClickHouse

Works with the official [ClickHouse data source](https://grafana.com/grafana/plugins/grafana-clickhouse-datasource/) in both query formats.

**Table format, newest reading per sensor (recommended).** One row per sensor keeps the query light. A sensor that stopped reporting still has a row, so its room shows as _offline_ instead of dropping off the plan:

```sql
SELECT
  sensor,
  max(time) AS last_seen,
  argMax(location, time) AS location,
  argMax(temperature, time) AS temperature,
  argMax(humidity, time) AS humidity,
  argMax(temperature_limits, time) AS temperature_limits,
  argMax(humidity_limits, time) AS humidity_limits
FROM readings
WHERE time > now() - INTERVAL 1 DAY
GROUP BY sensor
```

Alias the newest time to anything other than the source column name (`last_seen` here). Otherwise ClickHouse reads `time` inside `argMax` and `WHERE` as `max(time)` and rejects the query.

**Time series format.** The data source turns text columns such as `location` and `temperature_limits` into labels on each value series. The panel reads the sensor, location and limits from those labels. With `$__timeFilter(time)`, a sensor that sent nothing inside the time range is missing from the result. Its room then shows _no sensor_, unless you chose that sensor for the room under **Rooms**, in which case it shows _offline_.

![The ClickHouse demo dashboard: table format on the left, time series format on the right](docs/img/clickhouse.png)

## How a room gets its colour

1. **Find the sensor.** A sensor picked under _Rooms → Sensor per room_ wins. Otherwise, with _Auto-bind by name_ on, the room uses the sensor whose location (or, failing that, id) matches the room name. A sensor bound to another room is never auto-bound.
2. **Offline check.** The room is _offline_ when its newest reading is older than _Offline after_ (default `15m`), counted back from the end of the dashboard time range. A room whose chosen sensor is missing from the query result entirely is offline too.
3. **Grade each metric.** A value outside its band is _out of limits_. A value inside the band but within the _warning margin_ of either edge is _near a limit_. The margin defaults to 10 % of the band width on each side. The room takes the worse of its temperature and humidity grades.
4. **Paint.** In _Status_ mode, the grade picks green, orange or red. In _Temperature_ or _Humidity_ mode, the colour runs blue → green → orange across the band, dark blue below it and red above it. Colour changes fade over about a second.

## Options

| Group        | Option                                           | Default     |
| ------------ | ------------------------------------------------ | ----------- |
| Plan drawing | Plan                                             | demo office |
| Data         | Sensor / location / temperature / humidity field | auto        |
| Data         | Offline after                                    | `15m`       |
| Limits       | Temperature min / max                            | 18 / 27 °C  |
| Limits       | Humidity min / max                               | 30 / 60 %RH |
| Limits       | Warning margin                                   | 10 %        |
| Display      | Colour rooms by                                  | Status      |
| Display      | Show values in rooms, decimals, show legend      | on, 1, on   |
| Rooms        | Auto-bind by name, sensor per room               | on, none    |
| Room link    | URL, open in new tab                             | none, off   |

## Development

Requires Node 22 and Docker.

```bash
npm install
npm run dev          # build and watch
npm run server       # Grafana with the plugin and a demo dashboard at http://localhost:3000
npm run test:ci      # unit tests
npm run lint && npm run typecheck
npm run e2e          # Playwright against the running Grafana
```

Two demo dashboards are provisioned:

- `provisioning/dashboards/dashboard.json` uses TestData with fixed readings, so it shows every status without any database.
- `provisioning/dashboards/clickhouse.json` queries a ClickHouse container that `npm run server` starts alongside Grafana. `dev/clickhouse/init.sql` creates made-up sensors and a view that generates a reading per minute up to `now()`, so the plan stays live; one sensor stops reporting 90 minutes back. Grafana installs the ClickHouse data source on start, which needs access to grafana.com.

Requires Grafana 13.2 or later.

## License

MIT, see [LICENSE](LICENSE).
