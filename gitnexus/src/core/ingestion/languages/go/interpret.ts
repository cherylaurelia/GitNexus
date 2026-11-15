import type { CaptureMatch, ParsedImport, ParsedTypeBinding, TypeRef } from 'gitnexus-shared';

export function interpretGoImport(captures: CaptureMatch): ParsedImport | null {
  const kind = captures['@import.kind']?.text;
  const source = captures['@import.source']?.text;
  const name = captures['@import.name']?.text;
  const alias = captures['@import.alias']?.text;
  if (kind === undefined || source === undefined) return null;

  if (kind === 'dot') return { kind: 'wildcard', targetRaw: source };
  if (kind === 'alias') {
    if (alias === undefined || name === undefined) return null;
    return { kind: 'namespace', localName: alias, importedName: name, targetRaw: source };
  }
  if (kind === 'namespace') {
    if (name === undefined) return null;
    return {
      kind: 'namespace',
      localName: name,
      importedName: name,
      targetRaw: source,
      implicitLocalName: true,
    };
  }
  return null;
}

export function interpretGoTypeBinding(captures: CaptureMatch): ParsedTypeBinding | null {
  const name = captures['@type-binding.name']?.text;
  const type = captures['@type-binding.type']?.text;
  if (name === undefined || type === undefined) return null;

  let source: TypeRef['source'] = 'annotation';
  let normalizedType: string;
  if (captures['@type-binding.self'] !== undefined) {
    source = 'self';
    // Preserve pointer shape on receiver self-bindings (`*T` vs `T`).
    // Method-owner enrichment consumes that raw shape to stamp `goReceiverKind`
    // on each method. Since #2813 that stamp is metadata, NOT a filter:
    // structural interface satisfaction counts pointer-receiver methods, because
    // `*T`'s method set is what an interface-typed field actually holds. The
    // preserved distinction is the hook a future value/pointer-aware model would
    // read — do not reintroduce it as an exclusion.
    normalizedType = type.trim();
  } else if (captures['@type-binding.constructor'] !== undefined) {
    source = 'constructor-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.call-return'] !== undefined) {
    source = 'constructor-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.assertion'] !== undefined) {
    source = 'annotation';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.new'] !== undefined) {
    source = 'constructor-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.field'] !== undefined) {
    source = 'assignment-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.range'] !== undefined) {
    source = 'constructor-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.index'] !== undefined) {
    source = 'constructor-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.multi-assign'] !== undefined) {
    source = 'constructor-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.make'] !== undefined) {
    source = 'constructor-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.return'] !== undefined) {
    // Preserve dotted names for cross-package return-type chains.
    source = 'return-annotation';
    normalizedType = normalizeGoReturnType(type);
  } else if (captures['@type-binding.alias'] !== undefined) {
    source = 'assignment-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.assignment'] !== undefined) {
    source = 'assignment-inferred';
    normalizedType = normalizeGoTypeName(type);
  } else if (captures['@type-binding.parameter'] !== undefined) {
    source = 'parameter-annotation';
    normalizedType = normalizeGoTypeName(type);
  } else {
    normalizedType = normalizeGoTypeName(type);
  }

  return { boundName: name, rawTypeName: normalizedType, source };
}

/** Shallow `map[K]V` spelling match — the key is anything up to the first `]`,
 *  so a nested map key (`map[map[a]b]V`) is deliberately NOT recognised. Held
 *  in one place so the capture-side normalizers and the resolver's element-type
 *  hook cannot drift on what counts as a map spelling. */
const GO_MAP_VALUE_RE = /^map\[[^\]]+\]\s*(.+)$/;

/** `map[K]V` → `V`, trimmed. `undefined` when `text` is not a map spelling. */
export function goMapValueType(text: string): string | undefined {
  const match = GO_MAP_VALUE_RE.exec(text);
  return match === null ? undefined : match[1].trim();
}

export function normalizeGoTypeName(text: string): string {
  let t = text.trim();
  t = stripGoOuterTypePrefixes(t);
  const mapValue = goMapValueType(t);
  if (mapValue !== undefined) t = mapValue;
  t = stripGoOuterTypePrefixes(t.replace(/^(?:<-)?chan(?:<-)?\s+/, ''));
  if (t.startsWith('func(')) {
    const retMatch = t.match(/^func\([^)]*\)\s*(.*)$/);
    if (retMatch) t = retMatch[1].trim();
  }
  const dot = t.lastIndexOf('.');
  if (dot !== -1) t = t.slice(dot + 1);
  const bracket = t.indexOf('[');
  if (bracket !== -1) t = t.slice(0, bracket);
  return t;
}

