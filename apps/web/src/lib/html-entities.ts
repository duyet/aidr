/** U+00A0..U+00FF in order. */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";

/** U+0100..U+017E in order. `-` marks a code point HTML has no name for. */
const LATIN_EXT_A = [
  "Amacr amacr Abreve abreve Aogon aogon Cacute cacute Ccirc ccirc Cdot cdot Ccaron ccaron Dcaron dcaron Dstrok dstrok",
  "Emacr emacr - - Edot edot Eogon eogon Ecaron ecaron Gcirc gcirc Gbreve gbreve Gdot gdot Gcedil -",
  "Hcirc hcirc Hstrok hstrok Itilde itilde Imacr imacr - - Iogon iogon Idot imath IJlig ijlig Jcirc jcirc",
  "Kcedil kcedil kgreen Lacute lacute Lcedil lcedil Lcaron lcaron Lmidot lmidot Lstrok lstrok Nacute nacute Ncedil ncedil Ncaron ncaron napos ENG eng",
  "Omacr omacr - - Odblac odblac OElig oelig Racute racute Rcedil rcedil Rcaron rcaron Sacute sacute Scirc scirc Scedil scedil Scaron scaron",
  "Tcedil tcedil Tcaron tcaron Tstrok tstrok Utilde utilde Umacr umacr Ubreve ubreve Uring uring Udblac udblac Uogon uogon Wcirc wcirc Ycirc ycirc Yuml",
  "Zacute zacute Zdot zdot Zcaron zcaron",
]
  .join(" ")
  .split(" ");

const MISC: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  AMP: "&",
  LT: "<",
  GT: ">",
  QUOT: '"',
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "‌",
  zwj: "‍",
  lrm: "‎",
  rlm: "‏",
  hyphen: "‐",
  ndash: "–",
  mdash: "—",
  horbar: "―",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  bull: "•",
  hellip: "…",
  permil: "‰",
  prime: "′",
  Prime: "″",
  lsaquo: "‹",
  rsaquo: "›",
  oline: "‾",
  frasl: "⁄",
  euro: "€",
  trade: "™",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
  lArr: "⇐",
  rArr: "⇒",
  hArr: "⇔",
  minus: "−",
  lowast: "∗",
  radic: "√",
  infin: "∞",
  asymp: "≈",
  ne: "≠",
  equiv: "≡",
  le: "≤",
  ge: "≥",
  sum: "∑",
  prod: "∏",
  part: "∂",
  nabla: "∇",
  isin: "∈",
  cap: "∩",
  cup: "∪",
  int: "∫",
  there4: "∴",
  sim: "∼",
  loz: "◊",
  spades: "♠",
  clubs: "♣",
  hearts: "♥",
  diams: "♦",
  fnof: "ƒ",
  circ: "ˆ",
  tilde: "˜",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
  Delta: "Δ",
  Sigma: "Σ",
  Omega: "Ω",
};

/** Named references feeds actually emit: all of Latin-1 and Latin Extended-A
 *  (accented names such as `&oacute;`), typographic punctuation, and common
 *  symbols. Not the full HTML5 list. The decoder leaves unknown names as
 *  written. `nbsp` decodes to a plain space so stored text keeps normal
 *  word breaks. */
export const NAMED_ENTITIES: Record<string, string> = (() => {
  const table: Record<string, string> = { ...MISC };
  LATIN1.split(" ").forEach((name, i) => {
    table[name] = String.fromCodePoint(0xa0 + i);
  });
  LATIN_EXT_A.forEach((name, i) => {
    if (name !== "-") table[name] = String.fromCodePoint(0x100 + i);
  });
  table.nbsp = " ";
  return table;
})();
