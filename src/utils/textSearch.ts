/**
 * Normalizes text for search comparison:
 * - Lowercases the text
 * - Converts Vietnamese 'đ' / 'Đ' to 'd'
 * - Decomposes diacritics via Unicode NFD and strips all combining marks
 */
export function normalizeSearchText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Loosened diacritic-insensitive & multi-token search matcher:
 * - Matches Vietnamese with or without diacritics (e.g. "Dam Vinh Hung" matches "Đàm Vĩnh Hưng")
 * - Matches across words regardless of order (e.g. "Dam Hung" matches "Đàm Vĩnh Hưng")
 * - Handles contiguous phrases and punctuation-separated tokens
 */
export function matchSearch(targetText: string, query: string): boolean {
  if (!query || !query.trim()) return true;
  if (!targetText) return false;

  const normTarget = normalizeSearchText(targetText);
  const normQuery = normalizeSearchText(query.trim());

  // 1. Direct contiguous phrase match
  if (normTarget.includes(normQuery)) {
    return true;
  }

  // 2. Token-based matching: all typed words must appear anywhere in the target
  const queryTokens = normQuery.split(/[\s\-_\.,]+/g).filter(Boolean);
  if (queryTokens.length === 0) return true;

  return queryTokens.every((token) => normTarget.includes(token));
}
