/* Public result links only. Notebook notes and other private state are excluded. */
(() => {
  'use strict';
  if (window.aaeResults) return;
  const MAX_QUERY = 1000;
  const MAX_URL = 7000;
  const fields = { search: 'q', category: 'category', story: 'work', species: 'species', crossTag: 'tag', tagType: 'tagType', verification: 'verification' };

  function init() {
    const entries = document.getElementById('entriesContainer');
    const speciesIndex = document.getElementById('speciesIndex');
    if (!entries || !speciesIndex || typeof applyFilters !== 'function') return;
    const panels = new Set([...document.querySelectorAll('.tab[data-panel]')].map(tab => tab.dataset.panel));
    const source = typeof uiEntries === 'function' ? uiEntries() : [];
    const allowed = {
      category: new Set(source.map(entry => entry.category_primary)),
      story: new Set(source.map(entry => entry.story_title)),
      species: new Set(source.flatMap(entry => entry.species_mentioned || []).map(name => name.toLowerCase())),
      verification: new Set(source.map(entry => entry.source?.verification || 'pending'))
    };
    const tags = {
      species: allowed.species,
      keyword: new Set(source.flatMap(entry => entry.keywords || []).map(name => name.toLowerCase())),
      cross: new Set(source.flatMap(entry => entry.cross_tags || []).map(name => name.toLowerCase()))
    };
    const maximumPage = Math.max(1, Math.ceil(source.length / (typeof UI_PAGE_SIZE === 'number' ? UI_PAGE_SIZE : 50)));
    let filterNodes = null;
    let filterState = '';
    let pendingInput = false;
    let queued = false;
    let lastURL;
    let readingChange = null;
    const controls = [];
    const activeView = () => document.querySelector('.tab[aria-selected="true"]')?.dataset.panel || 'passages';
    const scope = () => window.aaePassages?.getScope() === 'passage' ? 'passage' : 'all';
    const wholeWords = () => window.aaePassages?.getWholeWords?.() === true;
    const snapshot = () => JSON.stringify([Object.keys(fields).map(key => String(activeFilters[key] || '')), Number(uiPage) || 1, scope(), wholeWords()]);
    const readText = value => typeof value === 'string' && value.length <= MAX_QUERY && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value) ? value : '';
    const currentChildren = () => [...entries.children];
    const sameChildren = () => filterNodes && filterNodes.length === entries.children.length && filterNodes.every((node, i) => node === entries.children[i]);

    function baseURL(view) {
      const url = new URL('./editorial.html', window.location.href);
      const current = new URLSearchParams(window.location.search);
      for (const key of ['design', 'v']) {
        const value = current.get(key);
        if (value && /^[a-zA-Z0-9._-]{1,80}$/.test(value)) url.searchParams.set(key, value);
      }
      url.searchParams.set('view', panels.has(view) ? view : 'passages');
      return url;
    }

    function knownPassage(id) {
      if (!id || id.length > 200) return false;
      return source.some(entry => entry.id === id) ||
        !!(typeof DATABASE !== 'undefined' && (Object.prototype.hasOwnProperty.call(DATABASE.redirects || {}, id) || (DATABASE.retired_entries || []).some(entry => entry.id === id)));
    }

    function directPassage() {
      if (!entries.querySelector('.single-entry-notice')) return null;
      const article = entries.querySelector('article.entry[data-entry-id]');
      const id = article?.dataset.entryId;
      return knownPassage(id) ? id : null;
    }

    function resultURL() {
      const view = activeView();
      const url = baseURL(view);
      if (view === 'species') {
        const query = document.getElementById('speciesSearch')?.value || '';
        const category = document.getElementById('speciesCategory')?.value || '';
        if (readText(query) !== query) return null;
        if (query) url.searchParams.set('q', query);
        if (category) url.searchParams.set('category', category);
      } else if (view === 'passages') {
        if (pendingInput) return null;
        const passage = directPassage();
        if (passage) {
          url.hash = 'passage=' + encodeURIComponent(passage);
        } else {
          // A native pattern/photo list may replace the main results without changing filters.
          // Do not label those lists with stale filter parameters.
          if (!sameChildren() || filterState !== snapshot()) return null;
          for (const [key, parameter] of Object.entries(fields)) {
            const value = String(activeFilters[key] || '');
            if (readText(value) !== value) return null;
            if (value) url.searchParams.set(parameter, value);
          }
          if (scope() !== 'all') url.searchParams.set('scope', scope());
          if (wholeWords()) url.searchParams.set('whole', '1');
          if (Number(uiPage) > 1) url.searchParams.set('page', String(uiPage));
        }
      }
      // Other panels open as sections; no notebook notes or in-memory selections are encoded.
      return url.href.length <= MAX_URL ? url.href : null;
    }

    function addControls(view) {
      const panel = document.getElementById(view + 'Panel');
      if (!panel) return;
      const box = document.createElement('div');
      box.className = 'aae-results-tools';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'aae-copy-results';
      copy.textContent = 'Copy results link';
      const status = document.createElement('span');
      status.className = 'aae-results-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const fallback = document.createElement('div');
      fallback.className = 'aae-results-fallback';
      fallback.hidden = true;
      const label = document.createElement('label');
      label.textContent = 'Results link';
      const input = document.createElement('textarea');
      input.className = 'aae-results-url';
      input.id = 'aae-results-url-' + view;
      input.readOnly = true;
      input.rows = 3;
      input.spellcheck = false;
      label.htmlFor = input.id;
      fallback.append(label, input);
      box.append(copy, status, fallback);
      const toolbar = panel.querySelector('.toolbar');
      if (toolbar) toolbar.after(box); else panel.prepend(box);
      controls.push({ view, box, copy, status, fallback });
      copy.addEventListener('click', async () => {
        const url = resultURL();
        if (!url || activeView() !== view) return;
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(url);
          fallback.hidden = true;
          status.textContent = 'Link copied.';
        } catch (_) {
          input.value = url;
          fallback.hidden = false;
          status.textContent = 'Copy the link below.';
          input.focus();
          input.select();
        }
      });
    }

    function sync() {
      queued = false;
      const url = resultURL();
      const view = activeView();
      controls.forEach(control => {
        control.box.hidden = control.view !== view || (!url && !(pendingInput && view === 'passages'));
        control.copy.disabled = !url;
        if (url !== lastURL) { control.status.textContent = ''; control.fallback.hidden = true; }
      });
      if (url !== lastURL) {
        lastURL = url;
        document.dispatchEvent(new CustomEvent('aae:results-change', { bubbles: true, detail: { url } }));
      }
    }
    function schedule() { if (!queued) { queued = true; queueMicrotask(sync); } }
    function recordFilters() {
      pendingInput = false;
      filterNodes = currentChildren();
      filterState = snapshot();
      schedule();
    }

    function restoreInitial() {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const passage = hash.get('passage');
      const work = hash.get('work');
      if (knownPassage(passage)) {
        showEntryFromIndexNoHistory(passage);
        return;
      }
      if (work && allowed.story.has(work)) {
        filterByStory(work);
        return;
      }
      const view = query.get('view');
      if (view === 'species') {
        showPanelNoHistory('species');
        // The index and its category options are populated by lazy observers.
        queueMicrotask(() => {
          const search = document.getElementById('speciesSearch');
          const category = document.getElementById('speciesCategory');
          search.value = readText(query.get('q'));
          const selected = query.get('category');
          if (category) category.value = [...category.options].some(option => option.value === selected) ? selected : '';
          search.dispatchEvent(new Event('input', { bubbles: true }));
          if (category) category.dispatchEvent(new Event('change', { bubbles: true }));
          schedule();
        });
      } else if (view === 'passages' && [...Object.values(fields), 'scope', 'whole', 'page'].some(key => query.has(key))) {
        const filters = { search: readText(query.get('q')) };
        for (const key of ['category', 'story', 'species', 'verification']) {
          const value = query.get(fields[key]) || '';
          filters[key] = allowed[key].has(value) ? value : '';
        }
        const tagType = query.get('tagType');
        const tag = readText(query.get('tag'));
        if (Object.prototype.hasOwnProperty.call(tags, tagType) && tags[tagType].has(tag.toLowerCase())) {
          filters.tagType = tagType; filters.crossTag = tag;
        }
        window.aaePassages?.setScope(query.get('scope') === 'passage' ? 'passage' : 'all', { apply: false });
        window.aaePassages?.setWholeWords?.(query.get('whole') === '1', { apply: false });
        resetPassageFilters(filters);
        const requestedPage = query.get('page') || '1';
        uiPage = /^\d{1,8}$/.test(requestedPage) ? Math.max(1, Math.min(maximumPage, Number(requestedPage))) : 1;
        showPanelNoHistory('passages');
        applyFilters(false);
      }
    }

    addControls('passages');
    addControls('species');
    window.aaeResults = { url: resultURL };
    document.addEventListener('aae:passages-change', recordFilters);
    // Capture changes whose native listener may debounce rendering.
    document.addEventListener('input', event => {
      if (event.target.matches('#searchInput,#categorySelect,#storySelect,#speciesSelect,#verificationSelect,#aae-search-scope,#aae-whole-words')) pendingInput = true;
      schedule();
    }, true);
    document.addEventListener('change', event => {
      if (event.target.matches('#searchInput,#categorySelect,#storySelect,#speciesSelect,#verificationSelect,#aae-search-scope,#aae-whole-words')) pendingInput = true;
      schedule();
    }, true);
    // The native Reading view listener holds its original function reference, so a
    // late function wrapper would not intercept it. Validate before/after that click.
    document.addEventListener('click', event => {
      if (!event.target.closest('#passagesOnlyToggle')) return;
      readingChange = sameChildren() && filterState === snapshot() ? {
        ids: [...entries.querySelectorAll('article.entry')].map(article => article.dataset.entryId),
        count: document.getElementById('visibleCount')?.textContent,
        state: filterState
      } : null;
    }, true);
    document.addEventListener('click', event => {
      if (event.target.closest('#passagesOnlyToggle') && readingChange) {
        const ids = [...entries.querySelectorAll('article.entry')].map(article => article.dataset.entryId);
        if (readingChange.state === snapshot() && readingChange.count === document.getElementById('visibleCount')?.textContent && JSON.stringify(readingChange.ids) === JSON.stringify(ids)) recordFilters();
        readingChange = null;
      }
      schedule();
    });
    window.addEventListener('hashchange', schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(entries, { childList: true });
    document.querySelectorAll('.panel').forEach(panel => observer.observe(panel, { attributes: true, attributeFilter: ['class'] }));
    observer.observe(speciesIndex, { childList: true });
    const nativeMarkup = currentChildren().every(node =>
      node.matches('article.entry') ||
      (node.matches('.pagination') && node.querySelector('[data-results-page]')) ||
      (node.matches('.tag-filter-bar') && node.querySelector('[data-clear-tag]')) ||
      (node.matches('p.empty-state') && node.textContent.startsWith('No passages match these filters.')));
    if (nativeMarkup) recordFilters();
    restoreInitial();
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
