-- Made-up sensors for the demo office in src/svg/demoPlan.ts.
CREATE TABLE climate.sensors
(
    sensor String,
    location String,
    base_temperature Float64,
    base_humidity Float64,
    temperature_limits String,
    humidity_limits String,
    -- Minutes since the sensor last reported; 0 means it is live.
    silent_for UInt32
)
ENGINE = MergeTree
ORDER BY sensor;

INSERT INTO climate.sensors VALUES
    ('n-01', 'Office A', 22.0, 45, '', '', 0),
    ('n-02', 'Office B', 25.8, 52, '', '', 0),
    ('n-03', 'Meeting room', 23.5, 57, '', '', 0),
    ('n-04', 'Server room', 27.5, 38, '16-28', '20-55', 0),
    ('n-05', 'Lobby', 19.5, 40, '', '', 0),
    ('n-06', 'Lab 1', 21.0, 46, '20-22', '40-50', 0),
    ('n-07', 'Lab 2', 23.0, 63, '', '', 0),
    ('n-08', 'Storage', 20.0, 35, '', '', 90);

-- One reading per sensor per minute for the last 24 hours, following a slow daily wave.
CREATE VIEW climate.readings AS
SELECT
    toDateTime(intDiv(toUnixTimestamp(now()), 60) * 60 - number * 60) AS time,
    sensor,
    location,
    round(base_temperature + 1.5 * sin(toUnixTimestamp(time) / 7200 + cityHash64(sensor) % 7), 2) AS temperature,
    round(base_humidity + 4 * cos(toUnixTimestamp(time) / 5400 + cityHash64(sensor) % 5), 1) AS humidity,
    temperature_limits,
    humidity_limits
FROM climate.sensors
CROSS JOIN numbers(1440) AS n
WHERE number >= silent_for;
