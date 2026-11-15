/* Passage-list enhancements. Loaded after editorial.js and before results.js.
 * Corpus text and native filters remain the source of truth.
 */
(() => {
  'use strict';
  if (window.aaePassages) return;

  let scope = 'all';
  let scopeSelect = null;
  let bodySequence = 0;
  let mainFilterDepth = 0;
  let installed = false;

  const text = value => String(value == null ? '' : value);
  const lower = value => text(value).toLowerCase();
  const escapeHTML = value => text(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const escapeRegExp = value => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Return one contiguous excerpt, never a join of separate quotation segments. */
  function preview(quotation, query = '', limit = 220) {
    const source = text(quotation);
    const needle = text(query).trim();
    const budget = Math.max(80, Math.min(600, Number(limit) || 220));
    const match = needle ? lower(source).indexOf(lower(needle)) : -1;
    let start = match < 0 ? 0 : Math.max(0, match - 36);
    let end = Math.min(source.length, Math.max(start + budget, match < 0 ? 0 : match + needle.length));
    // Prefer complete words without moving the matching term out of the excerpt.
    const earliest = Math.max(0, start - 28);
    while (start > earliest && start > 0 && !/\s/.test(source[start - 1])) start -= 1;
    const latest = Math.min(source.length, end + 28);
    while (end < latest && end < source.length && !/\s/.test(source[end])) end += 1;
    // Do not split a UTF-16 surrogate pair at a clipping boundary.
    if (start > 0 && /[\uDC00-\uDFFF]/.test(source[start])) start -= 1;
    if (end > 0 && end < source.length && /[\uD800-\uDBFF]/.test(source[end - 1])) end += 1;
    return {
      text: source.slice(start, end).trim(),
      clippedStart: start > 0,
      clippedEnd: end < source.length,
      matchInQuotation: match >= 0
    };
  }

  function highlightHTML(value, query) {
    const needle = text(query).trim();
    if (!needle) return escapeHTML(value);
    const matcher = new RegExp('(' + escapeRegExp(needle) + ')', 'gi');
    return text(value).split(matcher).map((part, index) => index % 2 ?
      '<mark>' + escapeHTML(part) + '</mark>' : escapeHTML(part)).join('');
  }

  function previewHTML(quotation, query = '') {
    const excerpt = preview(quotation, query);
    const start = excerpt.clippedStart ? '<span class="aae-preview-ellipsis" aria-hidden="true">… </span>' : '';
    const end = excerpt.clippedEnd ? '<span class="aae-preview-ellipsis" aria-hidden="true"> …</span>' : '';
    return '<div class="aae-quote-preview" aria-label="Passage excerpt">' + start +
      '<span class="aae-preview-text">' + highlightHTML(excerpt.text, query) + '</span>' + end + '</div>';
  }

  /** The fields mirror the original all-fields search; no new corpus fields are searched. */
  function matchingFields(entry, query, annotations = []) {
    const needle = lower(query).trim();
    if (!needle || lower(entry.quote).includes(needle)) return [];
    const groups = [
      ['notes', annotations],
      ['context', [entry.context, entry.context_before, entry.context_after]],
      ['work title', [entry.story_title || entry.story]],
      ['tags', [entry.category_primary, ...(entry.category_secondary || []),
        ...(entry.species_mentioned || []), ...(entry.keywords || []),
        ...(entry.cross_tags || []), ...(entry.places_mentioned || [])]],
      ['speaker', [entry.speaker]],
      ['entry ID', [entry.id || entry.entry_id]]
    ];
    return groups.filter(([, values]) => lower(values.filter(value => value != null).join(' ')).includes(needle))
      .map(([label]) => label);
  }

  function joinLabels(labels) {
    if (labels.length < 2) return labels[0] || '';
    if (labels.length === 2) return labels.join(' and ');
    return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  }

  /** Scope values: 'all' and 'passage'. setScope(value,{apply:false}) supports state restoration. */
  window.aaePassages = {
    version: 'passage-preview-1',
    getScope: () => scope,
    setScope(value, options = {}) {
      scope = value === 'passage' ? 'passage' : 'all';
      if (scopeSelect) scopeSelect.value = scope;
      if (options.apply !== false && installed) window.applyFilters();
      return scope;
    },
    // Pure helpers are exposed for regression tests and reuse by other presentation layers.
    preview,
    previewHTML,
    matchingFields
  };

  function init() {
    if (installed || typeof window.createEntryCard !== 'function' ||
        typeof window.uiSearchText !== 'function' || typeof window.applyFilters !== 'function') return;
    const search = document.getElementById('searchInput');
    if (!search) return;
    installed = true;
    const originalCard = window.createEntryCard;
    const originalSearch = window.uiSearchText;
    const originalFilters = window.applyFilters;
    const originalSetOpen = window.setEntryOpen;

    const control = document.createElement('label');
    control.className = 'aae-search-scope';
    const label = document.createElement('span');
    label.textContent = 'Search in';
    scopeSelect = document.createElement('select');
    scopeSelect.id = 'aae-search-scope';
    scopeSelect.setAttribute('aria-label', 'Search scope');
    for (const [value, name] of [['all', 'All fields'], ['passage', 'Passage text']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = name;
      scopeSelect.append(option);
    }
    scopeSelect.value = scope;
    control.append(label, scopeSelect);
    search.after(control);
    scopeSelect.addEventListener('change', () => window.aaePassages.setScope(scopeSelect.value));

    function normalized(entry) {
      return typeof window.normalizeEntry === 'function' ? window.normalizeEntry(entry) : entry;
    }

    function updateToggle(article, entry) {
      const button = article.querySelector('[data-toggle-entry]');
      const body = article.querySelector('.entry-body');
      if (!button || !body) return;
      const id = text(entry.id || entry.entry_id);
      const title = text(entry.story_title || entry.story || 'Untitled work');
      if (!body.id) {
        bodySequence += 1;
        body.id = 'aae-passage-body-' + bodySequence;
      }
      button.setAttribute('aria-controls', body.id);
      const action = button.getAttribute('aria-expanded') === 'true' ? 'Collapse' : 'Expand';
      button.setAttribute('aria-label', `${action} passage ${id} from ${title}`);
    }

    function enhanceArticle(article, entry, query = '') {
      if (!article || !entry) return;
      const data = normalized(entry);
      const header = article.querySelector('.entry-header');
      const body = article.querySelector('.entry-body');
      if (!header || !body) return;
      article.querySelectorAll(':scope > .aae-quote-preview, :scope > .aae-match-note').forEach(element => element.remove());
      if (text(data.quote)) {
        const fragment = document.createElement('template');
        fragment.innerHTML = previewHTML(data.quote, query);
        body.before(fragment.content);
      }
      const needle = lower(query).trim();
      if (needle && !lower(data.quote).includes(needle) && originalSearch(data).includes(needle)) {
        const reading = typeof window.uiReadingText === 'function' ? window.uiReadingText(data) : null;
        const fields = matchingFields(data, needle, reading && reading.annotations || []);
        const note = document.createElement('p');
        note.className = 'aae-match-note';
        note.textContent = fields.length ? 'Matched in ' + joinLabels(fields) + '.' : 'Matched outside the quotation.';
        body.before(note);
      }
      updateToggle(article, data);
    }

    window.createEntryCard = function (entry, highlight) {
      const template = document.createElement('template');
      template.innerHTML = originalCard.apply(this, arguments);
      enhanceArticle(template.content.querySelector('article.entry'), entry, highlight);
      return template.innerHTML;
    };

    window.uiSearchText = function (entry) {
      // Only the main Passage filter invocation uses this scope. Sub-index searches keep their semantics.
      if (mainFilterDepth > 0 && scope === 'passage') return lower(entry.quote);
      return originalSearch.apply(this, arguments);
    };

    window.applyFilters = function () {
      mainFilterDepth += 1;
      let result;
      try { result = originalFilters.apply(this, arguments); }
      finally { mainFilterDepth -= 1; }
      if (mainFilterDepth === 0) {
        document.dispatchEvent(new CustomEvent('aae:passages-change', { detail: { scope } }));
      }
      return result;
    };

    if (typeof originalSetOpen === 'function') {
      window.setEntryOpen = function (article) {
        const result = originalSetOpen.apply(this, arguments);
        const id = article && article.dataset.entryId;
        const entry = id && typeof window.uiEntryById === 'function' ? window.uiEntryById(id) : null;
        if (article && entry) updateToggle(article, normalized(entry));
        return result;
      };
    }

    // Enhance already-rendered cards without changing filters, page number, or expansion state.
    document.querySelectorAll('article.entry[data-entry-id]').forEach(article => {
      const entry = typeof window.uiEntryById === 'function' ? window.uiEntryById(article.dataset.entryId) : null;
      const body = article.querySelector('.entry-body');
      if (entry) enhanceArticle(article, entry, body && body.dataset.highlight || '');
    });
    document.dispatchEvent(new CustomEvent('aae:passages-ready', { detail: { scope } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
