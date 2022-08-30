var k = function() {
  return k = Object.assign || function(t) {
    for (var n, s = 1, i = arguments.length; s < i; s++) {
      n = arguments[s];
      for (var r in n)
        Object.prototype.hasOwnProperty.call(n, r) && (t[r] = n[r]);
    }
    return t;
  }, k.apply(this, arguments);
};
function L(e, t) {
  if (!Boolean(e))
    throw new Error(t);
}
function ne(e) {
  return typeof e == "object" && e !== null;
}
function ie(e, t) {
  if (!Boolean(e))
    throw new Error(
      t != null ? t : "Unexpected invariant triggered."
    );
}
const se = /\r\n|[\n\r]/g;
function w(e, t) {
  let n = 0, s = 1;
  for (const i of e.body.matchAll(se)) {
    if (typeof i.index == "number" || ie(!1), i.index >= t)
      break;
    n = i.index + i[0].length, s += 1;
  }
  return {
    line: s,
    column: t + 1 - n
  };
}
function re(e) {
  return $(
    e.source,
    w(e.source, e.start)
  );
}
function $(e, t) {
  const n = e.locationOffset.column - 1, s = "".padStart(n) + e.body, i = t.line - 1, r = e.locationOffset.line - 1, a = t.line + r, u = t.line === 1 ? n : 0, l = t.column + u, E = `${e.name}:${a}:${l}
`, p = s.split(/\r\n|[\n\r]/g), m = p[i];
  if (m.length > 120) {
    const N = Math.floor(l / 80), R = l % 80, f = [];
    for (let I = 0; I < m.length; I += 80)
      f.push(m.slice(I, I + 80));
    return E + B([
      [`${a} |`, f[0]],
      ...f.slice(1, N + 1).map((I) => ["|", I]),
      ["|", "^".padStart(R)],
      ["|", f[N + 1]]
    ]);
  }
  return E + B([
    [`${a - 1} |`, p[i - 1]],
    [`${a} |`, m],
    ["|", "^".padStart(l)],
    [`${a + 1} |`, p[i + 1]]
  ]);
}
function B(e) {
  const t = e.filter(([s, i]) => i !== void 0), n = Math.max(...t.map(([s]) => s.length));
  return t.map(([s, i]) => s.padStart(n) + (i ? " " + i : "")).join(`
`);
}
function oe(e) {
  const t = e[0];
  return t == null || "kind" in t || "length" in t ? {
    nodes: t,
    source: e[1],
    positions: e[2],
    path: e[3],
    originalError: e[4],
    extensions: e[5]
  } : t;
}
class U extends Error {
  constructor(t, ...n) {
    var s, i, r;
    const { nodes: a, source: u, positions: l, path: E, originalError: p, extensions: m } = oe(n);
    super(t), this.name = "GraphQLError", this.path = E != null ? E : void 0, this.originalError = p != null ? p : void 0, this.nodes = V(
      Array.isArray(a) ? a : a ? [a] : void 0
    );
    const N = V(
      (s = this.nodes) === null || s === void 0 ? void 0 : s.map((f) => f.loc).filter((f) => f != null)
    );
    this.source = u != null ? u : N == null || (i = N[0]) === null || i === void 0 ? void 0 : i.source, this.positions = l != null ? l : N == null ? void 0 : N.map((f) => f.start), this.locations = l && u ? l.map((f) => w(u, f)) : N == null ? void 0 : N.map((f) => w(f.source, f.start));
    const R = ne(
      p == null ? void 0 : p.extensions
    ) ? p == null ? void 0 : p.extensions : void 0;
    this.extensions = (r = m != null ? m : R) !== null && r !== void 0 ? r : /* @__PURE__ */ Object.create(null), Object.defineProperties(this, {
      message: {
        writable: !0,
        enumerable: !0
      },
      name: {
        enumerable: !1
      },
      nodes: {
        enumerable: !1
      },
      source: {
        enumerable: !1
      },
      positions: {
        enumerable: !1
      },
      originalError: {
        enumerable: !1
      }
    }), p != null && p.stack ? Object.defineProperty(this, "stack", {
      value: p.stack,
      writable: !0,
      configurable: !0
    }) : Error.captureStackTrace ? Error.captureStackTrace(this, U) : Object.defineProperty(this, "stack", {
      value: Error().stack,
      writable: !0,
      configurable: !0
    });
  }
  get [Symbol.toStringTag]() {
    return "GraphQLError";
  }
  toString() {
    let t = this.message;
    if (this.nodes)
      for (const n of this.nodes)
        n.loc && (t += `

` + re(n.loc));
    else if (this.source && this.locations)
      for (const n of this.locations)
        t += `

` + $(this.source, n);
    return t;
  }
  toJSON() {
    const t = {
      message: this.message
    };
    return this.locations != null && (t.locations = this.locations), this.path != null && (t.path = this.path), this.extensions != null && Object.keys(this.extensions).length > 0 && (t.extensions = this.extensions), t;
  }
}
function V(e) {
  return e === void 0 || e.length === 0 ? void 0 : e;
}
function d(e, t, n) {
  return new U(`Syntax Error: ${n}`, {
    source: e,
    positions: [t]
  });
}
class ae {
  constructor(t, n, s) {
    this.start = t.start, this.end = n.end, this.startToken = t, this.endToken = n, this.source = s;
  }
  get [Symbol.toStringTag]() {
    return "Location";
  }
  toJSON() {
    return {
      start: this.start,
      end: this.end
    };
  }
}
class Y {
  constructor(t, n, s, i, r, a) {
    this.kind = t, this.start = n, this.end = s, this.line = i, this.column = r, this.value = a, this.prev = null, this.next = null;
  }
  get [Symbol.toStringTag]() {
    return "Token";
  }
  toJSON() {
    return {
      kind: this.kind,
      value: this.value,
      line: this.line,
      column: this.column
    };
  }
}
let x;
(function(e) {
  e.QUERY = "query", e.MUTATION = "mutation", e.SUBSCRIPTION = "subscription";
})(x || (x = {}));
let P;
(function(e) {
  e.QUERY = "QUERY", e.MUTATION = "MUTATION", e.SUBSCRIPTION = "SUBSCRIPTION", e.FIELD = "FIELD", e.FRAGMENT_DEFINITION = "FRAGMENT_DEFINITION", e.FRAGMENT_SPREAD = "FRAGMENT_SPREAD", e.INLINE_FRAGMENT = "INLINE_FRAGMENT", e.VARIABLE_DEFINITION = "VARIABLE_DEFINITION", e.SCHEMA = "SCHEMA", e.SCALAR = "SCALAR", e.OBJECT = "OBJECT", e.FIELD_DEFINITION = "FIELD_DEFINITION", e.ARGUMENT_DEFINITION = "ARGUMENT_DEFINITION", e.INTERFACE = "INTERFACE", e.UNION = "UNION", e.ENUM = "ENUM", e.ENUM_VALUE = "ENUM_VALUE", e.INPUT_OBJECT = "INPUT_OBJECT", e.INPUT_FIELD_DEFINITION = "INPUT_FIELD_DEFINITION";
})(P || (P = {}));
let c;
(function(e) {
  e.NAME = "Name", e.DOCUMENT = "Document", e.OPERATION_DEFINITION = "OperationDefinition", e.VARIABLE_DEFINITION = "VariableDefinition", e.SELECTION_SET = "SelectionSet", e.FIELD = "Field", e.ARGUMENT = "Argument", e.FRAGMENT_SPREAD = "FragmentSpread", e.INLINE_FRAGMENT = "InlineFragment", e.FRAGMENT_DEFINITION = "FragmentDefinition", e.VARIABLE = "Variable", e.INT = "IntValue", e.FLOAT = "FloatValue", e.STRING = "StringValue", e.BOOLEAN = "BooleanValue", e.NULL = "NullValue", e.ENUM = "EnumValue", e.LIST = "ListValue", e.OBJECT = "ObjectValue", e.OBJECT_FIELD = "ObjectField", e.DIRECTIVE = "Directive", e.NAMED_TYPE = "NamedType", e.LIST_TYPE = "ListType", e.NON_NULL_TYPE = "NonNullType", e.SCHEMA_DEFINITION = "SchemaDefinition", e.OPERATION_TYPE_DEFINITION = "OperationTypeDefinition", e.SCALAR_TYPE_DEFINITION = "ScalarTypeDefinition", e.OBJECT_TYPE_DEFINITION = "ObjectTypeDefinition", e.FIELD_DEFINITION = "FieldDefinition", e.INPUT_VALUE_DEFINITION = "InputValueDefinition", e.INTERFACE_TYPE_DEFINITION = "InterfaceTypeDefinition", e.UNION_TYPE_DEFINITION = "UnionTypeDefinition", e.ENUM_TYPE_DEFINITION = "EnumTypeDefinition", e.ENUM_VALUE_DEFINITION = "EnumValueDefinition", e.INPUT_OBJECT_TYPE_DEFINITION = "InputObjectTypeDefinition", e.DIRECTIVE_DEFINITION = "DirectiveDefinition", e.SCHEMA_EXTENSION = "SchemaExtension", e.SCALAR_TYPE_EXTENSION = "ScalarTypeExtension", e.OBJECT_TYPE_EXTENSION = "ObjectTypeExtension", e.INTERFACE_TYPE_EXTENSION = "InterfaceTypeExtension", e.UNION_TYPE_EXTENSION = "UnionTypeExtension", e.ENUM_TYPE_EXTENSION = "EnumTypeExtension", e.INPUT_OBJECT_TYPE_EXTENSION = "InputObjectTypeExtension";
})(c || (c = {}));
function ce(e) {
  return e === 9 || e === 32;
}
function g(e) {
  return e >= 48 && e <= 57;
}
function J(e) {
  return e >= 97 && e <= 122 || e >= 65 && e <= 90;
}
function q(e) {
  return J(e) || e === 95;
}
function ue(e) {
  return J(e) || g(e) || e === 95;
}
function le(e) {
  var t;
  let n = Number.MAX_SAFE_INTEGER, s = null, i = -1;
  for (let a = 0; a < e.length; ++a) {
    var r;
    const u = e[a], l = he(u);
    l !== u.length && (s = (r = s) !== null && r !== void 0 ? r : a, i = a, a !== 0 && l < n && (n = l));
  }
  return e.map((a, u) => u === 0 ? a : a.slice(n)).slice(
    (t = s) !== null && t !== void 0 ? t : 0,
    i + 1
  );
}
function he(e) {
  let t = 0;
  for (; t < e.length && ce(e.charCodeAt(t)); )
    ++t;
  return t;
}
let o;
(function(e) {
  e.SOF = "<SOF>", e.EOF = "<EOF>", e.BANG = "!", e.DOLLAR = "$", e.AMP = "&", e.PAREN_L = "(", e.PAREN_R = ")", e.SPREAD = "...", e.COLON = ":", e.EQUALS = "=", e.AT = "@", e.BRACKET_L = "[", e.BRACKET_R = "]", e.BRACE_L = "{", e.PIPE = "|", e.BRACE_R = "}", e.NAME = "Name", e.INT = "Int", e.FLOAT = "Float", e.STRING = "String", e.BLOCK_STRING = "BlockString", e.COMMENT = "Comment";
})(o || (o = {}));
class pe {
  constructor(t) {
    const n = new Y(o.SOF, 0, 0, 0, 0);
    this.source = t, this.lastToken = n, this.token = n, this.line = 1, this.lineStart = 0;
  }
  get [Symbol.toStringTag]() {
    return "Lexer";
  }
  advance() {
    return this.lastToken = this.token, this.token = this.lookahead();
  }
  lookahead() {
    let t = this.token;
    if (t.kind !== o.EOF)
      do
        if (t.next)
          t = t.next;
        else {
          const n = fe(this, t.end);
          t.next = n, n.prev = t, t = n;
        }
      while (t.kind === o.COMMENT);
    return t;
  }
}
function de(e) {
  return e === o.BANG || e === o.DOLLAR || e === o.AMP || e === o.PAREN_L || e === o.PAREN_R || e === o.SPREAD || e === o.COLON || e === o.EQUALS || e === o.AT || e === o.BRACKET_L || e === o.BRACKET_R || e === o.BRACE_L || e === o.PIPE || e === o.BRACE_R;
}
function O(e) {
  return e >= 0 && e <= 55295 || e >= 57344 && e <= 1114111;
}
function v(e, t) {
  return z(e.charCodeAt(t)) && X(e.charCodeAt(t + 1));
}
function z(e) {
  return e >= 55296 && e <= 56319;
}
function X(e) {
  return e >= 56320 && e <= 57343;
}
function T(e, t) {
  const n = e.source.body.codePointAt(t);
  if (n === void 0)
    return o.EOF;
  if (n >= 32 && n <= 126) {
    const s = String.fromCodePoint(n);
    return s === '"' ? `'"'` : `"${s}"`;
  }
  return "U+" + n.toString(16).toUpperCase().padStart(4, "0");
}
function h(e, t, n, s, i) {
  const r = e.line, a = 1 + n - e.lineStart;
  return new Y(t, n, s, r, a, i);
}
function fe(e, t) {
  const n = e.source.body, s = n.length;
  let i = t;
  for (; i < s; ) {
    const r = n.charCodeAt(i);
    switch (r) {
      case 65279:
      case 9:
      case 32:
      case 44:
        ++i;
        continue;
      case 10:
        ++i, ++e.line, e.lineStart = i;
        continue;
      case 13:
        n.charCodeAt(i + 1) === 10 ? i += 2 : ++i, ++e.line, e.lineStart = i;
        continue;
      case 35:
        return Ee(e, i);
      case 33:
        return h(e, o.BANG, i, i + 1);
      case 36:
        return h(e, o.DOLLAR, i, i + 1);
      case 38:
        return h(e, o.AMP, i, i + 1);
      case 40:
        return h(e, o.PAREN_L, i, i + 1);
      case 41:
        return h(e, o.PAREN_R, i, i + 1);
      case 46:
        if (n.charCodeAt(i + 1) === 46 && n.charCodeAt(i + 2) === 46)
          return h(e, o.SPREAD, i, i + 3);
        break;
      case 58:
        return h(e, o.COLON, i, i + 1);
      case 61:
        return h(e, o.EQUALS, i, i + 1);
      case 64:
        return h(e, o.AT, i, i + 1);
      case 91:
        return h(e, o.BRACKET_L, i, i + 1);
      case 93:
        return h(e, o.BRACKET_R, i, i + 1);
      case 123:
        return h(e, o.BRACE_L, i, i + 1);
      case 124:
        return h(e, o.PIPE, i, i + 1);
      case 125:
        return h(e, o.BRACE_R, i, i + 1);
      case 34:
        return n.charCodeAt(i + 1) === 34 && n.charCodeAt(i + 2) === 34 ? _e(e, i) : me(e, i);
    }
    if (g(r) || r === 45)
      return Ne(e, i, r);
    if (q(r))
      return Oe(e, i);
    throw d(
      e.source,
      i,
      r === 39 ? `Unexpected single quote character ('), did you mean to use a double quote (")?` : O(r) || v(n, i) ? `Unexpected character: ${T(e, i)}.` : `Invalid character: ${T(e, i)}.`
    );
  }
  return h(e, o.EOF, s, s);
}
function Ee(e, t) {
  const n = e.source.body, s = n.length;
  let i = t + 1;
  for (; i < s; ) {
    const r = n.charCodeAt(i);
    if (r === 10 || r === 13)
      break;
    if (O(r))
      ++i;
    else if (v(n, i))
      i += 2;
    else
      break;
  }
  return h(
    e,
    o.COMMENT,
    t,
    i,
    n.slice(t + 1, i)
  );
}
function Ne(e, t, n) {
  const s = e.source.body;
  let i = t, r = n, a = !1;
  if (r === 45 && (r = s.charCodeAt(++i)), r === 48) {
    if (r = s.charCodeAt(++i), g(r))
      throw d(
        e.source,
        i,
        `Invalid number, unexpected digit after 0: ${T(
          e,
          i
        )}.`
      );
  } else
    i = F(e, i, r), r = s.charCodeAt(i);
  if (r === 46 && (a = !0, r = s.charCodeAt(++i), i = F(e, i, r), r = s.charCodeAt(i)), (r === 69 || r === 101) && (a = !0, r = s.charCodeAt(++i), (r === 43 || r === 45) && (r = s.charCodeAt(++i)), i = F(e, i, r), r = s.charCodeAt(i)), r === 46 || q(r))
    throw d(
      e.source,
      i,
      `Invalid number, expected digit but got: ${T(
        e,
        i
      )}.`
    );
  return h(
    e,
    a ? o.FLOAT : o.INT,
    t,
    i,
    s.slice(t, i)
  );
}
function F(e, t, n) {
  if (!g(n))
    throw d(
      e.source,
      t,
      `Invalid number, expected digit but got: ${T(
        e,
        t
      )}.`
    );
  const s = e.source.body;
  let i = t + 1;
  for (; g(s.charCodeAt(i)); )
    ++i;
  return i;
}
function me(e, t) {
  const n = e.source.body, s = n.length;
  let i = t + 1, r = i, a = "";
  for (; i < s; ) {
    const u = n.charCodeAt(i);
    if (u === 34)
      return a += n.slice(r, i), h(e, o.STRING, t, i + 1, a);
    if (u === 92) {
      a += n.slice(r, i);
      const l = n.charCodeAt(i + 1) === 117 ? n.charCodeAt(i + 2) === 123 ? Te(e, i) : Ie(e, i) : xe(e, i);
      a += l.value, i += l.size, r = i;
      continue;
    }
    if (u === 10 || u === 13)
      break;
    if (O(u))
      ++i;
    else if (v(n, i))
      i += 2;
    else
      throw d(
        e.source,
        i,
        `Invalid character within String: ${T(
          e,
          i
        )}.`
      );
  }
  throw d(e.source, i, "Unterminated string.");
}
function Te(e, t) {
  const n = e.source.body;
  let s = 0, i = 3;
  for (; i < 12; ) {
    const r = n.charCodeAt(t + i++);
    if (r === 125) {
      if (i < 5 || !O(s))
        break;
      return {
        value: String.fromCodePoint(s),
        size: i
      };
    }
    if (s = s << 4 | y(r), s < 0)
      break;
  }
  throw d(
    e.source,
    t,
    `Invalid Unicode escape sequence: "${n.slice(
      t,
      t + i
    )}".`
  );
}
function Ie(e, t) {
  const n = e.source.body, s = j(n, t + 2);
  if (O(s))
    return {
      value: String.fromCodePoint(s),
      size: 6
    };
  if (z(s) && n.charCodeAt(t + 6) === 92 && n.charCodeAt(t + 7) === 117) {
    const i = j(n, t + 8);
    if (X(i))
      return {
        value: String.fromCodePoint(s, i),
        size: 12
      };
  }
  throw d(
    e.source,
    t,
    `Invalid Unicode escape sequence: "${n.slice(t, t + 6)}".`
  );
}
function j(e, t) {
  return y(e.charCodeAt(t)) << 12 | y(e.charCodeAt(t + 1)) << 8 | y(e.charCodeAt(t + 2)) << 4 | y(e.charCodeAt(t + 3));
}
function y(e) {
  return e >= 48 && e <= 57 ? e - 48 : e >= 65 && e <= 70 ? e - 55 : e >= 97 && e <= 102 ? e - 87 : -1;
}
function xe(e, t) {
  const n = e.source.body;
  switch (n.charCodeAt(t + 1)) {
    case 34:
      return {
        value: '"',
        size: 2
      };
    case 92:
      return {
        value: "\\",
        size: 2
      };
    case 47:
      return {
        value: "/",
        size: 2
      };
    case 98:
      return {
        value: "\b",
        size: 2
      };
    case 102:
      return {
        value: "\f",
        size: 2
      };
    case 110:
      return {
        value: `
`,
        size: 2
      };
    case 114:
      return {
        value: "\r",
        size: 2
      };
    case 116:
      return {
        value: "	",
        size: 2
      };
  }
  throw d(
    e.source,
    t,
    `Invalid character escape sequence: "${n.slice(
      t,
      t + 2
    )}".`
  );
}
function _e(e, t) {
  const n = e.source.body, s = n.length;
  let i = e.lineStart, r = t + 3, a = r, u = "";
  const l = [];
  for (; r < s; ) {
    const E = n.charCodeAt(r);
    if (E === 34 && n.charCodeAt(r + 1) === 34 && n.charCodeAt(r + 2) === 34) {
      u += n.slice(a, r), l.push(u);
      const p = h(
        e,
        o.BLOCK_STRING,
        t,
        r + 3,
        le(l).join(`
`)
      );
      return e.line += l.length - 1, e.lineStart = i, p;
    }
    if (E === 92 && n.charCodeAt(r + 1) === 34 && n.charCodeAt(r + 2) === 34 && n.charCodeAt(r + 3) === 34) {
      u += n.slice(a, r), a = r + 1, r += 4;
      continue;
    }
    if (E === 10 || E === 13) {
      u += n.slice(a, r), l.push(u), E === 13 && n.charCodeAt(r + 1) === 10 ? r += 2 : ++r, u = "", a = r, i = r;
      continue;
    }
    if (O(E))
      ++r;
    else if (v(n, r))
      r += 2;
    else
      throw d(
        e.source,
        r,
        `Invalid character within String: ${T(
          e,
          r
        )}.`
      );
  }
  throw d(e.source, r, "Unterminated string.");
}
function Oe(e, t) {
  const n = e.source.body, s = n.length;
  let i = t + 1;
  for (; i < s; ) {
    const r = n.charCodeAt(i);
    if (ue(r))
      ++i;
    else
      break;
  }
  return h(
    e,
    o.NAME,
    t,
    i,
    n.slice(t, i)
  );
}
const Ae = 10, Q = 2;
function H(e) {
  return b(e, []);
}
function b(e, t) {
  switch (typeof e) {
    case "string":
      return JSON.stringify(e);
    case "function":
      return e.name ? `[function ${e.name}]` : "[function]";
    case "object":
      return ye(e, t);
    default:
      return String(e);
  }
}
function ye(e, t) {
  if (e === null)
    return "null";
  if (t.includes(e))
    return "[Circular]";
  const n = [...t, e];
  if (ge(e)) {
    const s = e.toJSON();
    if (s !== e)
      return typeof s == "string" ? s : b(s, n);
  } else if (Array.isArray(e))
    return De(e, n);
  return Ce(e, n);
}
function ge(e) {
  return typeof e.toJSON == "function";
}
function Ce(e, t) {
  const n = Object.entries(e);
  if (n.length === 0)
    return "{}";
  if (t.length > Q)
    return "[" + ke(e) + "]";
  const s = n.map(
    ([i, r]) => i + ": " + b(r, t)
  );
  return "{ " + s.join(", ") + " }";
}
function De(e, t) {
  if (e.length === 0)
    return "[]";
  if (t.length > Q)
    return "[Array]";
  const n = Math.min(Ae, e.length), s = e.length - n, i = [];
  for (let r = 0; r < n; ++r)
    i.push(b(e[r], t));
  return s === 1 ? i.push("... 1 more item") : s > 1 && i.push(`... ${s} more items`), "[" + i.join(", ") + "]";
}
function ke(e) {
  const t = Object.prototype.toString.call(e).replace(/^\[object /, "").replace(/]$/, "");
  if (t === "Object" && typeof e.constructor == "function") {
    const n = e.constructor.name;
    if (typeof n == "string" && n !== "")
      return n;
  }
  return t;
}
const Se = process.env.NODE_ENV === "production" ? function(t, n) {
  return t instanceof n;
} : function(t, n) {
  if (t instanceof n)
    return !0;
  if (typeof t == "object" && t !== null) {
    var s;
    const i = n.prototype[Symbol.toStringTag], r = Symbol.toStringTag in t ? t[Symbol.toStringTag] : (s = t.constructor) === null || s === void 0 ? void 0 : s.name;
    if (i === r) {
      const a = H(t);
      throw new Error(`Cannot use ${i} "${a}" from another module or realm.

Ensure that there is only one instance of "graphql" in the node_modules
directory. If different versions of "graphql" are the dependencies of other
relied on modules, use "resolutions" to ensure only one version is installed.

https://yarnpkg.com/en/docs/selective-version-resolutions

Duplicate "graphql" modules cannot be used at the same time since different
versions may have different capabilities and behavior. The data from one
version used in the function from another could produce confusing and
spurious results.`);
    }
  }
  return !1;
};
class W {
  constructor(t, n = "GraphQL request", s = {
    line: 1,
    column: 1
  }) {
    typeof t == "string" || L(!1, `Body must be a string. Received: ${H(t)}.`), this.body = t, this.name = n, this.locationOffset = s, this.locationOffset.line > 0 || L(
      !1,
      "line in locationOffset is 1-indexed and must be positive."
    ), this.locationOffset.column > 0 || L(
      !1,
      "column in locationOffset is 1-indexed and must be positive."
    );
  }
  get [Symbol.toStringTag]() {
    return "Source";
  }
}
function ve(e) {
  return Se(e, W);
}
function be(e, t) {
  return new Re(e, t).parseDocument();
}
class Re {
  constructor(t, n) {
    const s = ve(t) ? t : new W(t);
    this._lexer = new pe(s), this._options = n;
  }
  parseName() {
    const t = this.expectToken(o.NAME);
    return this.node(t, {
      kind: c.NAME,
      value: t.value
    });
  }
  parseDocument() {
    return this.node(this._lexer.token, {
      kind: c.DOCUMENT,
      definitions: this.many(
        o.SOF,
        this.parseDefinition,
        o.EOF
      )
    });
  }
  parseDefinition() {
    if (this.peek(o.BRACE_L))
      return this.parseOperationDefinition();
    const t = this.peekDescription(), n = t ? this._lexer.lookahead() : this._lexer.token;
    if (n.kind === o.NAME) {
      switch (n.value) {
        case "schema":
          return this.parseSchemaDefinition();
        case "scalar":
          return this.parseScalarTypeDefinition();
        case "type":
          return this.parseObjectTypeDefinition();
        case "interface":
          return this.parseInterfaceTypeDefinition();
        case "union":
          return this.parseUnionTypeDefinition();
        case "enum":
          return this.parseEnumTypeDefinition();
        case "input":
          return this.parseInputObjectTypeDefinition();
        case "directive":
          return this.parseDirectiveDefinition();
      }
      if (t)
        throw d(
          this._lexer.source,
          this._lexer.token.start,
          "Unexpected description, descriptions are supported only on type definitions."
        );
      switch (n.value) {
        case "query":
        case "mutation":
        case "subscription":
          return this.parseOperationDefinition();
        case "fragment":
          return this.parseFragmentDefinition();
        case "extend":
          return this.parseTypeSystemExtension();
      }
    }
    throw this.unexpected(n);
  }
  parseOperationDefinition() {
    const t = this._lexer.token;
    if (this.peek(o.BRACE_L))
      return this.node(t, {
        kind: c.OPERATION_DEFINITION,
        operation: x.QUERY,
        name: void 0,
        variableDefinitions: [],
        directives: [],
        selectionSet: this.parseSelectionSet()
      });
    const n = this.parseOperationType();
    let s;
    return this.peek(o.NAME) && (s = this.parseName()), this.node(t, {
      kind: c.OPERATION_DEFINITION,
      operation: n,
      name: s,
      variableDefinitions: this.parseVariableDefinitions(),
      directives: this.parseDirectives(!1),
      selectionSet: this.parseSelectionSet()
    });
  }
  parseOperationType() {
    const t = this.expectToken(o.NAME);
    switch (t.value) {
      case "query":
        return x.QUERY;
      case "mutation":
        return x.MUTATION;
      case "subscription":
        return x.SUBSCRIPTION;
    }
    throw this.unexpected(t);
  }
  parseVariableDefinitions() {
    return this.optionalMany(
      o.PAREN_L,
      this.parseVariableDefinition,
      o.PAREN_R
    );
  }
  parseVariableDefinition() {
    return this.node(this._lexer.token, {
      kind: c.VARIABLE_DEFINITION,
      variable: this.parseVariable(),
      type: (this.expectToken(o.COLON), this.parseTypeReference()),
      defaultValue: this.expectOptionalToken(o.EQUALS) ? this.parseConstValueLiteral() : void 0,
      directives: this.parseConstDirectives()
    });
  }
  parseVariable() {
    const t = this._lexer.token;
    return this.expectToken(o.DOLLAR), this.node(t, {
      kind: c.VARIABLE,
      name: this.parseName()
    });
  }
  parseSelectionSet() {
    return this.node(this._lexer.token, {
      kind: c.SELECTION_SET,
      selections: this.many(
        o.BRACE_L,
        this.parseSelection,
        o.BRACE_R
      )
    });
  }
  parseSelection() {
    return this.peek(o.SPREAD) ? this.parseFragment() : this.parseField();
  }
  parseField() {
    const t = this._lexer.token, n = this.parseName();
    let s, i;
    return this.expectOptionalToken(o.COLON) ? (s = n, i = this.parseName()) : i = n, this.node(t, {
      kind: c.FIELD,
      alias: s,
      name: i,
      arguments: this.parseArguments(!1),
      directives: this.parseDirectives(!1),
      selectionSet: this.peek(o.BRACE_L) ? this.parseSelectionSet() : void 0
    });
  }
  parseArguments(t) {
    const n = t ? this.parseConstArgument : this.parseArgument;
    return this.optionalMany(o.PAREN_L, n, o.PAREN_R);
  }
  parseArgument(t = !1) {
    const n = this._lexer.token, s = this.parseName();
    return this.expectToken(o.COLON), this.node(n, {
      kind: c.ARGUMENT,
      name: s,
      value: this.parseValueLiteral(t)
    });
  }
  parseConstArgument() {
    return this.parseArgument(!0);
  }
  parseFragment() {
    const t = this._lexer.token;
    this.expectToken(o.SPREAD);
    const n = this.expectOptionalKeyword("on");
    return !n && this.peek(o.NAME) ? this.node(t, {
      kind: c.FRAGMENT_SPREAD,
      name: this.parseFragmentName(),
      directives: this.parseDirectives(!1)
    }) : this.node(t, {
      kind: c.INLINE_FRAGMENT,
      typeCondition: n ? this.parseNamedType() : void 0,
      directives: this.parseDirectives(!1),
      selectionSet: this.parseSelectionSet()
    });
  }
  parseFragmentDefinition() {
    var t;
    const n = this._lexer.token;
    return this.expectKeyword("fragment"), ((t = this._options) === null || t === void 0 ? void 0 : t.allowLegacyFragmentVariables) === !0 ? this.node(n, {
      kind: c.FRAGMENT_DEFINITION,
      name: this.parseFragmentName(),
      variableDefinitions: this.parseVariableDefinitions(),
      typeCondition: (this.expectKeyword("on"), this.parseNamedType()),
      directives: this.parseDirectives(!1),
      selectionSet: this.parseSelectionSet()
    }) : this.node(n, {
      kind: c.FRAGMENT_DEFINITION,
      name: this.parseFragmentName(),
      typeCondition: (this.expectKeyword("on"), this.parseNamedType()),
      directives: this.parseDirectives(!1),
      selectionSet: this.parseSelectionSet()
    });
  }
  parseFragmentName() {
    if (this._lexer.token.value === "on")
      throw this.unexpected();
    return this.parseName();
  }
  parseValueLiteral(t) {
    const n = this._lexer.token;
    switch (n.kind) {
      case o.BRACKET_L:
        return this.parseList(t);
      case o.BRACE_L:
        return this.parseObject(t);
      case o.INT:
        return this._lexer.advance(), this.node(n, {
          kind: c.INT,
          value: n.value
        });
      case o.FLOAT:
        return this._lexer.advance(), this.node(n, {
          kind: c.FLOAT,
          value: n.value
        });
      case o.STRING:
      case o.BLOCK_STRING:
        return this.parseStringLiteral();
      case o.NAME:
        switch (this._lexer.advance(), n.value) {
          case "true":
            return this.node(n, {
              kind: c.BOOLEAN,
              value: !0
            });
          case "false":
            return this.node(n, {
              kind: c.BOOLEAN,
              value: !1
            });
          case "null":
            return this.node(n, {
              kind: c.NULL
            });
          default:
            return this.node(n, {
              kind: c.ENUM,
              value: n.value
            });
        }
      case o.DOLLAR:
        if (t)
          if (this.expectToken(o.DOLLAR), this._lexer.token.kind === o.NAME) {
            const s = this._lexer.token.value;
            throw d(
              this._lexer.source,
              n.start,
              `Unexpected variable "$${s}" in constant value.`
            );
          } else
            throw this.unexpected(n);
        return this.parseVariable();
      default:
        throw this.unexpected();
    }
  }
  parseConstValueLiteral() {
    return this.parseValueLiteral(!0);
  }
  parseStringLiteral() {
    const t = this._lexer.token;
    return this._lexer.advance(), this.node(t, {
      kind: c.STRING,
      value: t.value,
      block: t.kind === o.BLOCK_STRING
    });
  }
  parseList(t) {
    const n = () => this.parseValueLiteral(t);
    return this.node(this._lexer.token, {
      kind: c.LIST,
      values: this.any(o.BRACKET_L, n, o.BRACKET_R)
    });
  }
  parseObject(t) {
    const n = () => this.parseObjectField(t);
    return this.node(this._lexer.token, {
      kind: c.OBJECT,
      fields: this.any(o.BRACE_L, n, o.BRACE_R)
    });
  }
  parseObjectField(t) {
    const n = this._lexer.token, s = this.parseName();
    return this.expectToken(o.COLON), this.node(n, {
      kind: c.OBJECT_FIELD,
      name: s,
      value: this.parseValueLiteral(t)
    });
  }
  parseDirectives(t) {
    const n = [];
    for (; this.peek(o.AT); )
      n.push(this.parseDirective(t));
    return n;
  }
  parseConstDirectives() {
    return this.parseDirectives(!0);
  }
  parseDirective(t) {
    const n = this._lexer.token;
    return this.expectToken(o.AT), this.node(n, {
      kind: c.DIRECTIVE,
      name: this.parseName(),
      arguments: this.parseArguments(t)
    });
  }
  parseTypeReference() {
    const t = this._lexer.token;
    let n;
    if (this.expectOptionalToken(o.BRACKET_L)) {
      const s = this.parseTypeReference();
      this.expectToken(o.BRACKET_R), n = this.node(t, {
        kind: c.LIST_TYPE,
        type: s
      });
    } else
      n = this.parseNamedType();
    return this.expectOptionalToken(o.BANG) ? this.node(t, {
      kind: c.NON_NULL_TYPE,
      type: n
    }) : n;
  }
  parseNamedType() {
    return this.node(this._lexer.token, {
      kind: c.NAMED_TYPE,
      name: this.parseName()
    });
  }
  peekDescription() {
    return this.peek(o.STRING) || this.peek(o.BLOCK_STRING);
  }
  parseDescription() {
    if (this.peekDescription())
      return this.parseStringLiteral();
  }
  parseSchemaDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("schema");
    const s = this.parseConstDirectives(), i = this.many(
      o.BRACE_L,
      this.parseOperationTypeDefinition,
      o.BRACE_R
    );
    return this.node(t, {
      kind: c.SCHEMA_DEFINITION,
      description: n,
      directives: s,
      operationTypes: i
    });
  }
  parseOperationTypeDefinition() {
    const t = this._lexer.token, n = this.parseOperationType();
    this.expectToken(o.COLON);
    const s = this.parseNamedType();
    return this.node(t, {
      kind: c.OPERATION_TYPE_DEFINITION,
      operation: n,
      type: s
    });
  }
  parseScalarTypeDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("scalar");
    const s = this.parseName(), i = this.parseConstDirectives();
    return this.node(t, {
      kind: c.SCALAR_TYPE_DEFINITION,
      description: n,
      name: s,
      directives: i
    });
  }
  parseObjectTypeDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("type");
    const s = this.parseName(), i = this.parseImplementsInterfaces(), r = this.parseConstDirectives(), a = this.parseFieldsDefinition();
    return this.node(t, {
      kind: c.OBJECT_TYPE_DEFINITION,
      description: n,
      name: s,
      interfaces: i,
      directives: r,
      fields: a
    });
  }
  parseImplementsInterfaces() {
    return this.expectOptionalKeyword("implements") ? this.delimitedMany(o.AMP, this.parseNamedType) : [];
  }
  parseFieldsDefinition() {
    return this.optionalMany(
      o.BRACE_L,
      this.parseFieldDefinition,
      o.BRACE_R
    );
  }
  parseFieldDefinition() {
    const t = this._lexer.token, n = this.parseDescription(), s = this.parseName(), i = this.parseArgumentDefs();
    this.expectToken(o.COLON);
    const r = this.parseTypeReference(), a = this.parseConstDirectives();
    return this.node(t, {
      kind: c.FIELD_DEFINITION,
      description: n,
      name: s,
      arguments: i,
      type: r,
      directives: a
    });
  }
  parseArgumentDefs() {
    return this.optionalMany(
      o.PAREN_L,
      this.parseInputValueDef,
      o.PAREN_R
    );
  }
  parseInputValueDef() {
    const t = this._lexer.token, n = this.parseDescription(), s = this.parseName();
    this.expectToken(o.COLON);
    const i = this.parseTypeReference();
    let r;
    this.expectOptionalToken(o.EQUALS) && (r = this.parseConstValueLiteral());
    const a = this.parseConstDirectives();
    return this.node(t, {
      kind: c.INPUT_VALUE_DEFINITION,
      description: n,
      name: s,
      type: i,
      defaultValue: r,
      directives: a
    });
  }
  parseInterfaceTypeDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("interface");
    const s = this.parseName(), i = this.parseImplementsInterfaces(), r = this.parseConstDirectives(), a = this.parseFieldsDefinition();
    return this.node(t, {
      kind: c.INTERFACE_TYPE_DEFINITION,
      description: n,
      name: s,
      interfaces: i,
      directives: r,
      fields: a
    });
  }
  parseUnionTypeDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("union");
    const s = this.parseName(), i = this.parseConstDirectives(), r = this.parseUnionMemberTypes();
    return this.node(t, {
      kind: c.UNION_TYPE_DEFINITION,
      description: n,
      name: s,
      directives: i,
      types: r
    });
  }
  parseUnionMemberTypes() {
    return this.expectOptionalToken(o.EQUALS) ? this.delimitedMany(o.PIPE, this.parseNamedType) : [];
  }
  parseEnumTypeDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("enum");
    const s = this.parseName(), i = this.parseConstDirectives(), r = this.parseEnumValuesDefinition();
    return this.node(t, {
      kind: c.ENUM_TYPE_DEFINITION,
      description: n,
      name: s,
      directives: i,
      values: r
    });
  }
  parseEnumValuesDefinition() {
    return this.optionalMany(
      o.BRACE_L,
      this.parseEnumValueDefinition,
      o.BRACE_R
    );
  }
  parseEnumValueDefinition() {
    const t = this._lexer.token, n = this.parseDescription(), s = this.parseEnumValueName(), i = this.parseConstDirectives();
    return this.node(t, {
      kind: c.ENUM_VALUE_DEFINITION,
      description: n,
      name: s,
      directives: i
    });
  }
  parseEnumValueName() {
    if (this._lexer.token.value === "true" || this._lexer.token.value === "false" || this._lexer.token.value === "null")
      throw d(
        this._lexer.source,
        this._lexer.token.start,
        `${C(
          this._lexer.token
        )} is reserved and cannot be used for an enum value.`
      );
    return this.parseName();
  }
  parseInputObjectTypeDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("input");
    const s = this.parseName(), i = this.parseConstDirectives(), r = this.parseInputFieldsDefinition();
    return this.node(t, {
      kind: c.INPUT_OBJECT_TYPE_DEFINITION,
      description: n,
      name: s,
      directives: i,
      fields: r
    });
  }
  parseInputFieldsDefinition() {
    return this.optionalMany(
      o.BRACE_L,
      this.parseInputValueDef,
      o.BRACE_R
    );
  }
  parseTypeSystemExtension() {
    const t = this._lexer.lookahead();
    if (t.kind === o.NAME)
      switch (t.value) {
        case "schema":
          return this.parseSchemaExtension();
        case "scalar":
          return this.parseScalarTypeExtension();
        case "type":
          return this.parseObjectTypeExtension();
        case "interface":
          return this.parseInterfaceTypeExtension();
        case "union":
          return this.parseUnionTypeExtension();
        case "enum":
          return this.parseEnumTypeExtension();
        case "input":
          return this.parseInputObjectTypeExtension();
      }
    throw this.unexpected(t);
  }
  parseSchemaExtension() {
    const t = this._lexer.token;
    this.expectKeyword("extend"), this.expectKeyword("schema");
    const n = this.parseConstDirectives(), s = this.optionalMany(
      o.BRACE_L,
      this.parseOperationTypeDefinition,
      o.BRACE_R
    );
    if (n.length === 0 && s.length === 0)
      throw this.unexpected();
    return this.node(t, {
      kind: c.SCHEMA_EXTENSION,
      directives: n,
      operationTypes: s
    });
  }
  parseScalarTypeExtension() {
    const t = this._lexer.token;
    this.expectKeyword("extend"), this.expectKeyword("scalar");
    const n = this.parseName(), s = this.parseConstDirectives();
    if (s.length === 0)
      throw this.unexpected();
    return this.node(t, {
      kind: c.SCALAR_TYPE_EXTENSION,
      name: n,
      directives: s
    });
  }
  parseObjectTypeExtension() {
    const t = this._lexer.token;
    this.expectKeyword("extend"), this.expectKeyword("type");
    const n = this.parseName(), s = this.parseImplementsInterfaces(), i = this.parseConstDirectives(), r = this.parseFieldsDefinition();
    if (s.length === 0 && i.length === 0 && r.length === 0)
      throw this.unexpected();
    return this.node(t, {
      kind: c.OBJECT_TYPE_EXTENSION,
      name: n,
      interfaces: s,
      directives: i,
      fields: r
    });
  }
  parseInterfaceTypeExtension() {
    const t = this._lexer.token;
    this.expectKeyword("extend"), this.expectKeyword("interface");
    const n = this.parseName(), s = this.parseImplementsInterfaces(), i = this.parseConstDirectives(), r = this.parseFieldsDefinition();
    if (s.length === 0 && i.length === 0 && r.length === 0)
      throw this.unexpected();
    return this.node(t, {
      kind: c.INTERFACE_TYPE_EXTENSION,
      name: n,
      interfaces: s,
      directives: i,
      fields: r
    });
  }
  parseUnionTypeExtension() {
    const t = this._lexer.token;
    this.expectKeyword("extend"), this.expectKeyword("union");
    const n = this.parseName(), s = this.parseConstDirectives(), i = this.parseUnionMemberTypes();
    if (s.length === 0 && i.length === 0)
      throw this.unexpected();
    return this.node(t, {
      kind: c.UNION_TYPE_EXTENSION,
      name: n,
      directives: s,
      types: i
    });
  }
  parseEnumTypeExtension() {
    const t = this._lexer.token;
    this.expectKeyword("extend"), this.expectKeyword("enum");
    const n = this.parseName(), s = this.parseConstDirectives(), i = this.parseEnumValuesDefinition();
    if (s.length === 0 && i.length === 0)
      throw this.unexpected();
    return this.node(t, {
      kind: c.ENUM_TYPE_EXTENSION,
      name: n,
      directives: s,
      values: i
    });
  }
  parseInputObjectTypeExtension() {
    const t = this._lexer.token;
    this.expectKeyword("extend"), this.expectKeyword("input");
    const n = this.parseName(), s = this.parseConstDirectives(), i = this.parseInputFieldsDefinition();
    if (s.length === 0 && i.length === 0)
      throw this.unexpected();
    return this.node(t, {
      kind: c.INPUT_OBJECT_TYPE_EXTENSION,
      name: n,
      directives: s,
      fields: i
    });
  }
  parseDirectiveDefinition() {
    const t = this._lexer.token, n = this.parseDescription();
    this.expectKeyword("directive"), this.expectToken(o.AT);
    const s = this.parseName(), i = this.parseArgumentDefs(), r = this.expectOptionalKeyword("repeatable");
    this.expectKeyword("on");
    const a = this.parseDirectiveLocations();
    return this.node(t, {
      kind: c.DIRECTIVE_DEFINITION,
      description: n,
      name: s,
      arguments: i,
      repeatable: r,
      locations: a
    });
  }
  parseDirectiveLocations() {
    return this.delimitedMany(o.PIPE, this.parseDirectiveLocation);
  }
  parseDirectiveLocation() {
    const t = this._lexer.token, n = this.parseName();
    if (Object.prototype.hasOwnProperty.call(P, n.value))
      return n;
    throw this.unexpected(t);
  }
  node(t, n) {
    var s;
    return ((s = this._options) === null || s === void 0 ? void 0 : s.noLocation) !== !0 && (n.loc = new ae(
      t,
      this._lexer.lastToken,
      this._lexer.source
    )), n;
  }
  peek(t) {
    return this._lexer.token.kind === t;
  }
  expectToken(t) {
    const n = this._lexer.token;
    if (n.kind === t)
      return this._lexer.advance(), n;
    throw d(
      this._lexer.source,
      n.start,
      `Expected ${Z(t)}, found ${C(n)}.`
    );
  }
  expectOptionalToken(t) {
    return this._lexer.token.kind === t ? (this._lexer.advance(), !0) : !1;
  }
  expectKeyword(t) {
    const n = this._lexer.token;
    if (n.kind === o.NAME && n.value === t)
      this._lexer.advance();
    else
      throw d(
        this._lexer.source,
        n.start,
        `Expected "${t}", found ${C(n)}.`
      );
  }
  expectOptionalKeyword(t) {
    const n = this._lexer.token;
    return n.kind === o.NAME && n.value === t ? (this._lexer.advance(), !0) : !1;
  }
  unexpected(t) {
    const n = t != null ? t : this._lexer.token;
    return d(
      this._lexer.source,
      n.start,
      `Unexpected ${C(n)}.`
    );
  }
  any(t, n, s) {
    this.expectToken(t);
    const i = [];
    for (; !this.expectOptionalToken(s); )
      i.push(n.call(this));
    return i;
  }
  optionalMany(t, n, s) {
    if (this.expectOptionalToken(t)) {
      const i = [];
      do
        i.push(n.call(this));
      while (!this.expectOptionalToken(s));
      return i;
    }
    return [];
  }
  many(t, n, s) {
    this.expectToken(t);
    const i = [];
    do
      i.push(n.call(this));
    while (!this.expectOptionalToken(s));
    return i;
  }
  delimitedMany(t, n) {
    this.expectOptionalToken(t);
    const s = [];
    do
      s.push(n.call(this));
    while (this.expectOptionalToken(t));
    return s;
  }
}
function C(e) {
  const t = e.value;
  return Z(e.kind) + (t != null ? ` "${t}"` : "");
}
function Z(e) {
  return de(e) ? `"${e}"` : e;
}
var D = /* @__PURE__ */ new Map(), M = /* @__PURE__ */ new Map(), K = !0, S = !1;
function ee(e) {
  return e.replace(/[\s,]+/g, " ").trim();
}
function Le(e) {
  return ee(e.source.body.substring(e.start, e.end));
}
function Fe(e) {
  var t = /* @__PURE__ */ new Set(), n = [];
  return e.definitions.forEach(function(s) {
    if (s.kind === "FragmentDefinition") {
      var i = s.name.value, r = Le(s.loc), a = M.get(i);
      a && !a.has(r) ? K && console.warn("Warning: fragment with name " + i + ` already exists.
graphql-tag enforces all fragment names across your application to be unique; read more about
this in the docs: http://dev.apollodata.com/core/fragments.html#unique-names`) : a || M.set(i, a = /* @__PURE__ */ new Set()), a.add(r), t.has(r) || (t.add(r), n.push(s));
    } else
      n.push(s);
  }), k(k({}, e), { definitions: n });
}
function we(e) {
  var t = new Set(e.definitions);
  t.forEach(function(s) {
    s.loc && delete s.loc, Object.keys(s).forEach(function(i) {
      var r = s[i];
      r && typeof r == "object" && t.add(r);
    });
  });
  var n = e.loc;
  return n && (delete n.startToken, delete n.endToken), e;
}
function Pe(e) {
  var t = ee(e);
  if (!D.has(t)) {
    var n = be(e, {
      experimentalFragmentVariables: S,
      allowLegacyFragmentVariables: S
    });
    if (!n || n.kind !== "Document")
      throw new Error("Not a valid GraphQL document.");
    D.set(t, we(Fe(n)));
  }
  return D.get(t);
}
function _(e) {
  for (var t = [], n = 1; n < arguments.length; n++)
    t[n - 1] = arguments[n];
  typeof e == "string" && (e = [e]);
  var s = e[0];
  return t.forEach(function(i, r) {
    i && i.kind === "Document" ? s += i.loc.source.body : s += i, s += e[r + 1];
  }), Pe(s);
}
function Me() {
  D.clear(), M.clear();
}
function Ue() {
  K = !1;
}
function Be() {
  S = !0;
}
function Ve() {
  S = !1;
}
var A = {
  gql: _,
  resetCaches: Me,
  disableFragmentWarnings: Ue,
  enableExperimentalFragmentVariables: Be,
  disableExperimentalFragmentVariables: Ve
};
(function(e) {
  e.gql = A.gql, e.resetCaches = A.resetCaches, e.disableFragmentWarnings = A.disableFragmentWarnings, e.enableExperimentalFragmentVariables = A.enableExperimentalFragmentVariables, e.disableExperimentalFragmentVariables = A.disableExperimentalFragmentVariables;
})(_ || (_ = {}));
_.default = _;
const je = _;
je`
  query something {
    attributes {
      id
    }

    values {
      id
    }
  }
`;
const G = [
  {
    id: "21340987",
    entityId: "1234567890",
    attribute: "name",
    value: "Jesus Christ"
  }
], Ge = (e) => new Promise((t) => setTimeout(t, e));
async function te(e) {
  return await Ge(2e3), e ? G.filter((t) => t.id === e) : G;
}
async function $e() {
  return await te();
}
async function Ye(e) {
  return await te(e);
}
const Je = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getFacts: $e,
  getFact: Ye
}, Symbol.toStringTag, { value: "Module" }));
function qe(e) {
  return e.store();
}
function ze(e) {
  return e.create();
}
const Xe = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  writeToIpfs: qe,
  writeToContract: ze
}, Symbol.toStringTag, { value: "Module" })), Qe = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  read: Je,
  write: Xe
}, Symbol.toStringTag, { value: "Module" }));
export {
  Qe as topDownGraphQl
};
