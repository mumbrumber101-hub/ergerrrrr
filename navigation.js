/* Keep the original tab controls; disclose the less-used research tools. */
(() => {
  'use strict';
  if (window.__aaeEcologicalNavigation) return;

  function init() {
    if (window.__aaeEcologicalNavigation) return;
    const nav = document.querySelector('nav.tabs');
    const primaryTab = document.getElementById('tab-passages');
    const advancedTab = document.getElementById('tab-patterns');
    const groupSelector = '.aae-tab-group,.aae-nav-group';
    const primary = primaryTab && primaryTab.closest(groupSelector);
    const advanced = advancedTab && advancedTab.closest(groupSelector);
    if (!nav || !primary || !advanced || primary === advanced || !nav.contains(primary) || !nav.contains(advanced)) return;
    window.__aaeEcologicalNavigation = { version: 'tools-disclosure-1' };

    const groups = advanced.parentNode;
    const details = document.createElement('details');
    details.id = 'aae-tools-disclosure';
    details.className = 'aae-tools-disclosure';
    const summary = document.createElement('summary');
    summary.id = 'aae-tools-summary';
    summary.className = 'aae-tools-summary';
    summary.append(document.createTextNode('Tools'));
    const selection = document.createElement('span');
    selection.className = 'aae-tools-selection';
    selection.hidden = true;
    summary.append(selection);
    groups.insertBefore(details, advanced);
    details.append(summary, advanced);
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Ecological research sections');
    nav.classList.add('aae-disclosure-nav');
    groups.classList.add('aae-disclosure-groups');
    primary.classList.add('aae-primary-tabs');
    advanced.classList.add('aae-tools-tabs');
    primary.setAttribute('role', 'tablist');
    primary.setAttribute('aria-label', 'Browse ecological passages');
    advanced.setAttribute('role', 'tablist');
    advanced.setAttribute('aria-label', 'Advanced ecological tools');
    const advancedLabel = advanced.querySelector('.aae-tab-group-label,.aae-nav-label');
    if (advancedLabel) advancedLabel.hidden = true;

    const lastFocused = new Map();
    let activeKey = null;
    let queued = false;
    let requestedOpen = false;
    const allTabs = group => [...group.querySelectorAll('[role="tab"][data-panel]')];
    const availableTabs = (group, rendered = false) => allTabs(group).filter(tab =>
      !tab.disabled && !tab.closest('[hidden]') &&
      (group !== advanced || details.open) && (!rendered || tab.getClientRects().length));

    function setTabStops(group) {
      const visible = availableTabs(group);
      const selected = visible.find(tab => tab.getAttribute('aria-selected') === 'true');
      const remembered = lastFocused.get(group);
      const stop = selected || (visible.includes(remembered) ? remembered : visible[0]);
      allTabs(group).forEach(tab => {
        const value = tab === stop ? 0 : -1;
        if (tab.tabIndex !== value) tab.tabIndex = value;
      });
    }

    function sync({ forceOpen = false, allowOpen = true } = {}) {
      const selected = [...allTabs(primary), ...allTabs(advanced)].find(tab => tab.getAttribute('aria-selected') === 'true');
      const key = selected ? selected.dataset.panel : '';
      const toolSelected = !!(selected && advanced.contains(selected));
      if (toolSelected && allowOpen && (forceOpen || key !== activeKey)) details.open = true;
      activeKey = key;
      const label = toolSelected ? ' · ' + selected.textContent.trim() : '';
      if (selection.textContent !== label) selection.textContent = label;
      if (selection.hidden === toolSelected) selection.hidden = !toolSelected;
      if (details.classList.contains('has-active-tool') !== toolSelected) details.classList.toggle('has-active-tool', toolSelected);
      setTabStops(primary);
      setTabStops(advanced);
    }

    function queueSync(forceOpen = false) {
      requestedOpen = requestedOpen || forceOpen;
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const force = requestedOpen;
        requestedOpen = false;
        sync({ forceOpen: force });
      });
    }

    function activate(tab) {
      if (advanced.contains(tab)) details.open = true;
      tab.click(); // The native application still owns panel changes and history.
      sync();
      tab.focus({ preventScroll: true });
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    // Native document key handling includes every tab, including hidden Tools.
    // Intercept only navigation keys within these two groups and activate the same buttons.
    nav.addEventListener('keydown', event => {
      const tab = event.target.closest('[role="tab"][data-panel]');
      const group = tab && (primary.contains(tab) ? primary : advanced.contains(tab) ? advanced : null);
      if (!group) return;
      if (event.key === 'Escape' && group === advanced) {
        event.preventDefault();
        event.stopPropagation();
        details.open = false;
        summary.focus({ preventScroll: true });
        sync({ allowOpen: false });
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const visible = availableTabs(group, true);
      if (!visible.length) { summary.focus({ preventScroll: true }); return; }
      const current = visible.indexOf(tab);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 :
        (current + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
      activate(visible[index]);
    }, true);

    nav.addEventListener('click', event => {
      const tab = event.target.closest('[role="tab"][data-panel]');
      if (tab && advanced.contains(tab)) details.open = true;
      queueSync();
    }, true);
    nav.addEventListener('focusin', event => {
      const tab = event.target.closest('[role="tab"][data-panel]');
      const group = tab && (primary.contains(tab) ? primary : advanced.contains(tab) ? advanced : null);
      if (!group) return;
      if (group === advanced) details.open = true;
      lastFocused.set(group, tab);
      setTabStops(group);
    });
    details.addEventListener('toggle', () => {
      if (!details.open && advanced.contains(document.activeElement)) summary.focus({ preventScroll: true });
      sync({ allowOpen: false });
    });
    const observer = new MutationObserver(() => queueSync());
    observer.observe(nav, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
    document.querySelectorAll('.panel').forEach(panel => observer.observe(panel, { attributes: true, attributeFilter: ['class'] }));
    window.addEventListener('hashchange', () => queueSync(true));
    window.addEventListener('popstate', () => queueSync(true));
    document.addEventListener('click', event => {
      if (event.target.closest('#backBtn')) queueSync(true);
    }, true);
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
