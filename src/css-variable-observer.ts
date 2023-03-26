declare global {
  interface HTMLElementEventMap {
    [sensorChangeEventName]: CustomEvent<CssVariableChangeset>;
  }
}

export interface CssVariableChangeset {
  readonly element: HTMLElement;
  readonly variables: ReadonlyMap<string, string>;
}

export interface CssVariableChangeCallback {
  (entries: CssVariableChangeset[], observer: CssVariableObserver): void;
}

const sensorElementName = "css-sensor-ɵ";
const sensorSelector = `:scope > ${sensorElementName}`;
const sensorChangeEventName = "ɵcssvariablechange";
let nextId = 1;

export class CssVariableObserver {
  readonly #id = `${nextId++}`;
  readonly #sensors = new Set<WeakRef<HTMLSensorElement>>();
  readonly #emittableChangesets = new Set<CssVariableChangeset>();
  #globalEventController?: AbortController;

  constructor(private _callback: CssVariableChangeCallback) {}

  observe(element: HTMLElement, options: { variables: string[] }) {
    if (!this.#globalEventController) {
      this.#globalEventController = new AbortController();
      document.documentElement.addEventListener(
        sensorChangeEventName,
        (e) => this.#scheduleEmit(e),
        { signal: this.#globalEventController.signal }
      );
    }

    let sensor = element.querySelector<HTMLSensorElement>(sensorSelector);
    if (sensor) {
      sensor.variables = options.variables;
      return;
    }

    sensor = document.createElement(sensorElementName) as HTMLSensorElement;
    this.#sensors.add(new WeakRef(sensor));
    sensor.dataset.observerId = this.#id;
    sensor.variables = options.variables;
    element.appendChild(sensor);
  }

  disconnect() {
    this.#sensors.forEach((s) => s.deref()?.remove());
    this.#sensors.clear();
    this.#globalEventController?.abort();
    this.#globalEventController = undefined;
  }

  #scheduleEmit(event: CustomEvent<CssVariableChangeset>) {
    if ((event.target as HTMLSensorElement)?.dataset?.observerId !== this.#id) {
      return;
    } else if (!this.#emittableChangesets.size) {
      queueMicrotask(() => this.#emitChangesets());
    }

    this.#emittableChangesets.add(event.detail);
  }

  #emitChangesets() {
    if (!this.#emittableChangesets.size) {
      return;
    }

    const entries = Array.from(this.#emittableChangesets.values());
    this.#emittableChangesets.clear();
    this._callback(entries, this);
  }
}

type HTMLSensorElement = HTMLElement & { variables: string[] };

customElements.define(
  sensorElementName,
  class extends HTMLElement {
    readonly #emittableVariables = new Set<string>();
    readonly #container: HTMLElement;
    readonly #computedStyles: CSSStyleDeclaration;
    #controller?: AbortController;

    set variables(variables: string[]) {
      this.#container.childNodes.forEach((n) => this.#container.removeChild(n));
      for (let variable of variables) {
        const element = document.createElement("div");
        element.dataset.variable = variable;
        element.style.cssText =
          "transition: font-size 0.001ms step-start, font-variation-settings 0.001ms step-start; " +
          `font-variation-settings: "wght" var(${variable}, 0); ` +
          `font-size: var(${variable}, 0);`;
        this.#container.appendChild(element);
      }
    }

    constructor() {
      super();
      const shadowRoot = this.attachShadow({ mode: "open" });
      this.#container = shadowRoot.appendChild(document.createElement("div"));
      this.#computedStyles = getComputedStyle(this);
    }

    connectedCallback() {
      if (!this.isConnected) {
        return;
      }

      this.style.cssText =
        "position: absolute; " +
        "width: 0; " +
        "height: 0; " +
        "overflow: hidden; " +
        "z-index: -1; " +
        "visibility: hidden;";

      this.#controller = new AbortController();
      this.#container.addEventListener(
        "transitionstart",
        (e) => this.#scheduleEmit(e),
        { signal: this.#controller.signal }
      );
    }

    disconnectedCallback() {
      this.#controller?.abort();
    }

    #scheduleEmit(event: TransitionEvent) {
      const variable = (event.composedPath()[0] as HTMLElement).dataset
        .variable;
      if (!variable) {
        return;
      } else if (!this.#emittableVariables.size) {
        setTimeout(() => this.#emitVariables());
      }

      this.#emittableVariables.add(variable);
    }

    #emitVariables() {
      if (!this.#emittableVariables.size) {
        return;
      }

      const changeset = new Map<string, string>();
      this.#emittableVariables.forEach((v) =>
        changeset.set(v, this.#computedStyles.getPropertyValue(v))
      );
      this.#emittableVariables.clear();

      const detail: CssVariableChangeset = Object.freeze({
        element: this.parentElement!,
        variables: changeset,
      });
      this.dispatchEvent(
        new CustomEvent(sensorChangeEventName, {
          bubbles: true,
          composed: true,
          detail,
        })
      );
    }
  }
);
