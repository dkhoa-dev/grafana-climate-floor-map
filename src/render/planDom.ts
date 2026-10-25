import { READOUT_ATTR, TITLE_ATTR, ZONE_ATTR } from '../plan/preparePlan';
import { sameVisual, ZoneVisual } from './zoneStates';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'paint-order', 'stroke-linejoin'] as const;

type SavedStyle = Record<(typeof STYLE_PROPS)[number], [string, string]>;

interface ZoneElements {
  shapes: SVGElement[];
  titles: SVGElement[];
  readouts: SVGElement[];
}

/**
 * Live handle on the plan inserted into the page. Remembers each element's original look so
 * a zone that loses its binding returns to the plan's own style, and remembers the last visual
 * per zone so a refresh only touches zones that changed.
 */
export class PlanDom {
  private zones = new Map<string, ZoneElements>();
  private savedStyles = new Map<SVGElement, SavedStyle>();
  private savedText = new Map<SVGElement, Node[]>();
  private applied = new Map<string, ZoneVisual>();
  /** Number of zones whose DOM was written by the last apply; used by tests and the perf check. */
  lastWrites = 0;

  constructor(root: Element) {
    const collect = (attr: string, key: keyof ZoneElements) => {
      root.querySelectorAll<SVGElement>(`[${attr}]`).forEach((el) => {
        const zone = el.getAttribute(attr)!;
        const entry = this.zones.get(zone) ?? { shapes: [], titles: [], readouts: [] };
        entry[key].push(el);
        this.zones.set(zone, entry);
      });
    };
    collect(ZONE_ATTR, 'shapes');
    collect(TITLE_ATTR, 'titles');
    collect(READOUT_ATTR, 'readouts');
  }

  /** Applies visuals; zones whose visual did not change are not touched. */
  apply(visuals: Map<string, ZoneVisual>, clickable: boolean) {
    this.lastWrites = 0;
    for (const [zone, elements] of this.zones) {
      const visual = visuals.get(zone) ?? { status: 'unbound', label: `${zone}: no sensor bound` };
      const previous = this.applied.get(zone);
      if (sameVisual(previous, visual) && elements.shapes[0]?.hasAttribute('tabindex') === clickable) {
        continue;
      }
      this.lastWrites++;
      this.applied.set(zone, visual);
      for (const shape of elements.shapes) {
        this.paintShape(shape, visual, clickable);
      }
      for (const title of elements.titles) {
        this.paintText(title, visual.titleColor, visual.textHalo);
      }
      for (const readout of elements.readouts) {
        this.writeReadout(readout, visual);
      }
    }
  }

  private save(el: SVGElement) {
    if (!this.savedStyles.has(el)) {
      const saved = {} as SavedStyle;
      for (const prop of STYLE_PROPS) {
        saved[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
      }
      this.savedStyles.set(el, saved);
    }
  }

  private restore(el: SVGElement, props: ReadonlyArray<(typeof STYLE_PROPS)[number]>) {
    const saved = this.savedStyles.get(el);
    if (!saved) {
      return;
    }
    for (const prop of props) {
      const [value, priority] = saved[prop];
      if (value) {
        el.style.setProperty(prop, value, priority);
      } else {
        el.style.removeProperty(prop);
      }
    }
  }

  private paintShape(shape: SVGElement, visual: ZoneVisual, clickable: boolean) {
    this.save(shape);
    shape.setAttribute('data-cfm-status', visual.status);
    shape.setAttribute('aria-label', visual.label);
    if (visual.fill === undefined) {
      this.restore(shape, ['fill', 'fill-opacity']);
    } else {
      shape.style.setProperty('fill', visual.fill);
      shape.style.setProperty('fill-opacity', String(visual.fillOpacity ?? 1));
    }
    if (clickable) {
      shape.setAttribute('tabindex', '0');
      shape.setAttribute('role', 'link');
    } else {
      shape.removeAttribute('tabindex');
      shape.setAttribute('role', 'img');
    }
  }

  private paintText(el: SVGElement, color: string | undefined, halo: string | undefined) {
    this.save(el);
    if (color === undefined) {
      this.restore(el, ['fill', 'stroke', 'stroke-width', 'paint-order', 'stroke-linejoin']);
      return;
    }
    el.style.setProperty('fill', color);
    // A thin halo in the background colour keeps text readable on any zone fill.
    el.style.setProperty('stroke', halo ?? 'none');
    el.style.setProperty('stroke-width', '0.18em');
    el.style.setProperty('paint-order', 'stroke');
    el.style.setProperty('stroke-linejoin', 'round');
  }

  private writeReadout(el: SVGElement, visual: ZoneVisual) {
    if (!this.savedText.has(el)) {
      this.savedText.set(
        el,
        Array.from(el.childNodes).map((node) => node.cloneNode(true))
      );
    }
    if (visual.readout === undefined) {
      el.replaceChildren(...(this.savedText.get(el) ?? []).map((node) => node.cloneNode(true)));
      this.paintText(el, undefined, undefined);
      el.removeAttribute('data-cfm-status');
      return;
    }
    const anchor = (this.savedText.get(el) ?? []).find(
      (node): node is Element => node.nodeType === 1 && (node as Element).hasAttribute('x')
    );
    const x = el.getAttribute('x') ?? anchor?.getAttribute('x') ?? '0';
    const y = el.getAttribute('y') ?? anchor?.getAttribute('y') ?? '0';
    const lines = visual.readout.map((text, i) => {
      const tspan = el.ownerDocument.createElementNS(SVG_NS, 'tspan');
      tspan.setAttribute('x', x);
      if (i === 0) {
        tspan.setAttribute('y', y);
      } else {
        tspan.setAttribute('dy', '1.2em');
      }
      tspan.textContent = text;
      return tspan;
    });
    el.replaceChildren(...lines);
    el.setAttribute('data-cfm-status', visual.status);
    this.paintText(el, visual.titleColor, visual.textHalo);
  }
}

/** Finds the zone under an event target: its shape, its title or its readout text. */
export function zoneFromTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }
  const hit = target.closest(`[${ZONE_ATTR}],[${TITLE_ATTR}],[${READOUT_ATTR}]`);
  if (!hit) {
    return undefined;
  }
  return hit.getAttribute(ZONE_ATTR) ?? hit.getAttribute(TITLE_ATTR) ?? hit.getAttribute(READOUT_ATTR) ?? undefined;
}
