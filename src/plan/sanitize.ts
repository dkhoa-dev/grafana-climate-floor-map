import createDOMPurify from 'dompurify';

/**
 * A private DOMPurify instance, so the hooks below never affect other code on the page.
 * Created lazily because the module is also imported in places without a window.
 */
let purifier: ReturnType<typeof createDOMPurify> | undefined;

const LOCAL_URL = /url\(\s*(['"]?)\s*#/i;
const ANY_URL = /url\(/i;

function isExternalReference(value: string): boolean {
  // Every url(...) in the value must point inside the document (#id).
  const parts = value.split(ANY_URL).length - 1;
  if (parts === 0) {
    return /@import/i.test(value);
  }
  const local = value.match(new RegExp(LOCAL_URL.source, 'gi'))?.length ?? 0;
  return local !== parts;
}

function getPurifier() {
  if (!purifier) {
    purifier = createDOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', (_node, data) => {
      const name = data.attrName.toLowerCase();
      const value = data.attrValue.trim();
      if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) {
        data.keepAttr = false;
        return;
      }
      if (isExternalReference(value)) {
        data.keepAttr = false;
      }
    });
  }
  return purifier;
}

/** Elements that never belong in a floor plan drawn for this panel. */
const BLOCKED_TAGS = [
  'script',
  'foreignObject',
  'iframe',
  'style',
  'image',
  'a',
  'title',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
];

/**
 * Sanitises SVG markup and returns the root <svg> element, or null when nothing usable is left.
 * Removes scripts, event handlers, foreign content, raster images, <style> blocks (they would leak
 * to the whole page), <title> (native tooltips) and every reference to an external resource.
 */
export function sanitizeSvg(markup: string): SVGSVGElement | null {
  const fragment = getPurifier().sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: BLOCKED_TAGS,
    // Inkscape clones are <use> elements. Safe here because the hook above keeps only #id references.
    ADD_TAGS: ['use'],
    ADD_ATTR: ['xlink:href'],
    RETURN_DOM_FRAGMENT: true,
  });
  const root = fragment.firstElementChild;
  return root && root.localName === 'svg' ? (root as SVGSVGElement) : null;
}
