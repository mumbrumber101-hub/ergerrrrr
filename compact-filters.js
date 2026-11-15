/* Compact passage filters reuse the native controls and their event handlers. */
(() => {
  'use strict';
  if (window.__aaeCompactFilters) return;

  function init() {
    if (window.__aaeCompactFilters) return;
    const panel = document.getElementById('passagesPanel');
    const toolbar = panel && panel.querySelector('.toolbar');
    const search = document.getElementById('searchInput');
    const filters = ['categorySelect', 'storySelect', 'speciesSelect'].map(id => document.getElementById(id));
    if (!toolbar || !search || filters.some(control => !control || !toolbar.contains(control))) return;
    window.__aaeCompactFilters = { version: 'compact-filters-1' };

    const details = document.createElement('details');
    details.id = 'aae-passage-filters';
    details.hidden = true;
    const summary = document.createElement('summary');
    summary.id = 'aae-filter-summary';
    summary.textContent = 'Filters (0 active)';
    const fields = document.createElement('div');
    fields.className = 'aae-filter-fields';
    details.append(summary, fields);

    const count = toolbar.querySelector('.count-display');
    const random = toolbar.querySelector('.random-discovery-btn');
    const clear = toolbar.querySelector('[data-clear-all]');
    const actions = document.createElement('div');
    actions.className = 'aae-passage-actions';
    actions.hidden = true;
    const labels = filters.map((control, index) => {
      const label = document.createElement('label');
      label.className = 'aae-filter-field';
      label.htmlFor = control.id;
      const caption = document.createElement('span');
      caption.textContent = ['Category', 'Work', 'Species'][index];
      label.append(caption);
      fields.append(label);
      return label;
    });

    // Comment anchors restore the original desktop DOM order, including tab order.
    const managed = [...filters, count, random, clear].filter(Boolean);
    const anchors = new Map();
    managed.forEach(control => {
      const anchor = document.createComment('aae desktop position: ' + (control.id || control.className));
      control.parentNode.insertBefore(anchor, control);
      anchors.set(control, anchor);
    });
    toolbar.insertBefore(details, anchors.get(filters[0]));
    toolbar.append(actions);

    const media = window.matchMedia('(max-width: 650px)');
    let compact = null;

    function syncCount() {
      const active = filters.filter(control => String(control.value).trim() !== '').length;
      const text = `Filters (${active} active)`;
      if (summary.textContent !== text) summary.textContent = text;
    }

    function restore(control) {
      const anchor = anchors.get(control);
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(control, anchor.nextSibling);
    }

    function applyLayout() {
      const next = media.matches;
      if (next === compact) { syncCount(); return; }
      const focused = document.activeElement;
      const focusedControl = managed.find(control => control === focused || control.contains(focused));
      const summaryFocused = focused === summary;
      compact = next;

      if (compact) {
        // A focused select must never disappear into a newly collapsed disclosure.
        if (filters.includes(focusedControl)) details.open = true;
        details.hidden = false;
        actions.hidden = false;
        filters.forEach((control, index) => labels[index].append(control));
        if (count) toolbar.insertBefore(count, details);
        if (clear) actions.append(clear);
        if (random) actions.append(random);
        toolbar.classList.add('aae-compact-toolbar');
      } else {
        managed.forEach(restore);
        details.hidden = true;
        actions.hidden = true;
        toolbar.classList.remove('aae-compact-toolbar');
      }

      if (focusedControl && focusedControl.isConnected) focusedControl.focus({ preventScroll: true });
      else if (!compact && summaryFocused) filters[0].focus({ preventScroll: true });
      syncCount();
    }

    filters.forEach(control => control.addEventListener('change', () => queueMicrotask(syncCount)));
    if (clear) clear.addEventListener('click', () => queueMicrotask(syncCount));
    // Native tag/species navigation and restored links update the same result count.
    // Observe only its text, not the toolbar that this enhancement moves.
    const visibleCount = document.getElementById('visibleCount');
    if (visibleCount) new MutationObserver(syncCount).observe(visibleCount, { childList: true, characterData: true, subtree: true });
    if (typeof media.addEventListener === 'function') media.addEventListener('change', applyLayout);
    else media.addListener(applyLayout);
    applyLayout();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
