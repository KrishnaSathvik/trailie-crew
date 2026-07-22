"use client";

import { useEffect } from "react";

function isMapGestureTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(".mapboxgl-map, .mapboxgl-canvas, [data-allow-pinch-zoom]"),
    )
  );
}

/**
 * Safari often ignores viewport user-scalable=no. Block pinch / gesture zoom
 * so the layout scale stays fixed on mobile while scrolling still works.
 * Map canvases are exempt so Plan map pinch-zoom keeps working.
 */
export function DisableMobileLayoutZoom() {
  useEffect(() => {
    const preventGesture = (event: Event) => {
      if (isMapGestureTarget(event.target)) return;
      event.preventDefault();
    };

    const preventMultiTouchScroll = (event: TouchEvent) => {
      if (event.touches.length <= 1) return;
      if (isMapGestureTarget(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener("gesturestart", preventGesture, {
      passive: false,
    });
    document.addEventListener("gesturechange", preventGesture, {
      passive: false,
    });
    document.addEventListener("gestureend", preventGesture, { passive: false });
    document.addEventListener("touchmove", preventMultiTouchScroll, {
      passive: false,
    });

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("gestureend", preventGesture);
      document.removeEventListener("touchmove", preventMultiTouchScroll);
    };
  }, []);

  return null;
}
