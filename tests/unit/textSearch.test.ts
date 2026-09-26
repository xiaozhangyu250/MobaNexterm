import { describe, expect, it } from 'vitest';
import { findText, replaceText } from '../../src/renderer/src/lib/textSearch';
describe('editor search and replacement', () => {
  it('treats regex metacharacters and replacement dollars literally', () => {
    const text = 'a.b aXb a.b';
    expect(replaceText(text, findText(text, 'a.b'), '$&')).toBe('$& aXb $&');
  });
  it('handles case sensitivity and multibyte text offsets', () => {
    expect(findText('中 A a', 'a')).toEqual([
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
    expect(findText('中 A a', 'a', true)).toEqual([{ start: 4, end: 5 }]);
  });
  it('handles empty query, multiline and replacement without rescanning inserted text', () => {
    expect(findText('a', '')).toEqual([]);
    expect(replaceText('a\nb a\nb', findText('a\nb a\nb', 'a\nb'), 'a\nb!')).toBe('a\nb! a\nb!');
  });
});
