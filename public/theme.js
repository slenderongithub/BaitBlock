// Applied synchronously in <head> before paint to avoid a theme flash (FOUC).
// Kept as an external file so the Content-Security-Policy can stay strict
// (script-src 'self'; no inline scripts).
(function () {
  try {
    var stored = localStorage.getItem("baitblock-theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
