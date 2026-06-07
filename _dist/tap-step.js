/* Chef Marco kitchen mode.
   Mounts a Cook button, opens a full-screen single-step view of ol.steps.
   Vanilla JS, no deps, idempotent. */

(function () {
  "use strict";

  // Idempotency guard: if already mounted, exit.
  if (window.__cmTapStepMounted) return;
  window.__cmTapStepMounted = true;

  // -- config ----------------------------------------------------------------
  const CLAY = "oklch(0.58 0.16 45)";
  const CLAY_DEEP = "oklch(0.46 0.16 42)";
  const PAPER = "oklch(0.975 0.012 75)";
  const INK = "oklch(0.20 0.018 50)";
  const INK_SOFT = "oklch(0.45 0.020 55)";
  const OLIVE = "oklch(0.50 0.07 130)";
  const SERIF = '"Fraunces", "Iowan Old Style", "Hoefler Text", Georgia, serif';
  const SANS = '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif';

  const REDUCED_MOTION = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // -- state -----------------------------------------------------------------
  let steps = [];
  let index = 0;
  let overlay = null;
  let prevBodyOverflow = "";

  // -- step collection -------------------------------------------------------
  function collectSteps() {
    const lists = document.querySelectorAll("ol.steps");
    const out = [];
    lists.forEach((ol) => {
      ol.querySelectorAll(":scope > li").forEach((li) => out.push(li));
    });
    return out;
  }

  // -- step parsing ----------------------------------------------------------
  // Each step li may have a lead phrase (b/strong/.lead), a timing chip, body text.
  function parseStep(li) {
    const clone = li.cloneNode(true);
    let lead = "";
    let timing = "";

    const leadEl = clone.querySelector("strong, b, .lead, .step-lead");
    if (leadEl) {
      lead = leadEl.textContent.trim();
      leadEl.remove();
    }
    const timingEl = clone.querySelector(".timing, .chip-timing, time");
    if (timingEl) {
      timing = timingEl.textContent.trim();
      timingEl.remove();
    }

    // Anything left is the body. Preserve inline emphasis but flatten block noise.
    const bodyHTML = clone.innerHTML.trim().replace(/^[\s,;:.]+/, "");
    return { lead, timing, bodyHTML };
  }

  // -- styling helper --------------------------------------------------------
  function injectStyles() {
    if (document.getElementById("cm-tap-step-styles")) return;
    const css = `
      #cm-cook-button {
        position: fixed; right: 18px; bottom: 18px;
        width: 56px; height: 56px; border-radius: 50%;
        background: ${CLAY}; color: ${PAPER};
        border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 6px 18px rgba(0,0,0,0.18);
        font-family: ${SANS}; font-size: 10px; letter-spacing: 0.14em;
        text-transform: uppercase; font-weight: 600;
        z-index: 9998;
        flex-direction: column; gap: 2px; padding: 0;
        transition: ${REDUCED_MOTION ? "none" : "transform 160ms ease, background 160ms ease"};
      }
      #cm-cook-button:hover { background: ${CLAY_DEEP}; transform: ${REDUCED_MOTION ? "none" : "translateY(-1px)"}; }
      #cm-cook-button:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }
      #cm-cook-button svg { width: 22px; height: 22px; display: block; }
      #cm-cook-button .cm-label { font-size: 9px; line-height: 1; }

      #cm-cook-overlay {
        position: fixed; inset: 0; background: ${PAPER}; color: ${INK};
        z-index: 9999; display: flex; flex-direction: column;
        font-family: ${SERIF};
      }
      #cm-cook-overlay .cm-top {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 20px; border-bottom: 1px solid rgba(0,0,0,0.06);
        font-family: ${SANS}; font-size: 12px; color: ${INK_SOFT};
        letter-spacing: 0.12em; text-transform: uppercase;
      }
      #cm-cook-overlay .cm-close {
        background: none; border: none; cursor: pointer; color: ${INK_SOFT};
        font-family: ${SANS}; font-size: 13px; padding: 6px 10px; letter-spacing: 0.08em;
      }
      #cm-cook-overlay .cm-stage {
        flex: 1; overflow-y: auto; padding: 32px clamp(20px, 6vw, 72px);
        display: flex; flex-direction: column; justify-content: center;
        max-width: 880px; margin: 0 auto; width: 100%;
      }
      #cm-cook-overlay .cm-lead {
        font-family: ${SERIF}; font-variation-settings: "opsz" 144;
        font-size: clamp(28px, 6vw, 56px); line-height: 1.06;
        letter-spacing: -0.012em; font-weight: 500;
        margin: 0 0 18px; color: ${INK};
      }
      #cm-cook-overlay .cm-timing {
        font-family: ${SANS}; font-size: 12px; letter-spacing: 0.18em;
        text-transform: uppercase; color: ${OLIVE};
        font-feature-settings: "smcp"; font-variant-caps: small-caps;
        margin: 0 0 22px;
      }
      #cm-cook-overlay .cm-body {
        font-family: ${SERIF}; font-size: 22px; line-height: 1.55; color: ${INK};
        max-width: 60ch;
      }
      #cm-cook-overlay .cm-body p { margin: 0 0 14px; }
      #cm-cook-overlay .cm-actions {
        display: flex; border-top: 1px solid rgba(0,0,0,0.08);
        min-height: 96px;
      }
      #cm-cook-overlay .cm-prev, #cm-cook-overlay .cm-next {
        border: none; cursor: pointer;
        font-family: ${SANS}; font-size: 16px; font-weight: 600;
        letter-spacing: 0.10em; text-transform: uppercase;
        display: flex; align-items: center; justify-content: center;
      }
      #cm-cook-overlay .cm-prev {
        flex-basis: 33%; background: transparent; color: ${INK_SOFT};
      }
      #cm-cook-overlay .cm-prev:disabled { opacity: 0.35; cursor: not-allowed; }
      #cm-cook-overlay .cm-next {
        flex-basis: 67%; background: ${CLAY}; color: ${PAPER};
      }
      #cm-cook-overlay .cm-next:hover { background: ${CLAY_DEEP}; }
      @media (max-width: 480px) {
        #cm-cook-overlay .cm-body { font-size: 20px; }
      }
    `;
    const style = document.createElement("style");
    style.id = "cm-tap-step-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -- knife icon (inline SVG) ----------------------------------------------
  function knifeSVG() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 17 L14 6 a3 3 0 0 1 4 0 l1 1 a3 3 0 0 1 0 4 L8 22 Z"/>' +
      '<path d="M3 17 L8 22"/>' +
      "</svg>"
    );
  }

  // -- cook button -----------------------------------------------------------
  function mountButton() {
    if (document.getElementById("cm-cook-button")) return;
    const btn = document.createElement("button");
    btn.id = "cm-cook-button";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open kitchen mode");
    btn.innerHTML = knifeSVG() + '<span class="cm-label">Cook</span>';
    btn.addEventListener("click", openOverlay);
    document.body.appendChild(btn);
  }

  // -- overlay ---------------------------------------------------------------
  function openOverlay() {
    steps = collectSteps();
    if (!steps.length) return;
    index = 0;
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    overlay = document.createElement("div");
    overlay.id = "cm-cook-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Cook along, one step at a time");
    overlay.innerHTML = (
      '<div class="cm-top">' +
        '<span class="cm-counter" aria-live="polite"></span>' +
        '<button type="button" class="cm-close" aria-label="Close kitchen mode">Close</button>' +
      "</div>" +
      '<div class="cm-stage">' +
        '<p class="cm-timing"></p>' +
        '<h2 class="cm-lead"></h2>' +
        '<div class="cm-body"></div>' +
      "</div>" +
      '<div class="cm-actions">' +
        '<button type="button" class="cm-prev">Previous</button>' +
        '<button type="button" class="cm-next">Next</button>' +
      "</div>"
    );
    document.body.appendChild(overlay);

    overlay.querySelector(".cm-close").addEventListener("click", closeOverlay);
    overlay.querySelector(".cm-prev").addEventListener("click", retreat);
    overlay.querySelector(".cm-next").addEventListener("click", advance);
    document.addEventListener("keydown", onKey);

    render();
  }

  function closeOverlay() {
    if (!overlay) return;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    overlay = null;
    document.body.style.overflow = prevBodyOverflow;
    const btn = document.getElementById("cm-cook-button");
    if (btn) btn.focus();
  }

  function advance() {
    if (index >= steps.length - 1) { closeOverlay(); return; }
    index++;
    render();
  }

  function retreat() {
    if (index <= 0) return;
    index--;
    render();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); closeOverlay(); return; }
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault(); advance(); return;
    }
    if (e.key === "ArrowLeft") { e.preventDefault(); retreat(); }
  }

  function render() {
    if (!overlay) return;
    const step = parseStep(steps[index]);
    const last = index === steps.length - 1;

    overlay.querySelector(".cm-counter").textContent =
      "Step " + (index + 1) + " of " + steps.length;
    overlay.querySelector(".cm-timing").textContent = step.timing || "";
    overlay.querySelector(".cm-timing").style.display = step.timing ? "block" : "none";
    overlay.querySelector(".cm-lead").textContent = step.lead || ("Step " + (index + 1));
    overlay.querySelector(".cm-body").innerHTML = step.bodyHTML;

    const prevBtn = overlay.querySelector(".cm-prev");
    const nextBtn = overlay.querySelector(".cm-next");
    prevBtn.disabled = index === 0;
    nextBtn.textContent = last ? "Done" : "Next";
    nextBtn.focus();

    // scroll stage back to top so long body content starts at the top
    const stage = overlay.querySelector(".cm-stage");
    if (stage) stage.scrollTop = 0;
  }

  // -- mount on ready --------------------------------------------------------
  function init() {
    if (!document.querySelector("ol.steps")) return;
    injectStyles();
    mountButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
