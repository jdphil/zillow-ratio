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
log("Extension loaded, starting URL watcher");
setInterval(() => {
  if (location.href === lastURL) return;
  lastURL = location.href;
  log("URL changed:", location.href);

  if (/_zpid/.test(location.pathname)) {
    log("new listing detected → boot");
    bootForListing();
  } else {
    log("left listing → remove badge");
    document.getElementById("zsr-widget")?.remove();
  }
}, 400);

/* --------- main flow for a single listing --------- */
function bootForListing() {
  log("Starting bootForListing");
  document.getElementById("zsr-widget")?.remove();      // reset

  /* poll up to 10 × 300 ms for the metrics */
  let tries = 0;
  const poll = setInterval(() => {
    log(`Polling attempt ${tries + 1}/10`);
    const m = scrapeMetrics();
    if (m) {
      clearInterval(poll);
      log("Metrics found:", m);
      renderBadge(m);
    } else if (++tries >= 10) {
      clearInterval(poll);
      log("metrics not found after polling");
    }
  }, 300);
}

/* --------- render badge (floating first, then dock) --------- */
function renderBadge({ views, saves }) {
  log("Attempting to render badge with metrics:", { views, saves });
  // Validate inputs
  if (!views || !saves || views <= 0) {
    log("Invalid metrics - cannot calculate ratio");
    return;
  }

  // Additional validation
  if (typeof views !== 'number' || typeof saves !== 'number' || isNaN(views) || isNaN(saves)) {
    log("Invalid number types:", { views, saves });
    return;
  }

  if (saves > views) {
    log("Warning: saves greater than views, this might be incorrect");
  }

  const ratio = saves / views;
  log("Raw ratio calculation:", { saves, views, ratio });

  // Validate ratio
  if (ratio > 1) {
    log("Warning: ratio greater than 1, capping at 1");
    ratio = 1;
  }

  const tier = THRESHOLDS.find(t => ratio >= t.min);
  log("Calculated ratio:", ratio, "Selected tier:", tier);

  const badge = document.createElement("div");
  badge.id = "zsr-widget";
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
  log(`badge rendered ${(ratio * 100).toFixed(1)}% → ${tier.label}`);

  /* try docking it into the sidebar every 250 ms for 3 attempts */
  let dockTries = 0;
  const dockPoll = setInterval(() => {
    log(`Docking attempt ${dockTries + 1}/3`);
    const sidebar =
      document.querySelector('[data-testid="home-details-summary-container"]') ||
      document.querySelector('[data-testid="sidebar-container"]');
    if (sidebar) {
      badge.style.position = "static";
      badge.style.marginBottom = ".75em";
      badge.style.top = badge.style.right = ""; // clear fixed props
      sidebar.prepend(badge);
      clearInterval(dockPoll);
      log("badge docked in sidebar");
    } else if (++dockTries >= 3) {
      clearInterval(dockPoll);
      log("No sidebar found, badge will remain floating.");
    }
  }, 250);
}

/* --------- steal the numbers irrespective of class names --------- */
function scrapeMetrics() {
  log("Starting to scrape metrics");
  let views, saves;

  // Try to find the stats container first
  const statsContainer = document.querySelector('.styles__StyledOverviewStats-fshdp-8-106-0__sc-1x11gd9-0');
  if (!statsContainer) {
    log("Could not find stats container");
    return null;
  }

  // Find all dt elements with strong tags
  const statsElements = statsContainer.querySelectorAll('dt strong');
  log(`Found ${statsElements.length} stat elements`);

  // Find the views and saves buttons
  const buttons = statsContainer.querySelectorAll('button.TriggerText-c11n-8-106-0__sc-d96jze-0');
  log(`Found ${buttons.length} buttons`);

  buttons.forEach(button => {
    const label = button.textContent.toLowerCase();
    log("Checking button:", label);

    // Find the previous dt element that contains the number
    let dt = button.closest('dt').previousElementSibling;
    if (dt && dt.querySelector('strong')) {
      const value = parseInt(dt.querySelector('strong').textContent.replace(/[^\d]/g, ""), 10);
      log(`Found value ${value} for ${label}`);
      
      if (label.includes('view')) views = value;
      if (label.includes('save')) saves = value;
    }
  });

  if (views && saves) {
    log(`Final metrics → views=${views}  saves=${saves}`);
    return { views, saves };
  }

  log("Could not find both views and saves");
  return null;
}
