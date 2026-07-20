import { describe, it, expect } from "vitest";
import { indexAmong } from "../../src/composables/sortable";

/**
 * The bug this guards: SortableJS reports `oldIndex`/`newIndex` counting *every*
 * element sibling, including a list's non-draggable header row. In the editor rail
 * each area's `<ol>` starts with a `.railhead` `<li>`, so every module's index came
 * out one too high and the drop spliced the wrong module. `indexAmong` counts only
 * siblings matching the draggable selector, so the index lines up with the array.
 */
describe("indexAmong", () => {
  function list(): HTMLOListElement {
    const ol = document.createElement("ol");
    ol.innerHTML = `
      <li class="railhead">Code /code</li>
      <li class="modrow" data-id="a">A</li>
      <li class="modrow" data-id="b">B</li>
      <li class="modrow" data-id="c">C</li>
    `;
    return ol;
  }

  it("counts only draggable rows, skipping the header", () => {
    const ol = list();
    const rows = [...ol.querySelectorAll<HTMLElement>(".modrow")];
    // Without the selector fix, A would report 1 (the header ahead of it).
    expect(indexAmong(rows[0]!, ".modrow")).toBe(0);
    expect(indexAmong(rows[1]!, ".modrow")).toBe(1);
    expect(indexAmong(rows[2]!, ".modrow")).toBe(2);
  });

  it("without a selector, counts every sibling (the SortableJS default)", () => {
    const ol = list();
    const rows = [...ol.querySelectorAll<HTMLElement>(".modrow")];
    // The header counts here — which is exactly the off-by-one we avoid by passing
    // the selector.
    expect(indexAmong(rows[0]!)).toBe(1);
    expect(indexAmong(rows[2]!)).toBe(3);
  });

  it("ignores a trailing non-draggable empty-state row too", () => {
    const ol = document.createElement("ol");
    ol.innerHTML = `
      <li class="railhead">Home /home</li>
      <li class="modrow" data-id="only">Only</li>
      <li class="dropzone">empty — drop here</li>
    `;
    const only = ol.querySelector<HTMLElement>(".modrow")!;
    expect(indexAmong(only, ".modrow")).toBe(0);
  });
});
