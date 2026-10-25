/**
 * CSS functions that can make the browser load a resource. Vendor-prefixed forms such as
 * -webkit-image-set( and -webkit-cross-fade( end in the same names and match too.
 * url( is handled separately because url(#id) points inside the document and is safe.
 */
const LOADING_FUNCTION = /(?:image|image-set|cross-fade|element|src)\(/i;
const ANY_URL = /url\(/gi;
const LOCAL_URL = /url\(\s*(['"]?)\s*#/gi;

/** Decodes CSS escapes (`\75 rl(` is `url(`), so an escaped function name cannot hide. */
function decodeCssEscapes(value: string): string {
  return value.replace(/\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|([\s\S]))/gi, (_, hex: string, char: string) => {
    if (hex) {
      const code = parseInt(hex, 16);
      return code > 0x10ffff ? '\uFFFD' : String.fromCodePoint(code);
    }
    return char;
  });
}

/**
 * True when a CSS or attribute value could load something from outside the document:
 * any url() that is not url(#id), image(), image-set(), cross-fade(), element(), src() or @import,
 * including escaped spellings of them.
 */
export function loadsExternalResource(value: string): boolean {
  const decoded = decodeCssEscapes(value);
  if (LOADING_FUNCTION.test(decoded) || /@import/i.test(decoded)) {
    return true;
  }
  const urls = decoded.match(ANY_URL)?.length ?? 0;
  const local = decoded.match(LOCAL_URL)?.length ?? 0;
  return local !== urls;
}
