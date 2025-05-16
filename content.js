"use strict";

/******************************************************************************
 * Zillow Save-Ratio  |  content.js  |  Manifest V3
 * v2025-05-15-robust – floating first, then docks in sidebar when ready
 ******************************************************************************/

/* --------- styled, filterable console logging --------- */
const DEBUG = true;
const TAG   = "background:#0077C8;color:#fff;padding:2px 6px;border-radius:3px";
const log   = (...m) => DEBUG && console.log("%c[ZSR]", TAG, ...m);

/* --------- save-ratio thresholds --------- */
const THRESHOLDS = [
  { min: 0.12, label: "Quick sale (likely multiple offers)", color: "#27ae60" },
  { min: 0.10, label: "Strong listing (1st-week sale)",       color: "#2ecc71" },
  { min: 0.05, label: "Average (1–4 wks on market)",          color: "#f39c12" },
  { min: 0.00, label: "⚠ Trouble (<5 %)",                     color: "#e74c3c" }
];

/* --------- URL watcher (handles SPA navigation) --------- */
let lastURL = "";
setInterval(() => {
  if (location.href === lastURL) return;
  lastURL = location.href;

  if (/_zpid\/?$/.test(location.pathname)) {
    log("new listing detected → boot");
    bootForListing();
  } else {
    log("left listing → remove badge");
    document.getElementById("zsr-widget")?.remove();
  }
}, 400);

/* --------- main flow for a single listing --------- */
function bootForListing() {
  document.getElementById("zsr-widget")?.remove();      // reset

  /* poll up to 10 × 300 ms for the metrics */
  let tries = 0;
  const poll = setInterval(() => {
    const m = scrapeMetrics();
    if (m) {
      clearInterval(poll);
      renderBadge(m);
    } else if (++tries >= 10) {
      clearInterval(poll);
      log("metrics not found after polling");
    }
  }, 300);
}

/* --------- render badge (floating first, then dock) --------- */
function renderBadge({ views, saves }) {
  const ratio = saves / views;
  const tier  = THRESHOLDS.find(t => ratio >= t.min);

  const badge = document.createElement("div");
  badge.id    = "zsr-widget";
  badge.innerHTML =
    `<strong>${(ratio * 100).toFixed(1)}%</strong><br>${tier.label}`;
  badge.style.cssText = `
    --zsr-color:${tier.color};
    position:fixed; top:12px; right:12px; z-index:99999;
    background:var(--zsr-color); color:#fff;
    padding:.55em .85em; border-radius:7px;
    font:14px/1.35 Arial,sans-serif; text-align:center;
    max-width:220px; box-shadow:0 2px 6px rgba(0,0,0,.25);
    transition:opacity .2s ease`;
  document.body.appendChild(badge);
  log(`badge rendered ${ (ratio*100).toFixed(1) } % → ${ tier.label }`);

  /* try docking it into the sidebar every 250 ms for 5 s */
  let dockTries = 0;
  const dockPoll = setInterval(() => {
    const sidebar =
      document.querySelector('[data-testid="home-details-summary-container"]') ||
      document.querySelector('[data-testid="sidebar-container"]');
    if (sidebar) {
      badge.style.position   = "static";
      badge.style.marginBottom = ".75em";
      badge.style.top = badge.style.right = "";         // clear fixed props
      sidebar.prepend(badge);
      clearInterval(dockPoll);
      log("badge docked in sidebar");
    } else if (++dockTries >= 20) {
      clearInterval(dockPoll);                          // give up quietly
    }
  }, 250);
}

/* --------- steal the numbers irrespective of class names --------- */
function scrapeMetrics() {
  let views, saves;
  document.querySelectorAll("dt button").forEach(btn => {
    const label = btn.textContent.toLowerCase();
    let dt = btn.closest("dt")?.previousElementSibling;
    while (dt && !dt.querySelector("strong")) {
      dt = dt.previousElementSibling;
    }
    const numNode = dt?.querySelector("strong");
    if (!numNode) return;
    const value = parseInt(numNode.textContent.replace(/[^\d]/g, ""), 10);
    if (label.includes("view")) views = value;
    if (label.includes("save")) saves = value;
  });
  if (views && saves) {
    log(`metrics → views=${views}  saves=${saves}`);
    return { views, saves };
  }
  return null;
}
