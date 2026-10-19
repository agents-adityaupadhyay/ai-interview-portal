// Runs inline in <head> before first paint so the page never flashes the wrong
// theme. Plain module (not "use client") because the root layout imports it on
// the server. Keep the storage key and logic in sync with lib/theme.ts.
export const THEME_STORAGE_KEY = "theme";

export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
