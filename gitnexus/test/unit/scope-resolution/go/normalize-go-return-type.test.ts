import { describe, it, expect } from 'vitest';
import { normalizeGoReturnType } from '../../../../src/core/ingestion/languages/go/interpret.js';

describe('normalizeGoReturnType', () => {
  it.each([
    ['*Engine', 'Engine'],
    ['(*Engine)', 'Engine'],
    ['(*Engine, error)', 'Engine'],
    ['(*models.User, error)', 'models.User'],
    ['(Foo[A, B], error)', 'Foo'],
    ['(chan int, error)', 'int'],
    // named results: the type, not the name
    ['(e *Engine)', 'Engine'],
    ['(e *Engine, err error)', 'Engine'],
    ['(c *gin.Context, r *Engine)', 'gin.Context'],
    ['(a, b *Engine)', 'Engine'],
    ['(a, b *Engine, err error)', 'Engine'],
    ['(a, b, c *Engine)', 'Engine'],
    ['(m map[string]*Engine, err error)', 'Engine'],
    ['(e Foo[A, B], err error)', 'Foo'],
    ['(ch chan int, err error)', 'int'],
    // unnamed: a later `chan T` or `func(a, b T)` is not a named result
    ['(Engine, chan error)', 'Engine'],
    ['(Engine, func(a, b int))', 'Engine'],
    // gofmt'd multi-line list: trailing comma, comments
    ['(\n\te *Engine,\n\terr error,\n)', 'Engine'],
    ['(\n\t// doc, with a comma\n\te *Engine, /* a, b */\n\terr error,\n)', 'Engine'],
  ])('%s -> %s', (text, expected) => {
    expect(normalizeGoReturnType(text)).toBe(expected);
  });
});
