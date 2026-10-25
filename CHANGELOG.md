# Changelog

## 0.1.0 (Unreleased)

First version of Climate Floor Map.

- SVG floor plans with rooms tagged by `data-room` or a `room-` / `room:` id, sanitised before display.
- Reads tables and labelled series (including Flux), with field auto-detection and per-sensor limits from the data.
- Room status: within limits, near a limit, out of limits, offline, no sensor. Optional colouring by temperature or humidity band position.
- Auto-binding by name and a per-room sensor picker.
- Hover tooltip, in-room values, legend and a configurable click-through link.
- Floor plan editor: draw and edit rectangle and polygon rooms with grid snapping and undo, or generate rooms from the sensor locations in the data.
- AI assistant in the editor: draw a plan from a description, trace an image or PDF, or fix an SVG's format, using Claude with the editor's own API key.
