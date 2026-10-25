import { buildDetailLink, isSafeLink } from './zoneLink';

const passThrough = (text: string) => text;

describe('buildDetailLink', () => {
  it('returns nothing without a template', () => {
    expect(buildDetailLink('  ', { zone: 'Lab 1' }, passThrough)).toBeUndefined();
  });

  it('URL-encodes zone, sensor and label tokens', () => {
    const url = buildDetailLink(
      '/d/zone-detail?var-zone=${__zone.name}&var-sensor=${__zone.sensor}&title=${__zone.label}',
      { zone: 'Store B.2 & co', sensorKey: 'sensor/01', sensorLabel: 'North bench #2' },
      passThrough
    );
    expect(url).toBe(
      '/d/zone-detail?var-zone=Store%20B.2%20%26%20co&var-sensor=sensor%2F01&title=North%20bench%20%232'
    );
  });

  it('falls back to the sensor key for the label token', () => {
    expect(buildDetailLink('/x?l=${__zone.label}', { zone: 'Z', sensorKey: 's1' }, passThrough)).toBe('/x?l=s1');
  });

  it('interpolates dashboard variables after the zone tokens, and a value cannot inject a variable', () => {
    const replaceVariables = jest.fn((text: string) =>
      text.replace('${__url_time_range}', 'from=1&to=2').replace('$site', 'north')
    );
    const url = buildDetailLink(
      '/d/x?${__url_time_range}&s=$site&z=${__zone.name}',
      { zone: '$site' },
      replaceVariables
    );
    expect(replaceVariables).toHaveBeenCalledWith('/d/x?${__url_time_range}&s=$site&z=%24site');
    expect(url).toBe('/d/x?from=1&to=2&s=north&z=%24site');
  });

  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,hi',
    'vbscript:x',
    'file:///etc/passwd',
  ])('refuses %p', (template) => {
    expect(buildDetailLink(template, { zone: 'Z' }, passThrough)).toBeUndefined();
  });

  it('refuses a link that only becomes unsafe after variable interpolation', () => {
    expect(buildDetailLink('$target', { zone: 'Z' }, () => 'javascript:alert(1)')).toBeUndefined();
  });

  it.each(['https://example.org/a', 'http://example.org', '/d/abc', '../d/abc', '//example.org/x', '?var-a=1'])(
    'allows %p',
    (url) => {
      expect(isSafeLink(url)).toBe(true);
    }
  );
});
