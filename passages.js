/* Passage-list enhancements. Loaded after editorial.js and before results.js.
 * Corpus text and native filters remain the source of truth.
 */
(() => {
  'use strict';
  if (window.aaePassages) return;

  let scope = 'all';
  let wholeWords = false;
  let scopeSelect = null;
  let wholeWordsControl = null;
  let searchInput = null;
  let bodySequence = 0;
  let mainFilterDepth = 0;
  let mainQuery = '';
  let highlightWholeWords = false;
  let readingRenderModes = null;
  let installed = false;

  const text = value => String(value == null ? '' : value);
  const lower = value => text(value).toLowerCase();
  const escapeHTML = value => text(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const wordCharacter = /[\p{L}\p{M}\p{N}\p{Pc}]/u;

  function codePointBefore(value, index) {
    if (index < 1) return '';
    const last = value.charCodeAt(index - 1);
    return /[\uDC00-\uDFFF]/.test(String.fromCharCode(last)) && index > 1 ?
      String.fromCodePoint(value.codePointAt(index - 2)) : value[index - 1];
  }

  /** Literal, case-insensitive ranges using the native search's lowercase semantics.
   * Unicode letters, marks, numbers, and connector punctuation count as word characters.
   * A hyphen is a boundary, so oak matches jack-oak but not cloak, soaked, or oaks.
   */
  function findMatches(value, query, options = {}) {
    const source = text(value);
    const searchable = lower(source);
    const needle = lower(query).trim();
    const whole = options.wholeWords == null ? wholeWords : options.wholeWords === true;
    if (!needle) return [];
    let maps = null;
    function sourceRange(start, end) {
      if (source.length === searchable.length) return { start, end };
      // Lowercasing can expand a character, e.g. capital dotted I. Keep offsets in source text.
      if (!maps) {
        maps = { starts: [], ends: [] };
        let offset = 0;
        for (const character of source) {
          const length = character.toLowerCase().length;
          for (let i = 0; i < length; i += 1) {
            maps.starts.push(offset);
            maps.ends.push(offset + character.length);
          }
          offset += character.length;
        }
      }
      return { start: maps.starts[start], end: maps.ends[end - 1] };
    }
    const matches = [];
    let cursor = 0;
    while (cursor <= searchable.length - needle.length) {
      const start = searchable.indexOf(needle, cursor);
      if (start < 0) break;
      const end = start + needle.length;
      const before = codePointBefore(searchable, start);
      const after = end < searchable.length ? String.fromCodePoint(searchable.codePointAt(end)) : '';
      const accepted = !whole || (!wordCharacter.test(before) && !wordCharacter.test(after));
      if (accepted) {
        const range = sourceRange(start, end);
        const previous = matches[matches.length - 1];
        if (!previous || range.start >= previous.end) matches.push(range);
        if (options.firstOnly) break;
      }
      cursor = accepted ? end : start + 1;
    }
    return matches;
  }

  const hasMatch = (value, query, options = {}) => findMatches(value, query, { ...options, firstOnly: true }).length > 0;

  function searchLabels() {
    const labels = scope === 'passage' ? {
      ariaLabel: 'Search passage text',
      placeholder: 'Search quotation text . . .',
      title: 'Search only the quoted passage text.'
    } : {
      ariaLabel: 'Search all passage fields',
      placeholder: 'Search passages, context, tags . . .',
      title: 'Search quotations, work titles, notes, context, tags, speakers and entry IDs.'
    };
    if (wholeWords) labels.title += ' Match whole words or the exact phrase.';
    return labels;
  }

  function syncSearchControls() {
    if (scopeSelect) scopeSelect.value = scope;
    if (wholeWordsControl) wholeWordsControl.checked = wholeWords;
    if (searchInput) {
      const labels = searchLabels();
      searchInput.setAttribute('aria-label', labels.ariaLabel);
      searchInput.placeholder = labels.placeholder;
      searchInput.title = labels.title;
    }
  }

  /** Return one contiguous excerpt, never a join of separate quotation segments. */
  function preview(quotation, query = '', limit = 220, options = {}) {
    const source = text(quotation);
    const needle = text(query).trim();
    const budget = Math.max(80, Math.min(600, Number(limit) || 220));
    const range = findMatches(source, needle, { ...options, firstOnly: true })[0];
    const match = range ? range.start : -1;
    let start = match < 0 ? 0 : Math.max(0, match - 20);
    let end = Math.min(source.length, Math.max(start + budget, range ? range.end : 0));
    // Prefer complete words without moving the matching term out of the excerpt.
    const earliest = Math.max(0, start - 12);
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

  function highlightHTML(value, query, options = {}) {
    const source = text(value);
    let cursor = 0;
    let result = '';
    for (const range of findMatches(source, query, options)) {
      result += escapeHTML(source.slice(cursor, range.start)) + '<mark>' +
        escapeHTML(source.slice(range.start, range.end)) + '</mark>';
      cursor = range.end;
    }
    return result + escapeHTML(source.slice(cursor));
  }

  function previewHTML(quotation, query = '', options = {}) {
    const excerpt = preview(quotation, query, 220, options);
    const start = excerpt.clippedStart ? '<span class="aae-preview-ellipsis" aria-hidden="true">… </span>' : '';
    const end = excerpt.clippedEnd ? '<span class="aae-preview-ellipsis" aria-hidden="true"> …</span>' : '';
    return '<div class="aae-quote-preview" aria-label="Passage excerpt">' + start +
      '<span class="aae-preview-text">' + highlightHTML(excerpt.text, query, options) + '</span>' + end + '</div>';
  }

  /** The fields mirror the original all-fields search; no new corpus fields are searched. */
  function matchingFields(entry, query, annotations = [], options = {}) {
    const needle = lower(query).trim();
    if (!needle || hasMatch(entry.quote, needle, options)) return [];
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
    return groups.filter(([, values]) => hasMatch(values.filter(value => value != null).join(' '), needle, options))
      .map(([label]) => label);
  }

  function joinLabels(labels) {
    if (labels.length < 2) return labels[0] || '';
    if (labels.length === 2) return labels.join(' and ');
    return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  }

  /** Scope values: 'all' and 'passage'. setScope(value,{apply:false}) supports state restoration. */
  window.aaePassages = {
    version: 'passage-preview-2',
    getScope: () => scope,
    setScope(value, options = {}) {
      scope = value === 'passage' ? 'passage' : 'all';
      syncSearchControls();
      if (options.apply !== false && installed) window.applyFilters();
      return scope;
    },
    getWholeWords: () => wholeWords,
    setWholeWords(value, options = {}) {
      wholeWords = value === true;
      syncSearchControls();
      if (options.apply !== false && installed) window.applyFilters();
      return wholeWords;
    },
    getSearchLabels: searchLabels,
    // Pure helpers are exposed for regression tests and reuse by other presentation layers.
    preview,
    previewHTML,
    matchingFields,
    findMatches,
    highlightHTML
  };

  function init() {
    if (installed || typeof window.createEntryCard !== 'function' ||
        typeof window.uiSearchText !== 'function' || typeof window.applyFilters !== 'function') return;
    const search = document.getElementById('searchInput');
    if (!search) return;
    searchInput = search;
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
    const wholeLabel = document.createElement('label');
    wholeLabel.className = 'aae-whole-words';
    wholeWordsControl = document.createElement('input');
    wholeWordsControl.type = 'checkbox';
    wholeWordsControl.id = 'aae-whole-words';
    const wholeCaption = document.createElement('span');
    wholeCaption.textContent = 'Whole words';
    wholeLabel.title = 'For example, oak matches jack-oak, but not cloak, soaked or oaks.';
    wholeLabel.append(wholeWordsControl, wholeCaption);
    control.after(wholeLabel);
    wholeWordsControl.addEventListener('change', () => window.aaePassages.setWholeWords(wholeWordsControl.checked));
    syncSearchControls();

    function withHighlightMode(mode, callback) {
      const previous = highlightWholeWords;
      highlightWholeWords = mode;
      try { return callback(); }
      finally { highlightWholeWords = previous; }
    }

    // Both native quotation renderers share the same ranges, including photograph-linked terms.
    if (typeof window.uiHighlighted === 'function') {
      window.uiHighlighted = function (value, query) {
        return highlightHTML(value, query, { wholeWords: highlightWholeWords });
      };
    }
    if (typeof window.uiPhotoHighlightRanges === 'function') {
      window.uiPhotoHighlightRanges = function (value, query) {
        return findMatches(value, query, { wholeWords: highlightWholeWords });
      };
    }

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

    function enhanceArticle(article, entry, query = '', mode = false) {
      if (!article || !entry) return;
      const data = normalized(entry);
      const header = article.querySelector('.entry-header');
      const body = article.querySelector('.entry-body');
      if (!header || !body) return;
      article.dataset.aaeWholeWords = String(mode);
      const options = { wholeWords: mode };
      article.querySelectorAll(':scope > .aae-quote-preview, :scope > .aae-match-note').forEach(element => element.remove());
      if (text(data.quote)) {
        const fragment = document.createElement('template');
        fragment.innerHTML = previewHTML(data.quote, query, options);
        body.before(fragment.content);
      }
      const needle = lower(query).trim();
      if (needle && !hasMatch(data.quote, needle, options) && hasMatch(originalSearch(data), needle, options)) {
        const reading = typeof window.uiReadingText === 'function' ? window.uiReadingText(data) : null;
        const fields = matchingFields(data, needle, reading && reading.annotations || [], options);
        const note = document.createElement('p');
        note.className = 'aae-match-note';
        note.textContent = fields.length ? 'Matched in ' + joinLabels(fields) + '.' : 'Matched outside the quotation.';
        body.before(note);
      }
      const quote = body.querySelector(':scope > .quote');
      if (quote && typeof window.uiIllustratedQuote === 'function') {
        const html = withHighlightMode(mode, () => window.uiIllustratedQuote(data, query));
        if (quote.innerHTML !== html) quote.innerHTML = html;
      }
      updateToggle(article, data);
    }

    window.createEntryCard = function (entry, highlight) {
      const template = document.createElement('template');
      const args = arguments;
      const readingModes = readingRenderModes && readingRenderModes.get(text(entry.id || entry.entry_id));
      const mode = mainFilterDepth > 0 ? wholeWords : readingModes && readingModes.length ? readingModes.shift() : false;
      template.innerHTML = withHighlightMode(mode, () => originalCard.apply(this, args));
      enhanceArticle(template.content.querySelector('article.entry'), entry, highlight, mode);
      return template.innerHTML;
    };

    window.uiSearchText = function (entry) {
      // Only the main Passage filter invocation uses this scope. Sub-index searches keep their semantics.
      const searchable = mainFilterDepth > 0 && scope === 'passage' ? lower(entry.quote) : originalSearch.apply(this, arguments);
      if (mainFilterDepth > 0 && wholeWords && mainQuery && !hasMatch(searchable, mainQuery, { wholeWords: true })) return '';
      return searchable;
    };

    window.applyFilters = function () {
      const previousQuery = mainQuery;
      mainQuery = typeof activeFilters !== 'undefined' ? text(activeFilters.search).trim() : search.value.trim();
      mainFilterDepth += 1;
      let result;
      try { result = originalFilters.apply(this, arguments); }
      finally { mainFilterDepth -= 1; mainQuery = previousQuery; }
      if (mainFilterDepth === 0) {
        document.dispatchEvent(new CustomEvent('aae:passages-change', { detail: { scope, wholeWords } }));
      }
      return result;
    };

    if (typeof originalSetOpen === 'function') {
      window.setEntryOpen = function (article) {
        const args = arguments;
        const mode = !!(article && article.dataset.aaeWholeWords === 'true');
        const result = withHighlightMode(mode, () => originalSetOpen.apply(this, args));
        const id = article && article.dataset.entryId;
        const entry = id && typeof window.uiEntryById === 'function' ? window.uiEntryById(id) : null;
        if (article && entry) updateToggle(article, normalized(entry));
        return result;
      };
    }

    // Enhance already-rendered cards without changing filters, page number, or expansion state.
    function enhanceExisting(article, mode = false) {
      const entry = typeof window.uiEntryById === 'function' ? window.uiEntryById(article.dataset.entryId) : null;
      const body = article.querySelector('.entry-body');
      if (entry) enhanceArticle(article, entry, body && body.dataset.highlight || '', mode);
    }
    document.querySelectorAll('article.entry[data-entry-id]').forEach(article => enhanceExisting(article));
    // The native Reading view handler replaces every card, including sub-index results.
    // Preserve each card's own match mode only for those replacements.
    function captureReadingModes() {
      const modes = new Map();
      document.querySelectorAll('article.entry[data-entry-id]').forEach(article => {
        const id = text(article.dataset.entryId);
        if (!modes.has(id)) modes.set(id, []);
        modes.get(id).push(article.dataset.aaeWholeWords === 'true');
      });
      return modes;
    }
    const readingToggle = document.getElementById('passagesOnlyToggle');
    if (readingToggle) readingToggle.addEventListener('click', () => {
      const modes = captureReadingModes();
      readingRenderModes = modes;
      queueMicrotask(() => { if (readingRenderModes === modes) readingRenderModes = null; });
    }, true);
    const originalReadingToggle = window.uiToggleReadingMode;
    if (typeof originalReadingToggle === 'function') {
      window.uiToggleReadingMode = function () {
        const previous = readingRenderModes;
        readingRenderModes = captureReadingModes();
        try { return originalReadingToggle.apply(this, arguments); }
        finally { readingRenderModes = previous; }
      };
    }
    document.dispatchEvent(new CustomEvent('aae:passages-ready', { detail: { scope, wholeWords } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
