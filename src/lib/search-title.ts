function normalizeTitle(title: string): string {
  return title
    .replace(/\uff08/g, '(')
    .replace(/\uff09/g, ')')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*([()])\s*/g, '$1')
    .toLowerCase();
}

/** Full-title equality for playback sources; never discard annotations or suffixes. */
export function matchesFullSearchTitle(title: string, query: string): boolean {
  const normalizedQuery = normalizeTitle(query);
  return normalizedQuery.length > 0 && normalizeTitle(title) === normalizedQuery;
}

// Common sentence punctuation and separators interpreted specially by upstream engines.
const SEARCH_TITLE_SEPARATORS =
  /[().,!?;:#&|/~\\\u3002\uff0c\u3001\uff01\uff1f\uff1b\uff1a\uff03\uff06\uff5c\uff0f\uff3c\uff5e\u301c\u2026]/;

/** Parentheses are ordinary separators, whether paired or not. */
function getMainTitle(title: string): string {
  const normalized = title.replace(/\uff08/g, '(').replace(/\uff09/g, ')');
  let titleEnd = normalized.length;

  for (let i = 0; i < normalized.length; i++) {
    if (!SEARCH_TITLE_SEPARATORS.test(normalized[i])) continue;
    // Keep decimal numbers in titles such as "Version 2.0".
    if (
      normalized[i] === '.' &&
      /\d/.test(normalized[i - 1] ?? '') &&
      /\d/.test(normalized[i + 1] ?? '')
    ) {
      continue;
    }
    titleEnd = i;
    break;
  }

  return normalized.slice(0, titleEnd).trim().replace(/\s+/g, ' ');
}

export function getFallbackSearchQuery(query: string): string | null {
  const main = getMainTitle(query);
  const original = query
    .replace(/\uff08/g, '(')
    .replace(/\uff09/g, ')')
    .trim()
    .replace(/\s+/g, ' ');
  return main && main !== original ? main : null;
}

/** Relevance depends only on main titles, not years embedded in annotations. */
export function matchesSearchTitle(
  title: string,
  query: string,
  exact = false
): boolean {
  const mainQuery = normalizeTitle(getMainTitle(query) || query);
  const mainTitle = normalizeTitle(getMainTitle(title) || title);
  if (!mainQuery) return false;
  return exact ? mainTitle === mainQuery : mainTitle.includes(mainQuery);
}
