"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const themeChangeEvent = "trailie-theme-change";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(themeChangeEvent));
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener(themeChangeEvent, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(themeChangeEvent, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    () => "light",
  );

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("trailie-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      applyTheme(storedTheme);
    }
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    window.localStorage.setItem("trailie-theme", nextTheme);
  }

  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="border-border bg-background text-foreground hover:bg-subtle focus-visible:ring-ring focus-visible:ring-offset-background inline-flex size-10 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      {theme === "light" ? (
        <Moon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      ) : (
        <Sun aria-hidden="true" className="size-4" strokeWidth={1.75} />
      )}
    </button>
  );
}
