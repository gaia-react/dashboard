const IS_BROWSER = typeof window !== 'undefined';

// ─── Section 7: Browser UI (IS_BROWSER only) ────────────────────────────────

if (IS_BROWSER) {
  // Detect extension mode via the script tag's data attribute or the document element fallback.
  // currentScript is reliable for synchronously-executing scripts (which our IIFE is).
  const _myScript = document.currentScript;
  const EXTENSION_MODE =
    (_myScript && _myScript.dataset.impeccableExtension === 'true') ||
    document.documentElement.dataset.impeccableExtension === 'true';

  // Kinpaku gold — pinned to the site's brand token (see
  // site/styles/kinpaku-tokens.css --ks-kinpaku). Keep this in sync with
  // the picker's C.brand in skill/scripts/live-browser.js and the kit's
  // picker section in site/styles/kinpaku-kit.css.
  //
  // One color across both light and dark host pages. The outline is a
  // 2px gesture pointing at an element + a labeled tag — it's a marker,
  // not body text, so it doesn't need WCAG AA against the page. The
  // label text inside the gold tag is dark (LABEL_INK) which has ~16:1
  // against the leaf gold, so reading the rule name is solid in both
  // modes. Hover deepens the gold (preserves chroma — never drops it,
  // dropping chroma washes the gold into a sand/olive tone).
  const BRAND_COLOR = 'oklch(84% 0.19 80.46)';
  const BRAND_COLOR_HOVER = 'oklch(74% 0.18 80)';
  const LABEL_INK = 'oklch(4% 0.004 95)';
  const LABEL_BG = BRAND_COLOR;
  const OUTLINE_COLOR = BRAND_COLOR;

  // Inject hover styles via CSS (more reliable than JS event listeners)
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    @keyframes impeccable-reveal {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .impeccable-overlay:not(.impeccable-banner) {
      pointer-events: none;
      outline: 2px solid ${OUTLINE_COLOR};
      border-radius: 4px;
      transition: outline-color 0.15s ease;
      animation: impeccable-reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
      animation-play-state: paused;
      border-top-left-radius: 0;
    }
    .impeccable-overlay.impeccable-visible {
      animation-play-state: running;
    }
    .impeccable-overlay.impeccable-hover {
      outline-color: ${BRAND_COLOR_HOVER};
      z-index: 100001 !important;
    }
    .impeccable-overlay.impeccable-hover .impeccable-label {
      background: ${BRAND_COLOR_HOVER};
    }
    .impeccable-overlay.impeccable-spotlight {
      z-index: 100002 !important;
    }
    .impeccable-overlay.impeccable-spotlight-dimmed {
      opacity: 0.15 !important;
      animation: none !important;
      filter: blur(3px);
    }
    .impeccable-spotlight-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      backdrop-filter: blur(3px) brightness(0.6);
      -webkit-backdrop-filter: blur(3px) brightness(0.6);
      pointer-events: none;
      z-index: 99998;
      opacity: 0;
      outline: none !important;
      animation: none !important;
    }
    .impeccable-spotlight-backdrop.impeccable-visible {
      opacity: 1;
    }
    .impeccable-hidden .impeccable-overlay${EXTENSION_MODE ? '' : ':not(.impeccable-banner)'} {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).append(styleElement);

  // Spotlight backdrop element (created lazily on first use)
  let spotlightBackdrop = null;
  let spotlightTarget = null;

  const getSpotlightBackdrop = () => {
    if (!spotlightBackdrop) {
      spotlightBackdrop = document.createElement('div');
      spotlightBackdrop.className = 'impeccable-spotlight-backdrop';
      document.body.append(spotlightBackdrop);
    }

    return spotlightBackdrop;
  };

  const updateSpotlightClipPath = () => {
    if (!spotlightBackdrop || !spotlightTarget) return;
    const r = spotlightTarget.getBoundingClientRect();
    // Match the overlay's outer edge: element rect + 4px (2px overlay offset + 2px outline width)
    const inset = 4;
    const radius = 6; // outline border-radius (4) + outline width (2)
    const x1 = r.left - inset;
    const y1 = r.top - inset;
    const x2 = r.right + inset;
    const y2 = r.bottom + inset;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Outer rect + rounded inner rect (evenodd creates a hole)
    const path = `M0 0H${vw}V${vh}H0Z M${x1 + radius} ${y1}H${x2 - radius}A${radius} ${radius} 0 0 1 ${x2} ${y1 + radius}V${y2 - radius}A${radius} ${radius} 0 0 1 ${x2 - radius} ${y2}H${x1 + radius}A${radius} ${radius} 0 0 1 ${x1} ${y2 - radius}V${y1 + radius}A${radius} ${radius} 0 0 1 ${x1 + radius} ${y1}Z`;
    spotlightBackdrop.style.clipPath = `path(evenodd, "${path}")`;
  };

  const showSpotlight = (target) => {
    if (!target || !target.getBoundingClientRect) return;

    // Respect the spotlightBlur setting: if disabled, don't show the backdrop
    if (window.__IMPECCABLE_CONFIG__?.spotlightBlur === false) {
      spotlightTarget = target;

      return;
    }
    spotlightTarget = target;
    const bd = getSpotlightBackdrop();
    updateSpotlightClipPath();
    bd.classList.add('impeccable-visible');
  };

  const hideSpotlight = () => {
    spotlightTarget = null;
    if (spotlightBackdrop)
      spotlightBackdrop.classList.remove('impeccable-visible');
  };

  const isInViewport = (element) => {
    const r = element.getBoundingClientRect();

    return (
      r.top >= 0 &&
      r.left >= 0 &&
      r.bottom <= window.innerHeight &&
      r.right <= window.innerWidth
    );
  };

  // Reposition spotlight on scroll/resize
  window.addEventListener(
    'scroll',
    () => {
      if (spotlightTarget) updateSpotlightClipPath();
    },
    {passive: true}
  );
  window.addEventListener('resize', () => {
    if (spotlightTarget) updateSpotlightClipPath();
  });

  const overlays = [];
  const TYPE_LABELS = {};
  const RULE_CATEGORY = {};

  for (const ap of ANTIPATTERNS) {
    TYPE_LABELS[ap.id] = ap.name.toLowerCase();
    RULE_CATEGORY[ap.id] = ap.category || 'quality';
  }

  const isInFixedContext = (element) => {
    let p = element;

    while (p && p !== document.body) {
      if (getComputedStyle(p).position === 'fixed') return true;
      p = p.parentElement;
    }

    return false;
  };

  const positionOverlay = (overlay) => {
    const element = overlay._targetEl;
    if (!element) return;
    const rect = element.getBoundingClientRect();

    if (overlay._isFixed) {
      // Viewport-relative coords for fixed targets
      overlay.style.top = `${rect.top - 2}px`;
      overlay.style.left = `${rect.left - 2}px`;
    } else {
      // Document-relative coords for normal targets
      overlay.style.top = `${rect.top + scrollY - 2}px`;
      overlay.style.left = `${rect.left + scrollX - 2}px`;
    }
    overlay.style.width = `${rect.width + 4}px`;
    overlay.style.height = `${rect.height + 4}px`;
  };

  const repositionOverlays = () => {
    for (const o of overlays) {
      if (!o._targetEl || o.classList.contains('impeccable-banner')) continue;
      // Skip overlays whose target is currently hidden (display: none on the overlay)
      if (o.style.display === 'none') continue;
      positionOverlay(o);
    }
  };

  let resizeRAF;

  const onResize = () => {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(repositionOverlays);
  };
  window.addEventListener('resize', onResize);
  // Reposition on scroll too -- catches sticky/parallax shifts
  window.addEventListener('scroll', onResize, {passive: true});

  // Reposition when body resizes (lazy-loaded images, dynamic content, fonts loading)
  if (typeof ResizeObserver !== 'undefined') {
    const bodyResizeObserver = new ResizeObserver(onResize);
    bodyResizeObserver.observe(document.body);
  }

  // Track target element visibility via IntersectionObserver.
  // Uses a huge rootMargin so all *rendered* elements count as intersecting,
  // while display:none / closed <details> / hidden modals etc. do not.
  // This is event-driven -- no polling needed.
  let overlayIndex = 0;
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const overlay = entry.target._impeccableOverlay;
        if (!overlay) continue;

        if (entry.isIntersecting) {
          overlay.style.display = '';
          positionOverlay(overlay);

          if (!overlay._revealed) {
            overlay._revealed = true;

            if (firstScanDone) {
              // Subsequent reveals (re-scans, scroll-into-view): instant, no animation
              overlay.style.animation = 'none';
            } else {
              // Initial scan: staggered cascade reveal
              overlay.style.animationDelay = `${Math.min((overlay._staggerIndex || 0) * 60, 600)}ms`;
            }
            requestAnimationFrame(() => {
              overlay.classList.add('impeccable-visible');
              if (overlay._checkLabel) overlay._checkLabel();
            });
          }
        } else {
          overlay.style.display = 'none';
        }
      }
    },
    {rootMargin: '99999px'}
  );

  const detachOverlay = (overlay) => {
    if (!overlay) return;

    if (typeof overlay._cleanup === 'function') {
      try {
        overlay._cleanup();
      } catch {
        /* best effort overlay teardown */
      }
    }

    if (overlay._targetEl && overlay._targetEl._impeccableOverlay === overlay) {
      visibilityObserver.unobserve(overlay._targetEl);
      delete overlay._targetEl._impeccableOverlay;
    }
    const index = overlays.indexOf(overlay);
    if (index !== -1) overlays.splice(index, 1);
    overlay.remove();
  };

  // Reposition overlays after CSS transitions end (e.g. reveal animations).
  // Listens at document level so it catches transitions on ancestor elements
  // (the transform may be on a parent, not the flagged element itself).
  document.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'transform') return;

    for (const o of overlays) {
      if (
        !o._targetEl ||
        o.classList.contains('impeccable-banner') ||
        o.style.display === 'none'
      )
        continue;

      if (e.target === o._targetEl || e.target.contains(o._targetEl)) {
        positionOverlay(o);
      }
    }
  });

  const highlight = (element, findings) => {
    if (element._impeccableOverlay) detachOverlay(element._impeccableOverlay);
    const hasSlop = findings.some(
      (f) => RULE_CATEGORY[f.type || f.id] === 'slop'
    );

    const fixed = isInFixedContext(element);
    const rect = element.getBoundingClientRect();
    const outline = document.createElement('div');
    outline.className = 'impeccable-overlay';
    outline._targetEl = element;
    outline._isFixed = fixed;
    Object.assign(outline.style, {
      boxSizing: 'border-box',
      height: `${rect.height + 4}px`,
      left: fixed ? `${rect.left - 2}px` : `${rect.left + scrollX - 2}px`,
      position: fixed ? 'fixed' : 'absolute',
      top: fixed ? `${rect.top - 2}px` : `${rect.top + scrollY - 2}px`,
      width: `${rect.width + 4}px`,
      zIndex: '99999',
    });

    // Build per-finding label entries: ✦ prefix for slop
    const entries = findings.map((f) => {
      const name = TYPE_LABELS[f.type || f.id] || f.type || f.id;
      const prefix = RULE_CATEGORY[f.type || f.id] === 'slop' ? '\u2726 ' : '';

      return {detail: f.detail || f.snippet, name: prefix + name};
    });
    const allText = entries.map((e) => e.name).join(', ');

    const label = document.createElement('div');
    label.className = 'impeccable-label';
    Object.assign(label.style, {
      alignItems: 'center',
      background: LABEL_BG,
      borderRadius: '4px 4px 0 0',
      bottom: '100%',
      color: LABEL_INK,
      display: 'flex',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      fontWeight: '600',
      left: '-2px',
      letterSpacing: '0.02em',
      lineHeight: '14px',
      position: 'absolute',
      whiteSpace: 'nowrap',
    });

    const textSpan = document.createElement('span');
    textSpan.style.padding = '3px 8px';
    textSpan.textContent = allText;
    label.append(textSpan);

    // State for cycling mode
    let cycleMode = false;
    let cycleIndex = 0;
    let isHovered = false;
    let nextButton;
    let prevBtn;

    const updateCycleText = () => {
      const e = entries[cycleIndex];
      textSpan.textContent = isHovered ? e.detail : e.name;
    };

    const enableCycleMode = () => {
      if (cycleMode || entries.length < 2) return;
      cycleMode = true;

      const buttonStyle = {
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        lineHeight: '14px',
        padding: '3px 4px',
        pointerEvents: 'auto',
      };

      const navGroup = document.createElement('span');
      Object.assign(navGroup.style, {
        alignItems: 'center',
        display: 'inline-flex',
        flexShrink: '0',
      });

      prevBtn = document.createElement('button');
      prevBtn.textContent = '\u2039';
      Object.assign(prevBtn.style, buttonStyle);
      prevBtn.style.paddingLeft = '6px';
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleIndex = (cycleIndex - 1 + entries.length) % entries.length;
        updateCycleText();
      });

      nextButton = document.createElement('button');
      nextButton.textContent = '\u203A';
      Object.assign(nextButton.style, buttonStyle);
      nextButton.style.paddingRight = '2px';
      nextButton.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleIndex = (cycleIndex + 1) % entries.length;
        updateCycleText();
      });

      navGroup.append(prevBtn);
      navGroup.append(nextButton);
      textSpan.before(navGroup);
      textSpan.style.padding = '3px 8px 3px 4px';
      updateCycleText();
    };

    outline.append(label);

    // Start hidden; the IntersectionObserver will show it once the target is rendered
    outline.style.display = 'none';
    outline._staggerIndex = overlayIndex++;
    element._impeccableOverlay = outline;
    visibilityObserver.observe(element);

    // After first paint, check label width vs outline
    outline._checkLabel = () => {
      if (entries.length > 1 && label.offsetWidth > outline.offsetWidth) {
        enableCycleMode();
      }
    };

    // Hover: show detail text, darken
    const onMouseEnter = () => {
      isHovered = true;
      outline.classList.add('impeccable-hover');
      outline.style.outlineColor = BRAND_COLOR_HOVER;
      label.style.background = BRAND_COLOR_HOVER;

      if (cycleMode) {
        updateCycleText();
      } else {
        textSpan.textContent = entries.map((e) => e.detail).join(' | ');
      }
    };

    const onMouseLeave = () => {
      isHovered = false;
      outline.classList.remove('impeccable-hover');
      outline.style.outlineColor = '';
      label.style.background = LABEL_BG;

      if (cycleMode) {
        updateCycleText();
      } else {
        textSpan.textContent = allText;
      }
    };
    element.addEventListener('mouseenter', onMouseEnter);
    element.addEventListener('mouseleave', onMouseLeave);

    outline._cleanup = () => {
      element.removeEventListener('mouseenter', onMouseEnter);
      element.removeEventListener('mouseleave', onMouseLeave);
    };

    document.body.append(outline);
    overlays.push(outline);
  };

  const showPageBanner = (findings) => {
    if (findings.length === 0) return;
    const banner = document.createElement('div');
    banner.className = 'impeccable-overlay impeccable-banner';
    Object.assign(banner.style, {
      alignItems: 'center',
      background: LABEL_BG,
      color: LABEL_INK,
      display: 'flex',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      height: '36px',
      left: '0',
      maxWidth: '100vw',
      overflow: 'hidden',
      pointerEvents: 'auto',
      position: 'fixed',
      right: '0',
      top: '0',
      transform: 'translateY(-100%)',
      transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: '100000',
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        banner.style.transform = 'translateY(0)';
      })
    );

    // Scrollable findings area
    const scrollArea = document.createElement('div');
    Object.assign(scrollArea.style, {
      alignItems: 'center',
      display: 'flex',
      flex: '1',
      gap: '8px',
      minWidth: '0',
      overflowX: 'auto',
      overflowY: 'hidden',
      padding: '0 12px',
      scrollbarWidth: 'none',
      scrollSnapType: 'x mandatory',
    });

    for (const f of findings) {
      const prefix = RULE_CATEGORY[f.type] === 'slop' ? '\u2726 ' : '';
      const tag = document.createElement('span');
      tag.textContent = `${prefix}${TYPE_LABELS[f.type] || f.type}: ${f.detail}`;
      Object.assign(tag.style, {
        background: 'rgba(255,255,255,0.15)',
        borderRadius: '3px',
        flexShrink: '0',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '12px',
        padding: '2px 8px',
        scrollSnapAlign: 'start',
        whiteSpace: 'nowrap',
      });
      scrollArea.append(tag);
    }
    banner.append(scrollArea);

    // Controls area (only in standalone mode, not extension)
    if (!EXTENSION_MODE) {
      const controls = document.createElement('div');
      Object.assign(controls.style, {
        alignItems: 'center',
        display: 'flex',
        flexShrink: '0',
        gap: '2px',
        padding: '0 8px',
      });

      // Toggle visibility button
      const toggle = document.createElement('button');
      toggle.textContent = '\u25C9'; // circle with dot (visible state)
      toggle.title = 'Toggle overlay visibility';
      Object.assign(toggle.style, {
        background: 'none',
        border: 'none',
        color: 'white',
        cursor: 'pointer',
        fontSize: '16px',
        opacity: '0.85',
        padding: '0 4px',
        transition: 'opacity 0.15s',
      });
      let overlaysVisible = true;
      toggle.addEventListener('click', () => {
        overlaysVisible = !overlaysVisible;
        document.body.classList.toggle('impeccable-hidden', !overlaysVisible);
        toggle.textContent = overlaysVisible ? '\u25C9' : '\u25CB'; // filled vs empty circle
        toggle.style.opacity = overlaysVisible ? '0.85' : '0.5';
      });
      controls.append(toggle);

      // Close button
      const close = document.createElement('button');
      close.textContent = '\u00D7';
      close.title = 'Dismiss banner';
      Object.assign(close.style, {
        background: 'none',
        border: 'none',
        color: 'white',
        cursor: 'pointer',
        fontSize: '18px',
        padding: '0 4px',
      });
      close.addEventListener('click', () => banner.remove());
      controls.append(close);

      banner.append(controls);
    }
    document.body.append(banner);
    overlays.push(banner);
  };

  // Heuristic for skipping CSS-in-JS hashed class names like "css-1a2b3c" or "_2x4hG_".
  // These change between builds and produce brittle, ugly selectors.
  const isLikelyHashedClass = (c) => {
    if (!c) return true;
    if (/^(css|sc|emotion|jsx|module)-[\w-]{4,}$/i.test(c)) return true;
    if (/^_[\w-]{5,}$/.test(c)) return true;
    if (/^[a-z0-9]{6,}$/i.test(c) && /\d/.test(c)) return true;

    return false;
  };

  const buildSelectorSegment = (element) => {
    const tag = element.tagName.toLowerCase();
    let sel = tag;

    if (element.classList && element.classList.length > 0) {
      const classes = [...element.classList]
        .filter((c) => !c.startsWith('impeccable-') && !isLikelyHashedClass(c))
        .slice(0, 2);

      if (classes.length > 0) {
        sel += `.${classes.map((c) => CSS.escape(c)).join('.')}`;
      }
    }

    // Disambiguate among siblings only if the parent has multiple matches
    const parent = element.parentElement;

    if (parent) {
      try {
        const matching = parent.querySelectorAll(`:scope > ${sel}`);

        if (matching.length > 1) {
          const sameType = [...parent.children].filter(
            (c) => c.tagName === element.tagName
          );
          const index = sameType.indexOf(element) + 1;
          sel += `:nth-of-type(${index})`;
        }
      } catch {
        const index = [...parent.children].indexOf(element) + 1;
        sel = `${tag}:nth-child(${index})`;
      }
    }

    return sel;
  };

  const generateSelector = (element) => {
    if (element === document.body) return 'body';
    if (element === document.documentElement) return 'html';
    if (element.id) return `#${CSS.escape(element.id)}`;

    const parts = [];
    let current = element;
    let depth = 0;
    const MAX_DEPTH = 10;

    while (
      current &&
      current !== document.body &&
      current !== document.documentElement &&
      depth < MAX_DEPTH
    ) {
      parts.unshift(buildSelectorSegment(current));

      // Anchor on an ancestor's ID and stop walking up
      if (current.id) {
        parts[0] = `#${CSS.escape(current.id)}`;
        break;
      }

      // Stop as soon as the partial selector uniquely identifies the target
      const trySelector = parts.join(' > ');

      try {
        const matches = document.querySelectorAll(trySelector);

        if (matches.length === 1 && matches[0] === element) {
          return trySelector;
        }
      } catch {
        /* invalid selector — keep walking */
      }

      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  };

  const getDirectText = (element) =>
    [...element.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || '')
      .join('');

  const getDirectTextRect = (element) => {
    const rects = [];

    for (const node of element.childNodes) {
      if (node.nodeType !== 3 || !(node.textContent || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);

      for (const rect of range.getClientRects()) {
        if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
      }
      range.detach?.();
    }
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));

    return {
      bottom,
      height: bottom - top,
      left,
      right,
      top,
      width: right - left,
      x: left,
      y: top,
    };
  };

  const collectVisualContrastReasons = (element, style) => {
    const reasons = new Set();
    const bgClip = style.webkitBackgroundClip || style.backgroundClip || '';
    const ownBgImage = style.backgroundImage || '';

    if (bgClip === 'text' && ownBgImage && ownBgImage !== 'none') {
      reasons.add('background-clip text');
    }
    if (style.textShadow && style.textShadow !== 'none')
      reasons.add('text shadow');

    let current = element;

    while (current && current.nodeType === 1) {
      const tag = current.tagName?.toLowerCase();
      const currentStyle = getComputedStyle(current);
      const bgImage = currentStyle.backgroundImage || '';
      const isDocumentSurface = tag === 'body' || tag === 'html';

      if (!isDocumentSurface && bgImage && bgImage !== 'none') {
        if (/url\s*\(/i.test(bgImage)) reasons.add('image background');
        if (/gradient/i.test(bgImage)) reasons.add('gradient background');
      }
      if (Number.parseFloat(currentStyle.opacity) < 0.99)
        reasons.add('opacity stack');
      if (currentStyle.mixBlendMode && currentStyle.mixBlendMode !== 'normal')
        reasons.add('blend mode');
      if (currentStyle.filter && currentStyle.filter !== 'none')
        reasons.add('filter');
      if (currentStyle.backdropFilter && currentStyle.backdropFilter !== 'none')
        reasons.add('backdrop filter');

      const solidBg = parseRgb(currentStyle.backgroundColor);
      if (solidBg && solidBg.a >= 0.95 && (!bgImage || bgImage === 'none'))
        break;
      current = current.parentElement;
    }

    const sampleRect =
      getDirectTextRect(element) || element.getBoundingClientRect();

    if (sampleRect && document.elementsFromPoint) {
      const points = [
        [
          sampleRect.left + sampleRect.width / 2,
          sampleRect.top + sampleRect.height / 2,
        ],
        [
          sampleRect.left +
            Math.min(
              sampleRect.width - 1,
              Math.max(1, sampleRect.width * 0.25)
            ),
          sampleRect.top + sampleRect.height / 2,
        ],
        [
          sampleRect.left +
            Math.min(
              sampleRect.width - 1,
              Math.max(1, sampleRect.width * 0.75)
            ),
          sampleRect.top + sampleRect.height / 2,
        ],
      ];

      for (const [x, y] of points) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight)
          continue;
        const stack = document.elementsFromPoint(x, y);
        const selfIndex = stack.findIndex(
          (node) =>
            node === element ||
            element.contains(node) ||
            node.contains?.(element)
        );
        if (selfIndex === -1) continue;

        for (const node of stack.slice(selfIndex + 1)) {
          const nodeTag = node.tagName?.toLowerCase();

          if (
            nodeTag === 'img' ||
            nodeTag === 'picture' ||
            nodeTag === 'video' ||
            nodeTag === 'canvas' ||
            nodeTag === 'svg'
          ) {
            reasons.add(`${nodeTag} underlay`);
            break;
          }
        }
      }
    }

    return [...reasons];
  };

  const collectVisualContrastCandidates = (options = {}) => {
    const maxCandidates =
      Number.isFinite(options.maxCandidates) ? options.maxCandidates : 12;
    const candidates = [];

    for (const element of document.querySelectorAll('*')) {
      if (candidates.length >= maxCandidates) break;
      if (
        element.closest(
          '.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip'
        )
      )
        continue;
      if (element.closest('[id^="impeccable-live-"]')) continue;
      if (element === document.body || element === document.documentElement)
        continue;
      if (!isRenderedForBrowserRule(element)) continue;

      const tag = element.tagName.toLowerCase();
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const directText = getDirectText(element);
      const hasDirectText = directText.trim().length > 0;
      if (!hasDirectText || isEmojiOnlyText(directText)) continue;

      const bgColor = readOwnBackgroundColor(element, style);
      const isStyledButton =
        (tag === 'a' || tag === 'button') && bgColor && bgColor.a > 0.5;
      if (SAFE_TAGS.has(tag) && !isStyledButton) continue;

      const rect =
        getDirectTextRect(element) || element.getBoundingClientRect();
      if (!rect || rect.width < 4 || rect.height < 4) continue;

      const reasons = collectVisualContrastReasons(element, style);
      if (reasons.length === 0) continue;

      const textColor = parseRgb(style.color);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const fontWeight = Number.parseInt(style.fontWeight) || 400;
      const isLargeText =
        fontSize >= WCAG_LARGE_TEXT_PX ||
        (fontSize >= WCAG_LARGE_BOLD_TEXT_PX && fontWeight >= 700);
      const threshold = isLargeText ? 3 : 4.5;
      const clip = {
        height: Math.max(1, Math.ceil(rect.height + 4)),
        width: Math.max(1, Math.ceil(rect.width + 4)),
        x: Math.max(0, Math.floor(rect.left + window.scrollX - 2)),
        y: Math.max(0, Math.floor(rect.top + window.scrollY - 2)),
      };

      candidates.push({
        backgroundClipText: reasons.includes('background-clip text'),
        clip,
        preferRenderedForeground:
          !textColor ||
          textColor.a < 0.99 ||
          reasons.some(
            (reason) =>
              reason === 'opacity stack' ||
              reason === 'blend mode' ||
              reason === 'filter' ||
              reason === 'backdrop filter' ||
              reason === 'background-clip text'
          ),
        reasons,
        selector: generateSelector(element),
        tagName: tag,
        text: directText.trim().replaceAll(/\s+/g, ' ').slice(0, 80),
        textColor,
        threshold,
      });
    }

    return candidates;
  };

  const visualContrastImageCache = new Map();
  const visualContrastRasterCache = new WeakMap();

  const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

  const blendRgba = (fg, bg) => {
    if (!fg) return bg || null;

    if (!bg || fg.a == null || fg.a >= 0.999) {
      return {
        a: fg.a == null ? 1 : fg.a,
        b: clampByte(fg.b),
        g: clampByte(fg.g),
        r: clampByte(fg.r),
      };
    }
    const alpha = Math.max(0, Math.min(1, fg.a));

    return {
      a: 1,
      b: clampByte(fg.b * alpha + bg.b * (1 - alpha)),
      g: clampByte(fg.g * alpha + bg.g * (1 - alpha)),
      r: clampByte(fg.r * alpha + bg.r * (1 - alpha)),
    };
  };

  const pickWorstContrastColor = (textColor, colors) => {
    const usable = (colors || []).filter(Boolean);
    if (usable.length === 0) return null;
    let worst = usable[0];
    let worstRatio = contrastRatio(textColor, worst);

    for (const color of usable.slice(1)) {
      const ratio = contrastRatio(textColor, color);

      if (ratio < worstRatio) {
        worst = color;
        worstRatio = ratio;
      }
    }

    return worst;
  };

  const firstCssUrl = (value) => {
    const match = String(value || '').match(
      /url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/i
    );
    if (!match) return '';

    return (match[1] || match[2] || match[3] || '').trim();
  };

  const getLayerValue = (value, index = 0) =>
    String(value || '')
      .split(',')
      [index]?.trim() || '';

  const parsePositionToken = (token, container, painted) => {
    if (!token || token === 'center') return (container - painted) / 2;
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return container - painted;

    if (token.endsWith('%')) {
      const pct = Number.parseFloat(token) / 100;

      return (container - painted) * pct;
    }
    if (token.endsWith('px')) return Number.parseFloat(token) || 0;

    return (container - painted) / 2;
  };

  const parsePositionPair = (positionValue) => {
    const tokens = String(positionValue || '50% 50%')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const first = tokens[0] || '50%';

    if (tokens.length < 2) {
      if (first === 'top' || first === 'bottom') return ['50%', first];

      return [first, '50%'];
    }

    return [first, tokens[1] || '50%'];
  };

  const resolvePaintedImageRect = (
    containerRect,
    image,
    sizeValue,
    positionValue
  ) => {
    const intrinsicWidth =
      image.naturalWidth || image.videoWidth || image.width || 1;
    const intrinsicHeight =
      image.naturalHeight || image.videoHeight || image.height || 1;
    let paintedWidth = intrinsicWidth;
    let paintedHeight = intrinsicHeight;
    const size = String(sizeValue || 'auto').trim();

    if (size === 'cover' || size === 'contain') {
      const scale =
        size === 'cover' ?
          Math.max(
            containerRect.width / intrinsicWidth,
            containerRect.height / intrinsicHeight
          )
        : Math.min(
            containerRect.width / intrinsicWidth,
            containerRect.height / intrinsicHeight
          );
      paintedWidth = intrinsicWidth * scale;
      paintedHeight = intrinsicHeight * scale;
    } else if (size && size !== 'auto') {
      const parts = size.split(/\s+/);
      const widthToken = parts[0];
      const heightToken = parts[1] || 'auto';
      if (widthToken.endsWith('%'))
        paintedWidth =
          containerRect.width * (Number.parseFloat(widthToken) / 100);
      else if (widthToken.endsWith('px'))
        paintedWidth = Number.parseFloat(widthToken) || paintedWidth;
      if (heightToken === 'auto')
        paintedHeight = paintedWidth * (intrinsicHeight / intrinsicWidth);
      else if (heightToken.endsWith('%'))
        paintedHeight =
          containerRect.height * (Number.parseFloat(heightToken) / 100);
      else if (heightToken.endsWith('px'))
        paintedHeight = Number.parseFloat(heightToken) || paintedHeight;
    }

    const [xToken, yToken] = parsePositionPair(positionValue);
    const positionX = parsePositionToken(
      xToken,
      containerRect.width,
      paintedWidth
    );
    const positionY = parsePositionToken(
      yToken,
      containerRect.height,
      paintedHeight
    );

    return {
      height: paintedHeight,
      intrinsicHeight,
      intrinsicWidth,
      left: containerRect.left + positionX,
      top: containerRect.top + positionY,
      width: paintedWidth,
    };
  };

  const parseObjectPosition = (positionValue) =>
    parsePositionPair(positionValue);

  const resolveObjectImageRect = (containerRect, image, style) => {
    const intrinsicWidth =
      image.naturalWidth || image.videoWidth || image.width || 1;
    const intrinsicHeight =
      image.naturalHeight || image.videoHeight || image.height || 1;
    const fit = style.objectFit || 'fill';
    let paintedWidth = containerRect.width;
    let paintedHeight = containerRect.height;

    if (fit === 'contain' || fit === 'cover') {
      const scale =
        fit === 'cover' ?
          Math.max(
            containerRect.width / intrinsicWidth,
            containerRect.height / intrinsicHeight
          )
        : Math.min(
            containerRect.width / intrinsicWidth,
            containerRect.height / intrinsicHeight
          );
      paintedWidth = intrinsicWidth * scale;
      paintedHeight = intrinsicHeight * scale;
    } else if (fit === 'none') {
      paintedWidth = intrinsicWidth;
      paintedHeight = intrinsicHeight;
    } else if (fit === 'scale-down') {
      const containScale = Math.min(
        containerRect.width / intrinsicWidth,
        containerRect.height / intrinsicHeight,
        1
      );
      paintedWidth = intrinsicWidth * containScale;
      paintedHeight = intrinsicHeight * containScale;
    }
    const [xToken, yToken] = parseObjectPosition(style.objectPosition);

    return {
      height: paintedHeight,
      intrinsicHeight,
      intrinsicWidth,
      left:
        containerRect.left +
        parsePositionToken(xToken, containerRect.width, paintedWidth),
      top:
        containerRect.top +
        parsePositionToken(yToken, containerRect.height, paintedHeight),
      width: paintedWidth,
    };
  };

  const pointToImageSource = (point, paintedRect) => {
    if (
      point.x < paintedRect.left ||
      point.y < paintedRect.top ||
      point.x > paintedRect.left + paintedRect.width ||
      point.y > paintedRect.top + paintedRect.height
    ) {
      return null;
    }

    return {
      x: Math.max(
        0,
        Math.min(
          paintedRect.intrinsicWidth - 1,
          ((point.x - paintedRect.left) / paintedRect.width) *
            paintedRect.intrinsicWidth
        )
      ),
      y: Math.max(
        0,
        Math.min(
          paintedRect.intrinsicHeight - 1,
          ((point.y - paintedRect.top) / paintedRect.height) *
            paintedRect.intrinsicHeight
        )
      ),
    };
  };

  const loadVisualContrastImage = async (src) => {
    if (!src) return null;
    if (visualContrastImageCache.has(src))
      return visualContrastImageCache.get(src);
    const promise = new Promise((resolve) => {
      const img = new Image();
      let settled = false;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 800);

      try {
        const absolute = new URL(src, location.href);

        if (
          absolute.origin !== location.origin &&
          absolute.protocol !== 'data:' &&
          absolute.protocol !== 'blob:'
        ) {
          img.crossOrigin = 'anonymous';
        }
      } catch {
        // Let the browser resolve unusual URLs itself.
      }
      img.addEventListener('load', () => finish(img));
      img.onerror = () => finish(null);
      img.src = src;
    });
    visualContrastImageCache.set(src, promise);

    return promise;
  };

  const sampleDrawablePixel = (drawable, sourcePoint) => {
    if (visualContrastRasterCache.has(drawable)) {
      const cached = visualContrastRasterCache.get(drawable);
      if (!cached || !cached.ctx)
        return {
          reason: cached?.reason || 'image sample failed',
          status: 'unresolved',
        };

      try {
        const x = Math.max(
          0,
          Math.min(cached.width - 1, Math.floor(sourcePoint.x * cached.scaleX))
        );
        const y = Math.max(
          0,
          Math.min(cached.height - 1, Math.floor(sourcePoint.y * cached.scaleY))
        );
        const {data} = cached.ctx.getImageData(x, y, 1, 1);

        return {
          color: {a: data[3] / 255, b: data[2], g: data[1], r: data[0]},
          status: 'sampled',
        };
      } catch (error) {
        return {
          reason:
            /taint|cross-origin|Security/i.test(error?.message || '') ?
              'tainted image'
            : 'image sample failed',
          status: 'unresolved',
        };
      }
    }

    const canvas = document.createElement('canvas');
    const intrinsicWidth =
      drawable.naturalWidth || drawable.videoWidth || drawable.width || 1;
    const intrinsicHeight =
      drawable.naturalHeight || drawable.videoHeight || drawable.height || 1;
    const maxRasterSide = 640;
    const scale = Math.min(
      1,
      maxRasterSide / Math.max(intrinsicWidth, intrinsicHeight)
    );
    canvas.width = Math.max(1, Math.round(intrinsicWidth * scale));
    canvas.height = Math.max(1, Math.round(intrinsicHeight * scale));
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return {reason: 'canvas unavailable', status: 'unresolved'};

    try {
      ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
      const cached = {
        ctx,
        height: canvas.height,
        scaleX: canvas.width / intrinsicWidth,
        scaleY: canvas.height / intrinsicHeight,
        width: canvas.width,
      };
      visualContrastRasterCache.set(drawable, cached);
      const x = Math.max(
        0,
        Math.min(cached.width - 1, Math.floor(sourcePoint.x * cached.scaleX))
      );
      const y = Math.max(
        0,
        Math.min(cached.height - 1, Math.floor(sourcePoint.y * cached.scaleY))
      );
      const {data} = ctx.getImageData(x, y, 1, 1);

      return {
        color: {a: data[3] / 255, b: data[2], g: data[1], r: data[0]},
        status: 'sampled',
      };
    } catch (error) {
      const reason =
        /taint|cross-origin|Security/i.test(error?.message || '') ?
          'tainted image'
        : 'image sample failed';
      visualContrastRasterCache.set(drawable, {ctx: null, reason});

      return {
        reason,
        status: 'unresolved',
      };
    }
  };

  const sampleCssBackground = async (element, style, point, textColor) => {
    const rect = element.getBoundingClientRect();
    const bgImage = style.backgroundImage || '';

    if (bgImage && bgImage !== 'none') {
      if (/gradient/i.test(bgImage)) {
        const color = pickWorstContrastColor(
          textColor,
          parseGradientColors(bgImage)
        );
        if (color)
          return {color, method: 'analytic-gradient', status: 'sampled'};
      }

      if (/url\s*\(/i.test(bgImage)) {
        const img = await loadVisualContrastImage(firstCssUrl(bgImage));
        if (!img) return {reason: 'image unavailable', status: 'unresolved'};
        const paintedRect = resolvePaintedImageRect(
          rect,
          img,
          getLayerValue(style.backgroundSize) || 'auto',
          getLayerValue(style.backgroundPosition) || '50% 50%'
        );
        const sourcePoint = pointToImageSource(point, paintedRect);
        if (!sourcePoint)
          return {
            reason: 'point outside background image',
            status: 'unresolved',
          };
        const sample = sampleDrawablePixel(img, sourcePoint);
        if (sample.status === 'sampled')
          return {...sample, method: 'canvas-background-image'};

        return sample;
      }
    }
    const bg = parseRgb(style.backgroundColor);
    if (bg && bg.a > 0.05)
      return {color: bg, method: 'solid-background', status: 'sampled'};

    return {reason: 'no readable background', status: 'unresolved'};
  };

  const sampleImageElement = async (img, point) => {
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    const paintedRect = resolveObjectImageRect(rect, img, style);
    const sourcePoint = pointToImageSource(point, paintedRect);
    if (!sourcePoint)
      return {reason: 'point outside image', status: 'unresolved'};
    const sample = sampleDrawablePixel(img, sourcePoint);
    if (sample.status === 'sampled')
      return {...sample, method: 'canvas-img-underlay'};

    if (img.currentSrc || img.src) {
      const loaded = await loadVisualContrastImage(img.currentSrc || img.src);

      if (loaded) {
        const loadedRect = {
          ...paintedRect,
          intrinsicHeight:
            loaded.naturalHeight ||
            loaded.height ||
            paintedRect.intrinsicHeight,
          intrinsicWidth:
            loaded.naturalWidth || loaded.width || paintedRect.intrinsicWidth,
        };
        const loadedPoint = pointToImageSource(point, loadedRect);

        if (loadedPoint) {
          const loadedSample = sampleDrawablePixel(loaded, loadedPoint);
          if (loadedSample.status === 'sampled')
            return {...loadedSample, method: 'canvas-img-underlay'};
        }
      }
    }

    return sample;
  };

  const textSamplePoints = (rect) => {
    const insetX = Math.min(12, Math.max(1, rect.width * 0.12));
    const insetY = Math.min(8, Math.max(1, rect.height * 0.22));
    const xs =
      rect.width < 28 ?
        [rect.left + rect.width / 2]
      : [rect.left + insetX, rect.left + rect.width / 2, rect.right - insetX];
    const ys =
      rect.height < 22 ?
        [rect.top + rect.height / 2]
      : [rect.top + insetY, rect.top + rect.height / 2, rect.bottom - insetY];
    const points = [];

    for (const y of ys) {
      for (const x of xs) {
        if (
          x >= 0 &&
          y >= 0 &&
          x <= window.innerWidth &&
          y <= window.innerHeight
        )
          points.push({x, y});
      }
    }

    return points;
  };

  const sampleVisualBackgroundAtPoint = async (
    element,
    point,
    textColor,
    depth = 0
  ) => {
    if (depth > 8) {
      return {reason: 'background stack too deep', status: 'unresolved'};
    }
    const stack =
      typeof document.elementsFromPoint === 'function' ?
        document.elementsFromPoint(point.x, point.y)
      : [];
    const selfIndex = stack.findIndex(
      (node) => node === element || element.contains(node)
    );
    const nodes =
      selfIndex === -1 ? [element, ...stack] : stack.slice(selfIndex);
    const unresolved = [];

    for (const node of nodes) {
      if (!node || node.nodeType !== 1) continue;
      if (
        node.closest?.(
          '.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip'
        )
      )
        continue;
      const tag = node.tagName?.toLowerCase();

      if (tag === 'img') {
        const sample = await sampleImageElement(node, point);
        if (sample.status === 'sampled') return sample;
        unresolved.push(sample.reason);
        continue;
      }

      if (tag === 'canvas' || tag === 'video') {
        const rect = node.getBoundingClientRect();
        const sourcePoint = pointToImageSource(point, {
          height: rect.height,
          intrinsicHeight: node.height || node.videoHeight || rect.height,
          intrinsicWidth: node.width || node.videoWidth || rect.width,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        });

        if (sourcePoint) {
          const sample = sampleDrawablePixel(node, sourcePoint);
          if (sample.status === 'sampled')
            return {...sample, method: `canvas-${tag}-underlay`};
          unresolved.push(sample.reason);
        }
        continue;
      }
      const style = getComputedStyle(node);
      const sample = await sampleCssBackground(node, style, point, textColor);

      if (sample.status === 'sampled') {
        if (!sample.color || sample.color.a == null || sample.color.a >= 0.95)
          return sample;
        const under = await sampleVisualBackgroundAtPoint(
          node.parentElement || document.body,
          point,
          textColor,
          depth + 1
        );

        if (under.status === 'sampled') {
          return {
            color: blendRgba(sample.color, under.color),
            method: `${sample.method}+alpha`,
            status: 'sampled',
          };
        }

        return sample;
      }
      unresolved.push(sample.reason);
    }

    return {
      reason:
        [...new Set(unresolved.filter(Boolean))].slice(0, 3).join(', ') ||
        'no readable visual background',
      status: 'unresolved',
    };
  };

  const analyzeVisualContrastCandidate = async (candidate) => {
    let element;

    try {
      element = document.querySelector(candidate.selector);
    } catch {
      return {
        ...candidate,
        confidence: 'none',
        reason: 'stale selector',
        status: 'unresolved',
      };
    }
    if (!element)
      return {
        ...candidate,
        confidence: 'none',
        reason: 'missing element',
        status: 'unresolved',
      };
    if (!isRenderedForBrowserRule(element))
      return {
        ...candidate,
        confidence: 'none',
        reason: 'hidden element',
        status: 'unresolved',
      };

    const blockingReason = (candidate.reasons || []).find(
      (reason) =>
        reason === 'background-clip text' ||
        reason === 'blend mode' ||
        reason === 'filter' ||
        reason === 'backdrop filter' ||
        reason === 'opacity stack' ||
        reason === 'text shadow'
    );

    if (blockingReason) {
      return {
        ...candidate,
        confidence: 'none',
        reason: `${blockingReason} needs screenshot pixels`,
        status: 'unresolved',
      };
    }

    const style = getComputedStyle(element);
    const textColor = parseRgb(style.color) || candidate.textColor;
    if (!textColor)
      return {
        ...candidate,
        confidence: 'none',
        reason: 'unreadable text color',
        status: 'unresolved',
      };

    const rect = getDirectTextRect(element) || element.getBoundingClientRect();

    if (!rect || rect.width < 4 || rect.height < 4) {
      return {
        ...candidate,
        confidence: 'none',
        reason: 'missing text rect',
        status: 'unresolved',
      };
    }

    const points = textSamplePoints(rect);

    if (points.length === 0) {
      return {
        ...candidate,
        confidence: 'none',
        reason: 'text outside viewport',
        status: 'unresolved',
      };
    }

    const ratios = [];
    const methods = new Set();
    const unresolved = [];

    for (const point of points) {
      const sample = await sampleVisualBackgroundAtPoint(
        element,
        point,
        textColor
      );

      if (sample.status !== 'sampled' || !sample.color) {
        unresolved.push(sample.reason);
        continue;
      }
      const fg = blendRgba(textColor, sample.color);
      ratios.push(contrastRatio(fg, sample.color));
      if (sample.method) methods.add(sample.method);
    }

    if (ratios.length < Math.min(3, points.length)) {
      return {
        ...candidate,
        confidence: 'none',
        reason:
          [...new Set(unresolved.filter(Boolean))].slice(0, 3).join(', ') ||
          'not enough readable samples',
        samples: ratios.length,
        status: 'unresolved',
      };
    }

    ratios.sort((a, b) => a - b);
    const pick = (pct) =>
      ratios[
        Math.min(
          ratios.length - 1,
          Math.max(0, Math.floor((pct / 100) * ratios.length))
        )
      ];
    const measuredRatio = pick(10);
    const medianRatio = pick(50);
    const status = measuredRatio < candidate.threshold ? 'fail' : 'pass';
    const method = [...methods].sort().join(', ') || 'browser-visual';
    const textLabel = candidate.text ? ` "${candidate.text}"` : '';
    const detail = `browser contrast ${measuredRatio.toFixed(1)}:1 median ${medianRatio.toFixed(1)}:1 (need ${candidate.threshold}:1) via ${method}${textLabel}`;

    return {
      ...candidate,
      confidence: method.includes('canvas-') ? 'high' : 'medium',
      finding: status === 'fail' ? {id: 'low-contrast', snippet: detail} : null,
      medianRatio,
      method,
      ratio: measuredRatio,
      samples: ratios.length,
      status,
    };
  };

  const waitForVisualPaint = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

  const analyzeVisualContrast = async (options = {}) => {
    const candidates = collectVisualContrastCandidates(options);
    const results = [];
    const shouldScrollOffscreen = options.scrollOffscreen === true;
    const restoreScroll = {x: window.scrollX, y: window.scrollY};

    for (const candidate of candidates) {
      if (
        shouldScrollOffscreen &&
        (window.scrollX !== restoreScroll.x ||
          window.scrollY !== restoreScroll.y)
      ) {
        window.scrollTo(restoreScroll.x, restoreScroll.y);
        await waitForVisualPaint();
      }
      let result = await analyzeVisualContrastCandidate(candidate);

      if (
        shouldScrollOffscreen &&
        result.status === 'unresolved' &&
        result.reason === 'text outside viewport'
      ) {
        let element = null;

        try {
          element = document.querySelector(candidate.selector);
        } catch {
          element = null;
        }

        if (element && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({
            behavior: 'instant',
            block: 'center',
            inline: 'nearest',
          });
          await waitForVisualPaint();
          result = await analyzeVisualContrastCandidate(candidate);
        }
      }
      results.push(result);
    }

    if (
      shouldScrollOffscreen &&
      (window.scrollX !== restoreScroll.x || window.scrollY !== restoreScroll.y)
    ) {
      window.scrollTo(restoreScroll.x, restoreScroll.y);
    }

    return results;
  };

  const isElementHidden = (element) => {
    if (
      !element ||
      element === document.body ||
      element === document.documentElement
    )
      return false;
    if (typeof element.checkVisibility === 'function')
      return !element.checkVisibility({
        checkOpacity: false,
        checkVisibilityCSS: true,
      });

    // Fallback: zero size or no offsetParent (covers display:none and detached subtrees)
    return element.offsetWidth === 0 && element.offsetHeight === 0;
  };

  const serializeFindings = (allFindings) =>
    allFindings.map(({el, findings}) => ({
      findings: findings.map((f) => {
        const ap = ANTIPATTERNS.find((a) => a.id === (f.type || f.id));

        return {
          category: ap ? ap.category : 'quality',
          description: ap ? ap.description : '',
          detail: f.detail || f.snippet,
          ignoreValue: f.ignoreValue || f.value || '',
          name: ap ? ap.name : f.type || f.id,
          severity: ap?.severity || 'warning',
          type: f.type || f.id,
        };
      }),
      isHidden: isElementHidden(el),
      isPageLevel: el === document.body || el === document.documentElement,
      rect:
        (
          el !== document.body &&
          el !== document.documentElement &&
          el.getBoundingClientRect
        ) ?
          el.getBoundingClientRect().toJSON()
        : null,
      selector: generateSelector(el),
      tagName: el.tagName?.toLowerCase() || 'unknown',
    }));

  const printSummary = (allFindings) => {
    if (allFindings.length === 0) {
      console.log(
        '%c[impeccable] No anti-patterns found.',
        'color: #22c55e; font-weight: bold'
      );

      return;
    }
    console.group(
      `%c[impeccable] ${allFindings.length} anti-pattern${allFindings.length === 1 ? '' : 's'} found`,
      'color: oklch(84% 0.19 80.46); font-weight: bold'
    );

    for (const {el, findings} of allFindings) {
      for (const f of findings) {
        console.log(
          `%c${f.type || f.id}%c ${f.detail || f.snippet}`,
          'color: oklch(84% 0.19 80.46); font-weight: bold',
          'color: inherit',
          el
        );
      }
    }
    console.groupEnd();
  };

  const addBrowserFindings = (groupMap, element, findings) => {
    if (!findings || findings.length === 0) return;
    const existing = groupMap.get(element);
    if (existing) existing.push(...findings);
    else groupMap.set(element, [...findings]);
  };

  const browserFindingsFromMap = (groupMap) =>
    [...groupMap.entries()].map(([element, findings]) => ({
      el: element,
      findings,
    }));

  const DESIGN_COLOR_TOLERANCE = 6;
  const DESIGN_RADIUS_TOLERANCE_PX = 0.5;
  const DESIGN_SKIP_TAGS = new Set([
    'head',
    'link',
    'meta',
    'noscript',
    'script',
    'source',
    'style',
    'template',
    'title',
  ]);

  const normalizeBrowserFontName = (value) =>
    String(value || '')
      .trim()
      .replaceAll(/^["']|["']$/g, '')
      .replaceAll('+', ' ')
      .replaceAll(/\s+/g, ' ')
      .toLowerCase();

  const browserPrimaryFont = (stack) => {
    if (!stack || /var\(/i.test(stack)) return '';

    return (
      String(stack || '')
        .split(',')
        .map(normalizeBrowserFontName)
        .find((font) => font && !GENERIC_FONTS.has(font)) || ''
    );
  };

  const browserDesignSystemConfig = () => {
    const raw = window.__IMPECCABLE_CONFIG__?.designSystem;
    if (!raw?.present) return null;
    const allowedFonts = new Set(
      (raw.allowedFonts || []).map(normalizeBrowserFontName).filter(Boolean)
    );
    const allowedColors = (raw.allowedColors || [])
      .filter(
        (color) =>
          color &&
          Number.isFinite(color.r) &&
          Number.isFinite(color.g) &&
          Number.isFinite(color.b)
      )
      .map((color) => ({b: color.b, g: color.g, r: color.r}));
    const allowedRadii = (raw.allowedRadii || [])
      .map(Number)
      .filter((px) => Number.isFinite(px));

    return {
      allowedColors,
      allowedFonts,
      allowedRadii,
      hasColors: raw.hasColors === true && allowedColors.length > 0,
      hasFonts: raw.hasFonts === true && allowedFonts.size > 0,
      hasPillRadius: raw.hasPillRadius === true,
      hasRadii: raw.hasRadii === true && allowedRadii.length > 0,
      present: true,
    };
  };

  const browserColorsClose = (a, b) => {
    if (!a || !b) return false;

    return (
      Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <=
      DESIGN_COLOR_TOLERANCE
    );
  };

  const isBrowserDesignColorAllowed = (raw, designSystem) => {
    if (!designSystem?.hasColors) return true;
    const text = String(raw || '')
      .trim()
      .toLowerCase();
    if (
      !text ||
      text === 'transparent' ||
      text === 'currentcolor' ||
      text === 'inherit' ||
      text === 'initial'
    )
      return true;
    if (text.includes('var(')) return true;
    const parsed = parseAnyColor(text);
    if (!parsed) return true;
    if ((parsed.a ?? 1) <= 0.05) return true;

    return designSystem.allowedColors.some((color) =>
      browserColorsClose(parsed, color)
    );
  };

  const isBrowserTransparentCss = (value) => {
    const text = String(value || '')
      .trim()
      .toLowerCase();
    if (!text || text === 'transparent') return true;
    const parsed = parseAnyColor(text);

    return parsed ? (parsed.a ?? 1) <= 0.05 : false;
  };

  const isBrowserDesignRadiusAllowed = (raw, designSystem) => {
    if (!designSystem?.hasRadii) return true;
    const text = String(raw || '')
      .trim()
      .toLowerCase();
    if (
      !text ||
      text === '0' ||
      text === 'none' ||
      text === 'initial' ||
      text === 'inherit'
    )
      return true;
    if (text.includes('var(') || text.includes('%')) return true;
    const px = resolveLengthPx(text, 16);
    if (px == null || !Number.isFinite(px) || px <= DESIGN_RADIUS_TOLERANCE_PX)
      return true;
    if (designSystem.hasPillRadius && px >= 99) return true;

    return designSystem.allowedRadii.some(
      (allowed) => Math.abs(allowed - px) <= DESIGN_RADIUS_TOLERANCE_PX
    );
  };

  const browserRadiusTokens = (value) =>
    String(value || '')
      .replaceAll(/\s*\/\s*/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

  const browserHasDirectText = (element) =>
    [...(element.childNodes || [])].some(
      (node) => node.nodeType === 3 && node.textContent.trim().length > 0
    );

  const browserSampleText = (element) => {
    const text = String(element.textContent || '')
      .replaceAll(/\s+/g, ' ')
      .trim();

    return text ? ` "${text.slice(0, 40)}"` : '';
  };

  const shouldSkipDesignElement = (element) => {
    const tag = element.tagName?.toLowerCase?.() || '';

    return DESIGN_SKIP_TAGS.has(tag) || isElementHidden(element);
  };

  const checkElementDesignSystemDOM = (element, designSystem, seen) => {
    if (!designSystem?.present || shouldSkipDesignElement(element)) return [];
    const findings = [];
    const tag = element.tagName?.toLowerCase?.() || 'unknown';
    const style = getComputedStyle(element);

    if (designSystem.hasFonts && browserHasDirectText(element)) {
      const font = browserPrimaryFont(style.fontFamily || '');

      if (
        font &&
        !designSystem.allowedFonts.has(font) &&
        !seen.fonts.has(font)
      ) {
        seen.fonts.add(font);
        findings.push({
          detail: `${tag}${browserSampleText(element)} uses ${font}; not declared in DESIGN.md typography`,
          ignoreValue: font,
          type: 'design-system-font',
        });
      }
    }

    if (designSystem.hasColors) {
      const colorChecks = [];
      if (browserHasDirectText(element))
        colorChecks.push(['text color', style.color]);
      if (!isBrowserTransparentCss(style.backgroundColor))
        colorChecks.push(['background', style.backgroundColor]);

      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if ((Number.parseFloat(style[`border${side}Width`]) || 0) > 0) {
          colorChecks.push([
            `border-${side.toLowerCase()}`,
            style[`border${side}Color`],
          ]);
        }
      }
      if ((Number.parseFloat(style.outlineWidth) || 0) > 0)
        colorChecks.push(['outline', style.outlineColor]);

      for (const [kind, raw] of colorChecks) {
        const label = String(raw || '')
          .trim()
          .replaceAll(/\s+/g, ' ');
        if (isBrowserDesignColorAllowed(label, designSystem)) continue;
        const key = `${kind}:${label}`;
        if (seen.colors.has(key)) continue;
        seen.colors.add(key);
        findings.push({
          detail: `${kind} ${label} on ${tag}${browserSampleText(element)} is outside DESIGN.md colors`,
          ignoreValue: label,
          type: 'design-system-color',
        });
      }
    }

    if (designSystem.hasRadii) {
      for (const token of browserRadiusTokens(style.borderRadius || '')) {
        if (isBrowserDesignRadiusAllowed(token, designSystem)) continue;
        if (seen.radii.has(token)) continue;
        seen.radii.add(token);
        findings.push({
          detail: `border-radius ${token} on ${tag}${browserSampleText(element)} is outside the DESIGN.md rounded scale`,
          ignoreValue: token,
          type: 'design-system-radius',
        });
      }
    }

    return findings;
  };

  const decodeBrowserGoogleFamily = (value) => {
    const family = String(value || '')
      .split(':', 1)[0]
      .replaceAll('+', ' ');

    try {
      return decodeURIComponent(family);
    } catch {
      return family;
    }
  };

  const checkBrowserDesignSystemSources = (designSystem, seen) => {
    if (!designSystem?.hasFonts) return [];
    const findings = [];

    for (const link of document.querySelectorAll(
      'link[href*="fonts.googleapis.com/css"]'
    )) {
      const href = link.getAttribute('href') || '';

      for (const match of href.matchAll(/[?&]family=([^&]+)/g)) {
        const display = decodeBrowserGoogleFamily(match[1]);
        const font = normalizeBrowserFontName(display);
        if (
          !font ||
          designSystem.allowedFonts.has(font) ||
          seen.fonts.has(font)
        )
          continue;
        seen.fonts.add(font);
        findings.push({
          detail: `Google Fonts: ${display} is not declared in DESIGN.md typography`,
          ignoreValue: display,
          type: 'design-system-font',
        });
      }
    }

    return findings;
  };

  const collectBrowserFindings = () => {
    const groupMap = new Map();
    const _disabled =
      EXTENSION_MODE ? window.__IMPECCABLE_CONFIG__?.disabledRules || [] : [];
    const _ruleOk = (id) => _disabled.length === 0 || !_disabled.includes(id);
    const designSystem = browserDesignSystemConfig();
    const designSeen = {colors: new Set(), fonts: new Set(), radii: new Set()};
    // Note: provider-gated rules (--gpt / --gemini) are NOT filtered here. In a
    // real browser env (detector page, live overlay, extension) running every
    // check is free, so we always surface them; the gating is purely a CLI
    // output concern, applied in the Node engines' detect* return paths.

    for (const element of document.querySelectorAll('*')) {
      // Skip impeccable's own elements and any descendants (overlays, labels, banner, nav buttons)
      if (
        element.closest(
          '.impeccable-overlay, .impeccable-label, .impeccable-banner, .impeccable-tooltip'
        )
      )
        continue;
      // Skip browser extension elements (Claude, etc.)
      const elementId = element.id || '';
      if (elementId.startsWith('claude-') || elementId.startsWith('cic-'))
        continue;
      // Skip the impeccable live-mode overlay (highlight, tooltip, bar, picker, toast).
      // These are inspector chrome, not part of the user's design.
      if (element.closest('[id^="impeccable-live-"]')) continue;
      // Skip html/body -- page-level findings go in the banner, not a full-page overlay
      if (element === document.body || element === document.documentElement)
        continue;

      const findings = [
        ...checkElementBordersDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementColorsDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementMotionDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementGlowDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementAIPaletteDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementIconTileDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementItalicSerifDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementQualityDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementOversizedH1DOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementClippedOverflowDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementGptBorderShadowDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementTextOverflowDOM(element).map((f) => ({
          detail: f.snippet,
          type: f.id,
        })),
        ...checkElementDesignSystemDOM(element, designSystem, designSeen),
      ].filter((f) => _ruleOk(f.type));

      addBrowserFindings(groupMap, element, findings);

      // Hero eyebrow: the offending element is the eyebrow above the heading,
      // not the heading itself — highlight the previous sibling instead.
      const eyebrowFindings = checkElementHeroEyebrowDOM(element)
        .map((f) => ({detail: f.snippet, type: f.id}))
        .filter((f) => _ruleOk(f.type));

      if (eyebrowFindings.length > 0 && element.previousElementSibling) {
        addBrowserFindings(
          groupMap,
          element.previousElementSibling,
          eyebrowFindings
        );
      }
    }

    const pageLevelFindings = [];

    const designSourceFindings = checkBrowserDesignSystemSources(
      designSystem,
      designSeen
    ).filter((f) => _ruleOk(f.type));

    if (designSourceFindings.length > 0) {
      pageLevelFindings.push(...designSourceFindings);
      addBrowserFindings(groupMap, document.body, designSourceFindings);
    }

    const typoFindings = checkTypography().filter((f) => _ruleOk(f.type));

    if (typoFindings.length > 0) {
      pageLevelFindings.push(...typoFindings);
      addBrowserFindings(groupMap, document.body, typoFindings);
    }

    const sectionKickerFindings = checkRepeatedSectionKickersDOM()
      .map((f) => ({detail: f.snippet, type: f.id}))
      .filter((f) => _ruleOk(f.type));

    if (sectionKickerFindings.length > 0) {
      pageLevelFindings.push(...sectionKickerFindings);
      addBrowserFindings(groupMap, document.body, sectionKickerFindings);
    }

    const layoutFindings = checkLayout().filter((f) => _ruleOk(f.type));

    for (const f of layoutFindings) {
      const element = f.el || document.body;
      addBrowserFindings(groupMap, element, [
        {detail: f.detail || f.snippet, type: f.type},
      ]);
    }

    // Page-level quality checks (headings, etc.)
    const qualityFindings = checkPageQualityDOM().filter((f) =>
      _ruleOk(f.type)
    );

    if (qualityFindings.length > 0) {
      pageLevelFindings.push(...qualityFindings);
      addBrowserFindings(groupMap, document.body, qualityFindings);
    }

    const creamFindings = checkCreamPalette(document)
      .map((f) => ({detail: f.snippet, type: f.id}))
      .filter((f) => _ruleOk(f.type));

    if (creamFindings.length > 0) {
      pageLevelFindings.push(...creamFindings);
      addBrowserFindings(groupMap, document.body, creamFindings);
    }

    // Regex-on-HTML checks (shared with Node)
    // Clone the document and strip impeccable-live overlay nodes before the
    // regex scan, so the inspector's own inline styles (transitions on top/
    // left/width/height, etc.) don't register as page anti-patterns.
    const documentClone = document.documentElement.cloneNode(true);

    for (const node of documentClone.querySelectorAll(
      '[id^="impeccable-live-"]'
    )) {
      node.remove();
    }
    const htmlPatternFindings = checkHtmlPatterns(documentClone.outerHTML);

    if (htmlPatternFindings.length > 0) {
      const mapped = htmlPatternFindings
        .map((f) => ({detail: f.snippet, type: f.id}))
        .filter((f) => _ruleOk(f.type));
      pageLevelFindings.push(...mapped);
      addBrowserFindings(groupMap, document.body, mapped);
    }

    return {
      allFindings: browserFindingsFromMap(groupMap),
      groupMap,
      pageLevelFindings,
    };
  };

  const shouldRunVisualContrast = (options = {}) =>
    options.visualContrast === true ||
    window.__IMPECCABLE_CONFIG__?.visualContrast === true;

  const visualContrastOptions = (options = {}) => {
    const config = window.__IMPECCABLE_CONFIG__ || {};
    const scrollOffscreen =
      typeof options.scrollOffscreen === 'boolean' ? options.scrollOffscreen
      : typeof options.visualContrastScrollOffscreen === 'boolean' ?
        options.visualContrastScrollOffscreen
      : typeof config.visualContrastScrollOffscreen === 'boolean' ?
        config.visualContrastScrollOffscreen
      : false;

    return {
      ...options,
      maxCandidates:
        Number.isFinite(options.visualContrastMaxCandidates) ?
          options.visualContrastMaxCandidates
        : Number.isFinite(options.maxCandidates) ? options.maxCandidates
        : Number.isFinite(config.visualContrastMaxCandidates) ?
          config.visualContrastMaxCandidates
        : undefined,
      scrollOffscreen,
    };
  };

  let lastVisualContrastAnalyses = [];
  let lazyVisualContrastObserver = null;
  let lazyVisualContrastPending = new WeakMap();
  const lazyVisualContrastResolving = new WeakSet();
  let scanGeneration = 0;

  const rememberVisualContrastAnalysis = (result) => {
    if (!result?.selector) {
      lastVisualContrastAnalyses.push(result);

      return;
    }
    const index = lastVisualContrastAnalyses.findIndex(
      (item) => item.selector === result.selector
    );

    if (index === -1) {
      lastVisualContrastAnalyses.push(result);
    } else {
      lastVisualContrastAnalyses[index] = result;
    }
  };

  const disconnectLazyVisualContrastObserver = () => {
    if (lazyVisualContrastObserver) {
      lazyVisualContrastObserver.disconnect();
      lazyVisualContrastObserver = null;
    }
    lazyVisualContrastPending = new WeakMap();
  };

  const addVisualContrastResult = (groupMap, result, options = {}) => {
    if (result.status !== 'fail' || !result.finding || !result.selector)
      return false;
    let element = null;

    try {
      element = document.querySelector(result.selector);
    } catch {
      element = null;
    }
    if (!element) return false;
    const findingType =
      result.finding.type || result.finding.id || 'low-contrast';
    const existing = groupMap.get(element) || [];
    if (existing.some((f) => (f.type || f.id) === findingType)) return false;
    addBrowserFindings(groupMap, element, [
      {
        detail: result.finding.detail || result.finding.snippet,
        type: findingType,
      },
    ]);

    if (
      options.decorate &&
      element !== document.body &&
      element !== document.documentElement
    ) {
      highlight(element, groupMap.get(element) || []);
    }

    return true;
  };

  const scanResultMeta = (options = {}) => {
    const {scanId} = options;
    if (typeof scanId !== 'string' && typeof scanId !== 'number') return {};

    return {scanId: String(scanId)};
  };

  const postSerializedFindings = (groupMap, options = {}) => {
    if (!EXTENSION_MODE) return;
    const allFindings = browserFindingsFromMap(groupMap);
    window.postMessage(
      {
        count: allFindings.length,
        findings: serializeFindings(allFindings),
        source: 'impeccable-results',
        ...scanResultMeta(options),
      },
      '*'
    );
  };

  const postExtensionError = (error) => {
    if (!EXTENSION_MODE) return;
    window.postMessage(
      {
        message: error?.message || String(error),
        source: 'impeccable-error',
      },
      '*'
    );
  };

  const reportVisualContrastError = (error, detail = {}) => {
    window.dispatchEvent(
      new CustomEvent('impeccable-visual-contrast-error', {
        detail: {
          ...detail,
          message: error?.message || String(error),
        },
      })
    );

    if (EXTENSION_MODE) {
      postExtensionError(error);
    } else {
      console.warn('[impeccable] visual contrast scan failed', error);
    }
  };

  const scheduleLazyVisualContrast = (
    groupMap,
    analyses,
    options = {},
    runtime = {}
  ) => {
    disconnectLazyVisualContrastObserver();
    if (
      options.visualContrastLazy === false ||
      options.scrollOffscreen !== false
    )
      return;
    if (typeof IntersectionObserver === 'undefined') return;
    const unresolved = (analyses || []).filter(
      (result) =>
        result?.status === 'unresolved' &&
        result.reason === 'text outside viewport' &&
        result.selector
    );
    if (unresolved.length === 0) return;
    const generation = runtime.generation || scanGeneration;

    lazyVisualContrastObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target;
          const candidate = lazyVisualContrastPending.get(element);
          if (!candidate || lazyVisualContrastResolving.has(element)) continue;
          lazyVisualContrastObserver?.unobserve(element);
          lazyVisualContrastPending.delete(element);
          lazyVisualContrastResolving.add(element);
          waitForVisualPaint()
            .then(() => analyzeVisualContrastCandidate(candidate))
            .then((result) => {
              if (generation !== scanGeneration) return;
              rememberVisualContrastAnalysis(result);
              const added = addVisualContrastResult(groupMap, result, {
                decorate: true,
              });

              if (added) {
                postSerializedFindings(groupMap, options);
                window.dispatchEvent(
                  new CustomEvent('impeccable-visual-contrast-resolved', {
                    detail: {
                      finding: result.finding || null,
                      selector: result.selector,
                      status: result.status,
                    },
                  })
                );
              }
            })
            .catch((error) => {
              reportVisualContrastError(error, {selector: candidate.selector});
            })
            .finally(() => {
              lazyVisualContrastResolving.delete(element);
            });
        }
      },
      {threshold: 0.5}
    );

    for (const candidate of unresolved) {
      let element = null;

      try {
        element = document.querySelector(candidate.selector);
      } catch {
        element = null;
      }
      if (!element) continue;
      lazyVisualContrastPending.set(element, candidate);
      lazyVisualContrastObserver.observe(element);
    }
  };

  const addVisualContrastFindings = async (
    groupMap,
    options = {},
    runtime = {}
  ) => {
    if (!shouldRunVisualContrast(options)) {
      lastVisualContrastAnalyses = [];
      disconnectLazyVisualContrastObserver();

      return [];
    }
    const resolvedOptions = visualContrastOptions(options);
    const analyses = await analyzeVisualContrast(resolvedOptions);
    if (runtime.generation && runtime.generation !== scanGeneration)
      return analyses;
    lastVisualContrastAnalyses = analyses;

    for (const result of analyses) {
      addVisualContrastResult(groupMap, result, {decorate: runtime.decorate});
    }
    if (runtime.decorate || runtime.scheduleLazy)
      scheduleLazyVisualContrast(groupMap, analyses, resolvedOptions, runtime);

    return analyses;
  };

  const collectBrowserFindingsAsync = async (options = {}, runtime = {}) => {
    const collected = collectBrowserFindings();
    await addVisualContrastFindings(collected.groupMap, options, runtime);

    return {
      ...collected,
      allFindings: browserFindingsFromMap(collected.groupMap),
      visualContrastAnalyses: lastVisualContrastAnalyses,
    };
  };

  const clearOverlays = () => {
    scanGeneration += 1;
    disconnectLazyVisualContrastObserver();
    for (const o of overlays) detachOverlay(o);
    overlays.length = 0;
    visibilityObserver.disconnect();
    overlayIndex = 0;
  };

  const renderBrowserFindings = (collected, options = {}) => {
    const {allFindings, pageLevelFindings} = collected;

    for (const {el, findings} of allFindings) {
      if (el === document.body || el === document.documentElement) continue;
      highlight(el, findings);
    }

    if (pageLevelFindings.length > 0) {
      showPageBanner(pageLevelFindings);
    }

    if (!EXTENSION_MODE) printSummary(allFindings);

    // In extension mode, post serialized results for the DevTools panel
    if (EXTENSION_MODE) {
      window.postMessage(
        {
          count: allFindings.length,
          findings: serializeFindings(allFindings),
          source: 'impeccable-results',
          ...scanResultMeta(options),
        },
        '*'
      );
    }

    // After this scan completes, all subsequent reveals are instant (no stagger, no animation)
    setTimeout(() => {
      firstScanDone = true;
    }, 1000);

    return allFindings;
  };

  let firstScanDone = false;

  const scan = (options = {}) => {
    clearOverlays();
    const generation = scanGeneration;
    const collected = collectBrowserFindings();
    const allFindings = renderBrowserFindings(collected, options);

    if (shouldRunVisualContrast(options)) {
      addVisualContrastFindings(collected.groupMap, options, {
        decorate: true,
        generation,
      })
        .then(() => {
          if (generation === scanGeneration)
            postSerializedFindings(collected.groupMap, options);
        })
        .catch((error) => {
          reportVisualContrastError(error);
        });
    }

    return allFindings;
  };

  const scanAsync = async (options = {}) => {
    clearOverlays();
    const generation = scanGeneration;

    if (shouldRunVisualContrast(options)) {
      const collected = await collectBrowserFindingsAsync(options, {
        generation,
        scheduleLazy: true,
      });
      if (generation !== scanGeneration) return [];

      return renderBrowserFindings(collected, options);
    }
    lastVisualContrastAnalyses = [];

    return renderBrowserFindings(collectBrowserFindings(), options);
  };

  const detect = (options = {}) => {
    lastVisualContrastAnalyses = [];
    const {allFindings} = collectBrowserFindings();

    return options.serialize === false ?
        allFindings
      : serializeFindings(allFindings);
  };

  const detectAsync = async (options = {}) => {
    if (shouldRunVisualContrast(options)) {
      const {allFindings} = await collectBrowserFindingsAsync(options);

      return options.serialize === false ?
          allFindings
        : serializeFindings(allFindings);
    }
    lastVisualContrastAnalyses = [];
    const {allFindings} = collectBrowserFindings();

    return options.serialize === false ?
        allFindings
      : serializeFindings(allFindings);
  };

  if (EXTENSION_MODE) {
    // Extension mode: listen for commands, don't auto-scan
    window.addEventListener('message', (e) => {
      if (
        e.source !== window ||
        !e.data ||
        e.data.source !== 'impeccable-command'
      )
        return;

      if (e.data.action === 'scan') {
        if (e.data.config) window.__IMPECCABLE_CONFIG__ = e.data.config;

        try {
          scan(e.data.config || {});
        } catch (error) {
          postExtensionError(error);
        }
      }

      if (e.data.action === 'toggle-overlays') {
        const visible = !document.body.classList.contains('impeccable-hidden');
        document.body.classList.toggle('impeccable-hidden', visible);
        window.postMessage(
          {source: 'impeccable-overlays-toggled', visible: !visible},
          '*'
        );
      }

      if (e.data.action === 'remove') {
        clearOverlays();
        styleElement.remove();

        if (spotlightBackdrop) {
          spotlightBackdrop.remove();
          spotlightBackdrop = null;
        }
        document.body.classList.remove('impeccable-hidden');
      }

      if (e.data.action === 'highlight') {
        try {
          const target =
            e.data.selector ? document.querySelector(e.data.selector) : null;

          if (target) {
            // Scroll first so positionOverlay reads the post-scroll rect
            if (!isInViewport(target) && target.scrollIntoView) {
              target.scrollIntoView({behavior: 'instant', block: 'center'});
            }

            for (const o of overlays) {
              if (o.classList.contains('impeccable-banner')) continue;
              const isMatch = o._targetEl === target;
              o.classList.toggle('impeccable-spotlight', isMatch);
              o.classList.toggle('impeccable-spotlight-dimmed', !isMatch);

              if (isMatch) {
                // Force the matching overlay visible immediately, don't wait for IntersectionObserver
                o.style.display = '';
                o.style.animation = 'none';
                o.classList.add('impeccable-visible');
                o._revealed = true;
                positionOverlay(o);
              }
            }
            showSpotlight(target);
          }
        } catch {
          /* invalid selector */
        }
      }

      if (e.data.action === 'unhighlight') {
        hideSpotlight();

        for (const o of overlays) {
          o.classList.remove(
            'impeccable-spotlight',
            'impeccable-spotlight-dimmed'
          );
        }
      }
    });
    window.postMessage({source: 'impeccable-ready'}, '*');
  } else if (window.__IMPECCABLE_CONFIG__?.autoScan !== false) {
    const runAutoScan = () => {
      try {
        scan();
      } catch (error) {
        console.warn('[impeccable] scan failed', error);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () =>
        setTimeout(runAutoScan, 100)
      );
    } else {
      setTimeout(runAutoScan, 100);
    }
  }

  window.impeccableDetect = detect;
  window.impeccableDetectAsync = detectAsync;
  window.impeccableScan = scan;
  window.impeccableScanAsync = scanAsync;
  window.impeccableCollectVisualContrastCandidates =
    collectVisualContrastCandidates;
  window.impeccableAnalyzeVisualContrast = analyzeVisualContrast;
  window.impeccableGetLastVisualContrastAnalyses = () => [
    ...lastVisualContrastAnalyses,
  ];
}
