#!/usr/bin/env python3
"""Extracts unison's preference definitions from its OCaml sources.

Usage: extract-unison-prefs.py <unison-src-dir> > src/unison/prefs.generated.json

Reads every Prefs.create*/Pred.create call and emits name, kind, category,
default, short doc and flags, so the app validates profiles exactly against
the unison version it bundles.
"""
import json
import pathlib
import re
import sys

# prefs.ml itself calls its constructors unqualified
CALL = re.compile(r"(?<![\w.])((?:Prefs\.)?create(Bool|Int|String|StringList|BoolWithDefault)|Prefs\.create|Pred\.create)\b")
# "include" and "source" are registered only for documentation; they are directives
DIRECTIVES = {"include", "source"}
KINDS = {
    "Bool": "bool",
    "Int": "int",
    "String": "string",
    "StringList": "stringList",
    "BoolWithDefault": "boolDefault",
    None: "custom",
}
# Positional arguments after the name, per creation function
POSITIONAL = {
    "bool": ["default", "doc", "fulldoc"],
    "int": ["default", "doc", "fulldoc"],
    "string": ["default", "doc", "fulldoc"],
    "stringList": ["doc", "fulldoc"],
    "boolDefault": ["doc", "fulldoc"],
    "custom": ["default", "doc", "fulldoc"],
    "pattern": ["fulldoc"],
}


def tokens(src, i):
    """Yields (kind, text, end) tokens of an OCaml application starting at i."""
    n = len(src)
    while i < n:
        c = src[i]
        if c.isspace():
            i += 1
        elif src.startswith("(*", i):
            depth, i = 1, i + 2
            while depth and i < n:
                if src.startswith("(*", i):
                    depth, i = depth + 1, i + 2
                elif src.startswith("*)", i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
        elif c == '"':
            j = i + 1
            while src[j] != '"':
                j += 2 if src[j] == "\\" else 1
            yield "str", src[i : j + 1], j + 1
            i = j + 1
        elif c in "([":
            close = ")" if c == "(" else "]"
            depth, j = 1, i + 1
            while depth:
                if src[j] == '"':
                    j += 1
                    while src[j] != '"':
                        j += 2 if src[j] == "\\" else 1
                elif src[j] == c:
                    depth += 1
                elif src[j] == close:
                    depth -= 1
                j += 1
            yield "group", src[i:j], j
            i = j
        elif c in "~?":
            m = re.match(r"[~?](\w+)(:)?", src[i:])
            yield "label", m.group(1) if m.group(2) else "~" + m.group(1), i + m.end()
            i += m.end()
        else:
            m = re.match(r"`?[\w.']+", src[i:])
            if not m:
                return
            yield "word", m.group(0), i + m.end()
            i += m.end()


def ocaml_string(text):
    """Concatenates the string literals of `"a" ^ "b"` (possibly parenthesized)."""
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', text, re.S)
    s = "".join(parts)
    s = re.sub(r"\\\n\s*", "", s)  # OCaml line continuation
    return s.encode().decode("unicode_escape").encode("latin-1").decode("utf-8")


def tex_to_text(s):
    """Turns the TeX in unison's full docs into readable plain text."""
    s = re.sub(r"\\verb(.)(.*?)\1", r"\2", s)
    s = re.sub(r"\\sectionref\{[^}]*\}\{([^}]*)\}", r"the manual's \1 section", s)
    s = re.sub(r"\\(?:texttt|emph|ARG)\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\\(?:texttt|emph)\{([^{}]*)\}", r"\1", s)  # nested once
    s = re.sub(r"\{\\(?:tt|em)\s+([^{}]*)\}", r"\1", s)
    s = re.sub(r"\$(-?[\w]+)\$", r"\1", s)  # math like $0o1777$, not $VERSION
    s = s.replace("\\par", "\n\n").replace("---", "—")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def default_value(kind, text):
    if kind in ("bool",):
        return text == "true"
    if kind == "int":
        # e.g. "(0o777 (* rwxrwxrwx *) + 0o1000 (* Sticky bit *))" or "(-1)"
        expr = re.sub(r"\(\*.*?\*\)", "", text).strip().removeprefix("(").removesuffix(")")
        try:
            return sum(int(term.replace(" ", ""), 0) for term in expr.split("+"))
        except ValueError:
            return None
    if kind in ("string",):
        return ocaml_string(text) if text.startswith(('"', "(")) else None
    return None


def main(src_dir):
    root = pathlib.Path(src_dir)
    sources = {
        p: p.read_text(errors="replace").replace("Uutil.myName", '"unison"')
        for p in root.rglob("*.ml")
    }
    consts = {}
    for text in sources.values():
        for m in re.finditer(r'let\s+(\w+)\s*=\s*"([^"]*)"', text):
            consts.setdefault(m.group(1), m.group(2))

    prefs = {}
    for path, src in sorted(sources.items()):
        for m in CALL.finditer(src):
            if src[m.end() : m.end() + 1] not in " \n":
                continue
            kind = "pattern" if m.group(1) == "Pred.create" else KINDS[m.group(2)]
            toks = tokens(src, m.end())
            try:
                first = next(toks)
            except StopIteration:
                continue
            name = ocaml_string(first[1]) if first[0] == "str" else consts.get(first[1])
            if not name or name in DIRECTIVES or (first[0] == "word" and first[1] == "name"):
                continue  # directives, and the generic definitions themselves

            info = {"name": name, "kind": kind, "category": None, "cliOnly": False, "deprecated": False}
            wanted = list(POSITIONAL[kind])
            pending_label = None
            for tok_kind, text, _ in toks:
                if pending_label:
                    if pending_label == "category":
                        info["category"] = re.sub(r"[()`]", "", text).split()
                    elif pending_label in ("cli_only", "deprecated"):
                        info["cliOnly" if pending_label == "cli_only" else "deprecated"] = text == "true"
                    pending_label = None
                    continue
                if tok_kind == "label":
                    pending_label = None if text.startswith("~") else text
                    continue
                if not wanted:
                    break
                slot = wanted.pop(0)
                if slot == "default":
                    info["default"] = default_value(kind, text)
                elif slot == "doc":
                    info["doc"] = ocaml_string(text)
                elif slot == "fulldoc":
                    info["help"] = tex_to_text(ocaml_string(text))
                if not wanted:
                    break
            if kind == "pattern":
                info["doc"] = f"add a pattern to the {name} list"
            if kind == "bool" and info.get("default"):
                info["doc"] += " (default true)"
            info["source"] = str(path.relative_to(root))
            prefs[name] = info

    # Aliases: alternative names unison also accepts, e.g. "mirror" for "backup"
    variables = {}
    for src in sources.values():
        for m in re.finditer(r"let\s+(\w+)\s*=\s*(?:Prefs\.create\w*|Pred\.create)\s+\"([^\"]+)\"", src):
            variables[m.group(1)] = m.group(2)
    aliases = {}
    for src in sources.values():
        for m in re.finditer(r"(?:Prefs|Pred)\.alias\s+(\w+)\s+\"([^\"]+)\"", src):
            target = variables.get(m.group(1))
            if target and target != m.group(2):
                aliases[m.group(2)] = target
    removed = sorted(
        {m.group(1) for src in sources.values() for m in re.finditer(r'Prefs\.markRemoved\s+"([^"]+)"', src)}
    )

    json.dump({"prefs": sorted(prefs.values(), key=lambda p: p["name"]), "aliases": aliases, "removed": removed},
              sys.stdout, indent=1, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main(sys.argv[1])
