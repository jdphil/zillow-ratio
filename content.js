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

  let ratio = saves / views; // Ensure ratio is declared with let if it might be reassigned
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
  log("Starting robust scrapeMetrics");
  let views = null;
  let saves = null;

  const viewLabels = ['views', 'view'];
  const saveLabels = ['saves', 'save'];
  const potentialValueSelectors = ['strong', 'span', 'div', 'dd', 'p']; // Elements that might contain the value

  function parseNumber(text) {
    if (typeof text !== 'string') return NaN;
    const num = parseInt(text.replace(/[^\d]/g, ""), 10);
    log(`parseNumber: input="${text}", output=${num}`);
    return num;
  }

  function findValueNearLabel(labelElement, labelType) {
    log(`findValueNearLabel: Searching for value for "${labelType}" near element:`, labelElement);

    // Strategy 1: Check siblings for value
    let sibling = labelElement.nextElementSibling;
    while (sibling) {
      log(`Checking next sibling:`, sibling);
      for (const selector of potentialValueSelectors) {
        const valueElement = sibling.matches(selector) ? sibling : sibling.querySelector(selector);
        if (valueElement && valueElement.textContent) {
          const num = parseNumber(valueElement.textContent);
          if (!isNaN(num)) {
            log(`Found value in next sibling (${selector}): ${num}`);
            return num;
          }
        }
      }
      // Check sibling's direct text content if it's a potential value container itself
      if (potentialValueSelectors.some(s => sibling.matches(s)) && sibling.textContent) {
        const num = parseNumber(sibling.textContent);
        if (!isNaN(num)) {
            log(`Found value in next sibling's direct text: ${num}`);
            return num;
        }
      }
      sibling = sibling.nextElementSibling;
    }

    sibling = labelElement.previousElementSibling;
    while (sibling) {
      log(`Checking previous sibling:`, sibling);
       for (const selector of potentialValueSelectors) {
        const valueElement = sibling.matches(selector) ? sibling : sibling.querySelector(selector);
        if (valueElement && valueElement.textContent) {
          const num = parseNumber(valueElement.textContent);
          if (!isNaN(num)) {
            log(`Found value in previous sibling (${selector}): ${num}`);
            return num;
          }
        }
      }
      if (potentialValueSelectors.some(s => sibling.matches(s)) && sibling.textContent) {
        const num = parseNumber(sibling.textContent);
        if (!isNaN(num)) {
            log(`Found value in previous sibling's direct text: ${num}`);
            return num;
        }
      }
      sibling = sibling.previousElementSibling;
    }

    // Strategy 2: Check parent element's children (excluding the label element itself)
    const parent = labelElement.parentElement;
    if (parent) {
      log(`Checking parent element:`, parent);
      const children = Array.from(parent.children);
      for (const child of children) {
        if (child === labelElement) continue; // Skip the label element itself
        log(`Checking parent's child:`, child);
        for (const selector of potentialValueSelectors) {
          const valueElement = child.matches(selector) ? child : child.querySelector(selector);
          if (valueElement && valueElement.textContent) {
            const num = parseNumber(valueElement.textContent);
            if (!isNaN(num)) {
              log(`Found value in parent's child (${selector}): ${num}`);
              return num;
            }
          }
        }
         // Check child's direct text content if it's a potential value container itself
        if (potentialValueSelectors.some(s => child.matches(s)) && child.textContent) {
          const num = parseNumber(child.textContent);
          if (!isNaN(num)) {
              log(`Found value in parent's child direct text: ${num}`);
              return num;
          }
        }
      }
      // Check parent's direct text content if it's a potential value container itself (less common)
      // This might be too broad if the parent has other text nodes.
      // Example: <div><span>Views</span> 123 </div>
      // Consider parent.innerText and try to parse parts of it if other strategies fail.
      // For now, focusing on distinct elements.
    }

    // Strategy 3: Look for elements with data-testid attributes (more specific)
    // This is a general check, could be refined if specific patterns are known for value testids
    const commonParent = labelElement.closest('div, li, tr') || document.body; // Search within a reasonable container
    log(`Searching for data-testid values within:`, commonParent);
    const testIdElements = commonParent.querySelectorAll('[data-testid]');
    for (const el of testIdElements) {
        const testId = el.getAttribute('data-testid').toLowerCase();
        if (testId.includes(labelType) && (testId.includes('value') || testId.includes('count'))) {
            log(`Found potential value element by data-testid="${testId}":`, el);
            if (el.textContent) {
                const num = parseNumber(el.textContent);
                if (!isNaN(num)) {
                    log(`Parsed value from data-testid element: ${num}`);
                    return num;
                }
            }
        }
    }


    log(`Value for "${labelType}" not found near label:`, labelElement);
    return null;
  }

  // Main scraping logic
  log("Scanning all potential label elements (span, p, div, button, dt, dd, li, th, td)");
  const potentialElements = document.querySelectorAll('span, p, div, button, dt, dd, li, th, td');
  log(`Found ${potentialElements.length} potential elements to check.`);

  for (const el of potentialElements) {
    if (views && saves) break; // Stop if both found

    const textContent = el.textContent ? el.textContent.trim().toLowerCase() : "";
    const testId = el.getAttribute('data-testid') ? el.getAttribute('data-testid').toLowerCase() : "";

    if (!views) {
      let isViewLabel = viewLabels.some(label => textContent.includes(label));
      if (!isViewLabel && testId) {
        isViewLabel = viewLabels.some(label => testId.includes(label) && !testId.includes('save')); // ensure it's not a save label
      }

      if (isViewLabel) {
        log("Potential 'views' label found:", el, `textContent: "${textContent}"`, `testId: "${testId}"`);
        const foundView = findValueNearLabel(el, 'views');
        if (foundView !== null) {
          views = foundView;
          log(`SUCCESS: Views found: ${views}`);
          // Continue to find saves, don't break yet
        }
      }
    }

    if (!saves) {
      let isSaveLabel = saveLabels.some(label => textContent.includes(label));
      if (!isSaveLabel && testId) {
        isSaveLabel = saveLabels.some(label => testId.includes(label) && !testId.includes('view')); // ensure it's not a view label
      }

      if (isSaveLabel) {
        log("Potential 'saves' label found:", el, `textContent: "${textContent}"`, `testId: "${testId}"`);
        const foundSave = findValueNearLabel(el, 'saves');
        if (foundSave !== null) {
          saves = foundSave;
          log(`SUCCESS: Saves found: ${saves}`);
          // Continue to find views, don't break yet
        }
      }
    }
  }

  // Fallback: Try to find values directly by common data-testid patterns if not found via labels
  if (views === null) {
    log("Views not found via label scan, trying direct data-testid scan for views.");
    const viewElements = document.querySelectorAll('[data-testid*="view"], [data-testid*="View"]'); // Case-insensitive parts
    for (const el of viewElements) {
        const testId = el.getAttribute('data-testid').toLowerCase();
        if ((testId.includes('view') && !testId.includes('save')) && (testId.includes('count') || testId.includes('value') || testId.includes('total'))) {
            log(`Direct data-testid candidate for VIEWS:`, el);
            const num = parseNumber(el.textContent);
            if (!isNaN(num)) {
                views = num;
                log(`SUCCESS: Views found via direct data-testid scan: ${views}`);
                break;
            }
        }
    }
  }
  if (saves === null) {
    log("Saves not found via label scan, trying direct data-testid scan for saves.");
    const saveElements = document.querySelectorAll('[data-testid*="save"], [data-testid*="Save"]');
     for (const el of saveElements) {
        const testId = el.getAttribute('data-testid').toLowerCase();
        if ((testId.includes('save') && !testId.includes('view')) && (testId.includes('count') || testId.includes('value') || testId.includes('total'))) {
            log(`Direct data-testid candidate for SAVES:`, el);
            const num = parseNumber(el.textContent);
            if (!isNaN(num)) {
                saves = num;
                log(`SUCCESS: Saves found via direct data-testid scan: ${saves}`);
                break;
            }
        }
    }
  }


  if (views !== null && saves !== null) {
    log(`Final metrics → views=${views}  saves=${saves}`);
    return { views, saves };
  }

  log("Could not find both views and saves after robust scan.", {views, saves});
  return null;
}
