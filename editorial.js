/* Progressive controls for the existing Ecological Lafferty application.
 * The corpus, native passage actions, and native tab keyboard handler are retained.
 */
(() => {
  'use strict';
  if (window.__aaeEcologicalEnhancement) return;

  function init() {
    const tabs = document.querySelector('nav.tabs[role="tablist"]');
    const speciesPanel = document.getElementById('speciesPanel');
    const speciesIndex = document.getElementById('speciesIndex');
    const speciesSearch = document.getElementById('speciesSearch');
    const passagesPanel = document.getElementById('passagesPanel');
    if (!tabs || !speciesPanel || !speciesIndex || !speciesSearch || !passagesPanel) return;
    if (window.__aaeEcologicalEnhancement) return;
    window.__aaeEcologicalEnhancement = { version: 'species-layout-2' };

    const state = {
      origin: null,
      activePanel: null,
      action: null,
      awaitingResults: false,
      explicitReturn: false,
      queued: false,
      categorySignature: ''
    };
    const number = value => Number(value).toLocaleString();
    const plural = (value, one, many = one + 's') => Number(value) === 1 ? one : many;
    const setText = (element, value) => {
      if (element.textContent !== value) element.textContent = value;
    };
    let speciesAliases;
    function aliasesFor(canonical) {
      if (!speciesAliases) {
        speciesAliases = new Map();
        // Match the native index's normalization, preserving each original name.
        // data-variants is space-joined and cannot recover multiword alias boundaries.
        if (typeof DATABASE !== 'undefined' && typeof normalizeSpecies === 'function') {
          DATABASE.entries.forEach(entry => (entry.species_mentioned || []).forEach(raw => {
            const key = normalizeSpecies(raw).toLowerCase();
            if (!speciesAliases.has(key)) speciesAliases.set(key, new Set());
            speciesAliases.get(key).add(raw);
          }));
        }
      }
      return [...(speciesAliases.get(canonical) || [])];
    }

    // One tablist keeps the original Arrow/Home/End and roving-tabindex behavior.
    // The two groups are presentational; original buttons and panel IDs are moved intact.
    const tabGroups = document.createElement('div');
    tabGroups.className = 'aae-nav-groups';
    tabGroups.setAttribute('role', 'presentation');
    const definitions = [
      ['Browse', ['passages', 'works', 'species', 'fieldguide', 'places', 'weather', 'geology', 'water', 'flora']],
      ['Tools', ['patterns', 'tags', 'concepts', 'motifs', 'network', 'compare', 'notebook']]
    ];
    const originalTabs = [...tabs.querySelectorAll('[role="tab"][data-panel]')];
    definitions.forEach(([label, names]) => {
      const group = document.createElement('div');
      group.className = 'aae-nav-group';
      group.setAttribute('role', 'presentation');
      const caption = document.createElement('span');
      caption.className = 'aae-nav-label';
      caption.textContent = label;
      caption.setAttribute('aria-hidden', 'true');
      group.append(caption);
      names.forEach(name => {
        const tab = originalTabs.find(element => element.dataset.panel === name);
        if (tab) group.append(tab);
      });
      tabGroups.append(group);
    });
    // Future tabs must stay available rather than being discarded by this enhancement.
    originalTabs.filter(tab => !tabGroups.contains(tab)).forEach(tab => tabGroups.lastElementChild.append(tab));
    tabs.append(tabGroups);
    tabs.setAttribute('aria-label', 'Ecological research sections');

    const toolbar = speciesPanel.querySelector('.toolbar');
    const category = document.createElement('select');
    category.id = 'speciesCategory';
    category.setAttribute('aria-label', 'Filter species by category');
    const allCategories = document.createElement('option');
    allCategories.value = '';
    allCategories.textContent = 'All categories';
    category.append(allCategories);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.id = 'speciesClear';
    clear.className = 'clear-all-btn';
    clear.textContent = 'Clear filters';
    const status = document.createElement('p');
    status.id = 'speciesStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const empty = document.createElement('p');
    empty.id = 'speciesEmpty';
    empty.className = 'empty-state';
    empty.hidden = true;
    empty.textContent = 'No species names match these filters. Try another name or clear the filters.';
    toolbar.append(category, clear);
    toolbar.after(status, empty);
    speciesSearch.type = 'search';
    speciesSearch.setAttribute('aria-label', 'Find a species by name or alias');

    const resultContext = document.createElement('div');
    resultContext.id = 'speciesResultContext';
    resultContext.className = 'species-results-context';
    resultContext.hidden = true;
    const returnButton = document.createElement('button');
    returnButton.id = 'speciesReturn';
    returnButton.type = 'button';
    returnButton.className = 'back-btn';
    returnButton.textContent = 'Back to species';
    const resultHeading = document.createElement('h2');
    resultHeading.id = 'speciesResultHeading';
    resultHeading.tabIndex = -1;
    resultContext.append(returnButton, resultHeading);
    passagesPanel.prepend(resultContext);

    function groups() {
      return [...speciesIndex.querySelectorAll('.species-category-group')];
    }

    function groupName(group) {
      const heading = group.querySelector('.species-category-header');
      return heading ? [...heading.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent).join('').trim() : '';
    }

    function refreshSpecies() {
      const categories = groups().map(group => ({
        group,
        name: groupName(group),
        total: group.querySelectorAll('.index-item').length
      }));
      const signature = JSON.stringify(categories.map(item => [item.name, item.total]));
      if (signature !== state.categorySignature) {
        const selected = category.value;
        category.replaceChildren(allCategories);
        categories.forEach(item => {
          const option = document.createElement('option');
          option.value = item.name;
          option.textContent = `${item.name} (${number(item.total)})`;
          category.append(option);
        });
        category.value = categories.some(item => item.name === selected) ? selected : '';
        state.categorySignature = signature;
      }
      speciesIndex.querySelectorAll('.index-item').forEach(row => {
        const count = row.querySelector('.count');
        const values = count && count.textContent.trim().match(/^(\d[\d,]*)\s+passages?\s*·\s*(\d[\d,]*)\s+works?$/);
        if (values) {
          const passages = Number(values[1].replace(/,/g, ''));
          const works = Number(values[2].replace(/,/g, ''));
          setText(count, `${number(passages)} ${plural(passages, 'passage')} · ${number(works)} ${plural(works, 'work')}`);
        }
        const photo = row.querySelector('[data-field-guide-species]');
        const photoCount = photo && photo.textContent.match(/(?:Photographs|Photos?)\s*\((\d+)\)/i);
        if (photoCount) {
          const total = Number(photoCount[1]);
          // Keep the native, species-specific accessible name unchanged.
          setText(photo, `${plural(total, 'Photo')} (${number(total)})`);
        }
      });
      filterSpecies();
    }

    function filterSpecies() {
      const query = speciesSearch.value.trim().toLowerCase();
      let total = 0;
      let visible = 0;
      groups().forEach(group => {
        const name = groupName(group);
        let visibleInGroup = 0;
        const rows = [...group.querySelectorAll('.index-item')];
        rows.forEach(row => {
          const canonical = (row.dataset.canonical || '').toLowerCase();
          const canonicalMatch = canonical.includes(query);
          const aliases = query && !canonicalMatch ? aliasesFor(canonical) : [];
          const alternate = aliases.find(alias => alias.toLowerCase() === query) ||
            aliases.find(alias => alias.toLowerCase().includes(query));
          const match = (!category.value || category.value === name) && (canonicalMatch || !!alternate);
          row.hidden = !match;
          let note = row.querySelector('.aae-alias-match');
          const showAlias = match && !!query && !canonicalMatch && !!alternate;
          if (showAlias && !note) {
            note = document.createElement('span');
            note.className = 'aae-alias-match';
            row.querySelector('.species-passage-link').append(note);
          }
          if (note) {
            note.hidden = !showAlias;
            if (showAlias) setText(note, 'Matched alternate name: ' + alternate);
          }
          total += 1;
          if (match) { visible += 1; visibleInGroup += 1; }
        });
        group.hidden = visibleInGroup === 0;
        const count = group.querySelector('.species-category-header span');
        if (count) {
          setText(count, `(${number(visibleInGroup)})`);
          count.title = `${number(visibleInGroup)} matching ${plural(visibleInGroup, 'name')} of ${number(rows.length)} in this category`;
        }
      });
      setText(status, `${number(visible)} of ${number(total)} ${plural(total, 'species name')} shown${category.value ? ' · ' + category.value : ''}.`);
      empty.hidden = visible !== 0 || total === 0;
      clear.disabled = !query && !category.value;
    }

    // Run after the native alias-search handler, including when it is added lazily.
    speciesSearch.addEventListener('input', () => queueMicrotask(filterSpecies));
    category.addEventListener('change', filterSpecies);
    clear.addEventListener('click', () => {
      speciesSearch.value = '';
      category.value = '';
      speciesSearch.dispatchEvent(new Event('input', { bubbles: true }));
      filterSpecies();
      speciesSearch.focus();
    });

    function rememberSpecies(button) {
      state.origin = {
        button,
        canonical: button.dataset.speciesLink,
        query: speciesSearch.value,
        category: category.value,
        x: window.scrollX,
        y: window.scrollY
      };
      state.awaitingResults = true;
      state.action = 'species';
    }

    function restoreSpecies() {
      const origin = state.origin;
      if (!origin) return;
      speciesSearch.value = origin.query;
      category.value = [...category.options].some(option => option.value === origin.category) ? origin.category : '';
      filterSpecies();
      const button = origin.button.isConnected ? origin.button :
        [...speciesIndex.querySelectorAll('[data-species-link]')].find(item => item.dataset.speciesLink === origin.canonical);
      requestAnimationFrame(() => {
        if (!speciesPanel.classList.contains('active')) return;
        if (button && !button.closest('.index-item').hidden) button.focus({ preventScroll: true });
        else speciesSearch.focus({ preventScroll: true });
        window.scrollTo({ left: origin.x, top: origin.y, behavior: 'instant' });
      });
    }

    function syncResultContext() {
      const selected = document.getElementById('speciesSelect');
      const count = document.getElementById('visibleCount');
      const relevant = !!(state.origin && passagesPanel.classList.contains('active') && selected &&
        selected.value.toLowerCase() === state.origin.canonical.toLowerCase());
      resultContext.hidden = !relevant;
      if (!relevant) return;
      const total = count ? Number(count.textContent.replace(/,/g, '')) : 0;
      setText(resultHeading, `${number(total)} ${plural(total, 'passage')} for ${state.origin.canonical}`);
      if (state.awaitingResults) {
        state.awaitingResults = false;
        requestAnimationFrame(() => {
          if (resultContext.hidden) return;
          resultHeading.focus({ preventScroll: true });
          resultContext.scrollIntoView({ block: 'start', behavior: 'instant' });
        });
      }
    }

    function syncReadingControl(active) {
      const button = document.getElementById('passagesOnlyToggle');
      const container = button && button.closest('.view-controls');
      if (!button || !container) return;
      const panel = document.getElementById(active + 'Panel');
      const relevant = !!(panel && (active === 'passages' || panel.querySelector('article.entry')));
      container.hidden = !relevant;
      // A toggle keeps a stable label so aria-pressed names the active mode correctly.
      const reading = button.getAttribute('aria-pressed') === 'true';
      setText(button, 'Reading view');
      button.setAttribute('aria-label', 'Reading view');
      button.title = reading ? 'Show full passage notes' : 'Show passages without notes';
    }

    function syncPanels() {
      state.queued = false;
      const panel = document.querySelector('.panel.active');
      const active = panel ? panel.id.replace(/Panel$/, '') : '';
      const changed = active !== state.activePanel;
      state.activePanel = active;
      if (changed && active === 'species' && state.origin && (state.explicitReturn || state.action === 'back')) {
        restoreSpecies();
      }
      if (changed) {
        state.action = null;
        state.explicitReturn = false;
      }
      syncReadingControl(active);
      syncResultContext();
    }

    function scheduleSync() {
      if (state.queued) return;
      state.queued = true;
      queueMicrotask(syncPanels);
    }

    // Capture the originating item before the application's delegated click changes panels.
    document.addEventListener('click', event => {
      const target = event.target.closest('button,a');
      if (!target) return;
      if (speciesIndex.contains(target) && target.hasAttribute('data-species-link')) rememberSpecies(target);
      else if (target.id === 'backBtn') state.action = 'back';
      else if (target.dataset.panel) state.action = state.explicitReturn ? 'return' : 'tab';
      scheduleSync();
    }, true);

    returnButton.addEventListener('click', () => {
      state.explicitReturn = true;
      const speciesTab = document.getElementById('tab-species');
      if (speciesTab) speciesTab.click();
      scheduleSync();
    });

    new MutationObserver(refreshSpecies).observe(speciesIndex, { childList: true });
    const panelObserver = new MutationObserver(scheduleSync);
    document.querySelectorAll('.panel').forEach(panel => {
      // Lists arrive lazily; this also makes the reading control contextual in sub-index detail views.
      panelObserver.observe(panel, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
      });
    });
    const readingButton = document.getElementById('passagesOnlyToggle');
    if (readingButton) panelObserver.observe(readingButton, { attributes: true, attributeFilter: ['aria-pressed'] });
    refreshSpecies();
    syncPanels();
    const requestedView = new URLSearchParams(window.location.search).get('view');
    const requestedTab = originalTabs.find(tab => tab.dataset.panel === requestedView);
    if (requestedTab && requestedView !== state.activePanel) requestedTab.click();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
