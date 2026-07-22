import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DisableMobileLayoutZoom } from "./disable-mobile-layout-zoom";

describe("DisableMobileLayoutZoom", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks multi-touch page zoom and leaves map gestures alone", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const { unmount } = render(<DisableMobileLayoutZoom />);

    expect(addSpy).toHaveBeenCalledWith(
      "gesturestart",
      expect.any(Function),
      expect.objectContaining({ passive: false }),
    );
    expect(addSpy).toHaveBeenCalledWith(
      "touchmove",
      expect.any(Function),
      expect.objectContaining({ passive: false }),
    );

    const touchMove = addSpy.mock.calls.find(
      ([type]) => type === "touchmove",
    )?.[1] as (event: TouchEvent) => void;

    const pageEvent = {
      touches: [{}, {}],
      target: document.body,
      preventDefault: vi.fn(),
    } as unknown as TouchEvent;
    touchMove(pageEvent);
    expect(pageEvent.preventDefault).toHaveBeenCalled();

    const map = document.createElement("div");
    map.className = "mapboxgl-map";
    document.body.append(map);
    const mapEvent = {
      touches: [{}, {}],
      target: map,
      preventDefault: vi.fn(),
    } as unknown as TouchEvent;
    touchMove(mapEvent);
    expect(mapEvent.preventDefault).not.toHaveBeenCalled();
    map.remove();

    unmount();
  });
});
