# Changelog

## 0.1.0 (2026-10-26)

First version of Sensor Floor Map.

- SVG floor plans with rooms tagged by `data-room` or a `room-` id, sanitised before display.
- Any metric: every numeric field is one, with units, decimals and limits from Grafana's field config and overrides. Temperature, humidity, CO₂, PM2.5 and PM10 have built-in defaults. A Metrics option picks and orders them.
- Reads tables and labelled series (including Flux), with field auto-detection. Limits can also come with the data per sensor, as text (`18-26`) or min/max columns, one-sided or both.
- Room status: within limits, near a limit, out of limits, offline, no sensor. Rooms can also be coloured by where any metric sits inside its band.
- Auto-binding by name, or a sensor chosen for each room in the options pane.
- Hover tooltip, in-room values, legend and a configurable click-through link.
- Floor plan editor: draw and edit rectangle and polygon rooms with grid snapping and undo, or generate rooms from the sensor locations in the data.
- AI assistant in the editor: draw a plan from a description, trace an image or PDF, or fix an SVG's format, using Claude (Anthropic API or Microsoft Foundry), an OpenAI-compatible endpoint (OpenAI, OpenRouter, DeepSeek, custom) or the Grafana LLM app.
- ClickHouse support in both table and time series formats, with a demo service, dashboard and documented queries.
