# Changelog

## 0.1.0 (Unreleased)

First version of Climate Floor Map.

- SVG floor plans with rooms tagged by `data-room` or a `room-` id, sanitised before display.
- Reads tables and labelled series (including Flux), with field auto-detection and per-sensor limits from the data.
- Room status: within limits, near a limit, out of limits, offline, no sensor. Optional colouring by temperature or humidity band position.
- Auto-binding by name, or a sensor chosen for each room in the options pane.
- Hover tooltip, in-room values, legend and a configurable click-through link.
- Floor plan editor: draw and edit rectangle and polygon rooms with grid snapping and undo, or generate rooms from the sensor locations in the data.
- AI assistant in the editor: draw a plan from a description, trace an image or PDF, or fix an SVG's format, using Claude (Anthropic API or Microsoft Foundry), an OpenAI-compatible endpoint (OpenAI, OpenRouter, DeepSeek, custom) or the Grafana LLM app.
- ClickHouse: per-sensor limits are read from labels in the time series format, a demo ClickHouse service and dashboard, and documented queries.
- A room whose chosen sensor is missing from the data shows as offline instead of without a sensor.
- Any metric, not just temperature and humidity: every numeric field is a metric, with units, decimals and limits from Grafana's field config and overrides, limits from the data per sensor, one-sided limits, a Metrics option to pick and order them, and colouring by any metric. Temperature, humidity, CO₂, PM2.5 and PM10 keep built-in defaults. The temperature/humidity field, limit and decimals panel options are replaced by the field config.