// A bare first entry is a grouped name (`a` in `a, b *T`) only when a later
// entry has `name Type` form; otherwise it is an unnamed type (`Engine, error`).
const GO_RESULT_NAME_RE = /^[\p{L}_][\p{L}\p{Nd}_]*$/u;
// `name Type`, but not `chan T` / `interface {...}` / `struct {...}`.
const GO_NAMED_RESULT_RE = /^(?!(?:chan|interface|struct)\b)[\p{L}_][\p{L}\p{Nd}_]*\s+(\S.*)$/su;

/** First result type of a result list's inner text, dropping result names
 *  (`e *T, err error` and the grouped `a, b *T` both give `*T`). */
function firstGoResultType(list: string): string {
  // A comment in a multi-line list can hold a comma.
  const inner = list.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      entries.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  entries.push(inner.slice(start).trim());
  const typed = GO_RESULT_NAME_RE.test(entries[0])
    ? entries.find((e) => GO_NAMED_RESULT_RE.test(e))
    : entries[0];
  const entry = typed ?? entries[0];
  return GO_NAMED_RESULT_RE.exec(entry)?.[1].trim() ?? entry;
}

/**
 * Like `normalizeGoTypeName` but preserves dotted package-prefix
 * (`models.User` stays `models.User`). Used for return-type
 * annotations so cross-package type chains can resolve through
 * QualifiedNameIndex (which carries `pkg.Type` entries).
 */
export function normalizeGoReturnType(text: string): string {
  let t = text.trim();
  // Result list: (*T, error) → first type; named (e *T, err error) → `*T`.
  if (t.startsWith('(') && t.endsWith(')')) t = firstGoResultType(t.slice(1, -1));
  t = stripGoOuterTypePrefixes(t);
  const mapValue = goMapValueType(t);
  if (mapValue !== undefined) t = mapValue;
  t = stripGoOuterTypePrefixes(t.replace(/^(?:<-)?chan(?:<-)?\s+/, ''));
  if (t.startsWith('func(')) {
    const retMatch = t.match(/^func\([^)]*\)\s*(.*)$/);
    if (retMatch) t = retMatch[1].trim();
  }
  // Preserve dotted qualified names for cross-package resolution.
  const bracket = t.indexOf('[');
  if (bracket !== -1) t = t.slice(0, bracket);
  return t;
}

/** `pkg.Type` and nothing else: one qualifier, both halves Go identifiers
 *  (letters per the spec, so Unicode, not just ASCII). */
const GO_QUALIFIED_TYPE_NAME_RE = /^[\p{L}_][\p{L}\p{Nd}_]*\.[\p{L}_][\p{L}\p{Nd}_]*$/u;

/**
 * Go's `ScopeResolver.qualifiedTypeLookupSpelling`: the `pkg.Type` a binding's
 * written type names, or `undefined` when it names no package.
 *
 * `normalizeGoTypeName` cuts the qualifier at capture (`*models.User` →
 * `User`), so `rawName` cannot tell `models.User` from `api.User`. The written
 * spelling (`TypeRef.declaredSpelling`) still has it, and `normalizeGoReturnType`
 * — the reduction return types already get — strips the same pointer, slice,
 * map, channel and func wrappers while keeping it. A `rawName` that is already
 * qualified (a return type) needs nothing from here.
 */
export function goQualifiedTypeLookupSpelling(typeRef: TypeRef): string | undefined {
  const written = typeRef.declaredSpelling;
  // No `.` in the written type means no qualifier to recover; most bindings
  // take this exit before any wrapper stripping.
  if (written === undefined || !written.includes('.') || typeRef.rawName.includes('.')) {
    return undefined;
  }
  // `func() *models.User` leaves `*models.User` after the return is unwrapped.
  const qualified = stripGoOuterTypePrefixes(normalizeGoReturnType(written));
  // The spelling must name `rawName` itself, only qualified: that is the cut
  // `normalizeGoTypeName` made. A binding whose type a chain step replaced
  // (`u *models.User` landing on a package-level `User *auth.Principal`) keeps
  // its own spelling but not its own `rawName`, and must not borrow either.
  return GO_QUALIFIED_TYPE_NAME_RE.test(qualified) && qualified.endsWith(`.${typeRef.rawName}`)
    ? qualified
    : undefined;
}

function stripGoOuterTypePrefixes(text: string): string {
  let t = text.trim();
  let previous: string;
  do {
    previous = t;
    while (t.startsWith('*')) t = t.slice(1).trim();
    if (t.startsWith('[]')) t = t.slice(2).trim();
    t = t.replace(/^\[[^\]]+\]\s*/, '');
  } while (t !== previous);
  return t;
}
