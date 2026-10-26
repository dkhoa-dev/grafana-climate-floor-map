-- Made-up sensors for the demo office in src/svg/demoPlan.ts.
CREATE TABLE climate.sensors
(
    sensor String,
    location String,
    base_temperature Float64,
    base_humidity Float64,
    -- How far each value swings around its base, kept small enough that every room's status
    -- stays the same at any hour (the e2e tests rely on it).
    temperature_swing Float64,
    humidity_swing Float64,
    base_co2 Float64,
    temperature_limits String,
    humidity_limits String,
    -- Minutes since the sensor last reported; 0 means it is live.
    silent_for UInt32
)
ENGINE = MergeTree
ORDER BY sensor;

-- Office A, Meeting room and Lobby sit within the panel's defaults (18-27 °C, 30-60 %RH).
-- Office B is near the 27 °C default limit. Lab 1 is above its own 20-22 °C limits and Lab 2 above
-- the 60 % humidity default. Server room humidity is below the 30 % default but inside its own
-- 20-55 %, so it is only within limits when the panel reads the sensor's limits. Meeting room CO₂
-- is above the built-in 1000 ppm limit; every other room stays well below it. Storage stopped
-- reporting 90 minutes ago.
INSERT INTO climate.sensors VALUES
    ('n-01', 'Office A', 22.0, 45, 1.5, 4, 520, '', '', 0),
    ('n-02', 'Office B', 26.6, 48, 0.3, 4, 610, '', '', 0),
    ('n-03', 'Meeting room', 23.0, 50, 1.5, 4, 1200, '', '', 0),
    ('n-04', 'Server room', 24.0, 25, 1.0, 1, 450, '16-28', '20-55', 0),
    ('n-05', 'Lobby', 21.0, 40, 1.5, 4, 480, '', '', 0),
    ('n-06', 'Lab 1', 23.0, 46, 0.5, 1, 560, '20-22', '40-50', 0),
    ('n-07', 'Lab 2', 23.0, 66, 1.5, 2, 590, '', '', 0),
    ('n-08', 'Storage', 20.0, 35, 1.0, 2, 430, '', '', 90);

-- One reading per sensor per minute for the last 24 hours, following slow waves.
CREATE VIEW climate.readings AS
SELECT
    toDateTime(intDiv(toUnixTimestamp(now()), 60) * 60 - number * 60) AS time,
    sensor,
    location,
    round(base_temperature + temperature_swing * sin(toUnixTimestamp(time) / 7200 + cityHash64(sensor) % 7), 2) AS temperature,
    round(base_humidity + humidity_swing * cos(toUnixTimestamp(time) / 5400 + cityHash64(sensor) % 5), 1) AS humidity,
    round(base_co2 + 80 * sin(toUnixTimestamp(time) / 3600 + cityHash64(sensor) % 3)) AS co2,
    temperature_limits,
    humidity_limits
FROM climate.sensors
CROSS JOIN numbers(1440) AS n
WHERE number >= silent_for;
