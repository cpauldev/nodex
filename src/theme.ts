/**
 * Theme management utilities
 * Handles theme persistence, resolution, and application
 */

import type { ThemeChoice } from "./types";

export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "nodex-theme";

/**
 * Resolves a theme choice to an actual theme
 */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

/**
 * Applies a theme to the document
 */
export function applyTheme(choice: ThemeChoice): void {
  const resolved = resolveTheme(choice);
  document.documentElement.dataset.theme = resolved;
}

/**
 * Gets the saved theme choice from storage
 */
export function getSavedTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // localStorage may not be available
  }
  return "system";
}

/**
 * Saves the theme choice to storage
 */
export function saveTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // localStorage may not be available
  }
}

/**
 * Initializes theme on page load (call before React hydrates)
 */
export function initTheme(): void {
  const choice = getSavedTheme();
  applyTheme(choice);
}
