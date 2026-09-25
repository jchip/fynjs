/**
 * Identify, deduplicate and combine third-party copyright notices.
 *
 * ESM, TypeScript. See index.ts for this module's own reasoning.
 *
 * A production install is the same handful of licenses repeated: dozens of MIT
 * texts differing only in whose copyright sits above them and whether the title
 * reads "MIT License" or "The MIT License (MIT)". Deduplicating on the exact
 * bytes therefore barely dedups at all, so this recognises the license and
 * merges every package that ships the same terms.
 *
 * What must survive that merge is the *attribution* — MIT, BSD and Apache all
 * require the copyright notice to travel with redistributed code, and shipping
 * a container image is redistribution. So each file is split at the point its
 * license text begins: everything above is that package's attribution and is
 * listed against it in the heading, and the terms below are written once
 * underneath. Nothing is dropped; it is only laid out differently.
 *
 * Splitting there rather than on a copyright regex is deliberate. Packages
 * write attribution in forms no regex catches — "Port to TypeScript Copyright
 * Isaac Z. Schlueter", "The Fastify team members are listed at ..." — and those
 * lines are notices too. Everything above the terms is kept, minus lines that
 * are only a title.
 */

export interface LicenseEntry {
  package: string;
  file: string;
  text: string;
}

export interface DetectedLicense {
  id: string;
  name: string;
  phrase: string;
}

export interface SplitLicense {
  attribution: string[];
  terms: string;
}

export interface CombinedLicenses {
  content: string;
  licenses: number;
  packages: number;
}

/**
 * Recognisable licenses, most specific first, matched against the text with its
 * case and whitespace normalised. Each phrase is both the fingerprint of the
 * license and the point its terms begin, so it must be the opening words of the
 * license proper and cannot be wording another license shares.
 */
const SIGNATURES: {
  id: string;
  name: string;
  phrase: string;
  refine?: (flat: string) => { id: string; name: string } | null;
}[] = [
  { id: "Apache-2.0", name: "Apache License, Version 2.0", phrase: "apache license version 2.0 january 2004" },
  { id: "MPL-2.0", name: "Mozilla Public License, Version 2.0", phrase: "mozilla public license version 2.0" },
  { id: "CC0-1.0", name: "Creative Commons Zero, Version 1.0 Universal", phrase: "cc0 1.0 universal" },
  { id: "BlueOak-1.0.0", name: "Blue Oak Model License, Version 1.0.0", phrase: "blue oak model license version 1.0.0" },
  { id: "Unlicense", name: "The Unlicense", phrase: "this is free and unencumbered software released into the public domain" },
  { id: "Python-2.0", name: "Python Software Foundation License, Version 2", phrase: "python software foundation license version 2" },
  { id: "ISC", name: "ISC License", phrase: "permission to use copy modify and/or distribute this software for any purpose with or without fee is hereby granted provided that the above copyright notice" },
  { id: "0BSD", name: "BSD Zero Clause License", phrase: "permission to use copy modify and/or distribute this software for any purpose with or without fee is hereby granted" },
  { id: "MIT", name: "MIT License", phrase: "permission is hereby granted free of charge to any person obtaining a copy" },
  {
    // The BSD family shares an opening; only the attribution clause separates
    // the three-clause form from the two-clause one.
    id: "BSD-2-Clause",
    name: "BSD 2-Clause License",
    phrase: "redistribution and use in source and binary forms",
    refine: (flat: string) =>
      flat.includes("neither the name")
        ? { id: "BSD-3-Clause", name: "BSD 3-Clause License" }
        : null
  }
];

/** Words a line may consist of and still be only a title, not attribution. */
const TITLE_WORDS = new Set(
  ("the mit isc bsd apache mozilla blue oak model unlicense python software foundation " +
    "public license licence clause zero universal version cc0 0 1 2 3 1.0.0 2.0 v2 " +
    "creative commons")
    .split(" ")
);

/**
 * Reduce a text to what it actually says, so wording can be compared without
 * layout getting in the way.
 *
 * Every run of anything that is not a letter, digit, `/` or `.` collapses to a
 * single space, which takes care of line wrapping and of the packages that
 * indent every line of their license. Trailing punctuation then goes too:
 * DefinitelyTyped ends its MIT with "SOFTWARE" where everyone else writes
 * "SOFTWARE.", and a full stop is not a difference in terms.
 *
 * `.` and `/` survive mid-string because the signature phrases need them —
 * "version 2.0 january 2004", "cc0 1.0 universal", "and/or distribute".
 */
export const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9/.]+/g, " ")
    .trim()
    .replace(/[./]+$/, "");

/**
 * @param text license file contents
 */
export function detectLicense(text: string): DetectedLicense {
  const flat = normalise(text);
  for (const signature of SIGNATURES) {
    if (!flat.includes(signature.phrase)) {
      continue;
    }
    const refined = signature.refine?.(flat);
    return {
      id: refined?.id ?? signature.id,
      name: refined?.name ?? signature.name,
      phrase: signature.phrase
    };
  }
  return { id: "", name: "", phrase: "" };
}

const isTitleOnly = (line: string): boolean => {
  const words = normalise(line).split(" ").filter(Boolean);
  return words.length > 0 && words.every(word => TITLE_WORDS.has(word));
};

/**
 * Split a license file into the package's own attribution and the license terms.
 *
 * @param text
 * @param phrase opening words of the terms, normalised; `""` when the license
 *   was not recognised, in which case the whole text is the terms
 */
export function splitAtTerms(text: string, phrase: string): SplitLicense {
  const lines = text.split("\n");
  let start = 0;
  if (phrase) {
    start = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (normalise(lines.slice(i).join("\n")).startsWith(phrase)) {
        start = i;
        break;
      }
    }
    if (start === lines.length) {
      start = 0; // phrase did not begin a line; keep the text whole
    }
  }
  const attribution = lines
    .slice(0, start)
    .map(line => line.trim().replace(/\s+/g, " "))
    .filter(line => line && !isTitleOnly(line));
  return { attribution, terms: lines.slice(start).join("\n").trim() };
}

/**
 * Merge collected notices into the contents of a single file.
 *
 * Everything is done from what the caller already read; nothing is re-read from
 * disk. Output is fully sorted, so identical input always produces identical
 * bytes and the image layer stays reproducible.
 *
 * @param entries
 */
export function combineLicenses(entries: LicenseEntry[]): CombinedLicenses {
  const groups = new Map<
    string,
    { license: DetectedLicense; terms: string; packages: Map<string, Set<string>> }
  >();

  for (const entry of entries) {
    const text = entry.text.trim();
    if (!text) {
      continue;
    }
    const isNotice = /^notice/i.test(entry.file);
    const license: DetectedLicense = isNotice
      ? { id: "NOTICE", name: "Attribution notice", phrase: "" }
      : detectLicense(text);
    const { attribution, terms } = splitAtTerms(text, license.phrase);

    // Unrecognised text groups on its own whole wording, so a license this does
    // not know is emitted verbatim rather than folded into another.
    const key = `${license.id}\u0000${normalise(terms)}`;
    if (!groups.has(key)) {
      groups.set(key, { license, terms, packages: new Map() });
    }
    const group = groups.get(key)!;
    const notices = group.packages.get(entry.package) ?? new Set<string>();
    for (const line of attribution) {
      notices.add(line);
    }
    group.packages.set(entry.package, notices);
  }

  const collected = [...groups.values()]
    .map(group => ({
      ...group,
      packages: [...group.packages]
        .map(([name, notices]) => ({ name, notices: [...notices] }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort(
      (a, b) => b.packages.length - a.packages.length || a.license.id.localeCompare(b.license.id)
    );

  const packages = new Set<string>();
  for (const group of collected) {
    for (const entry of group.packages) {
      packages.add(entry.name);
    }
  }

  const out = [
    "Third-party license and copyright notices",
    "=========================================",
    "",
    `${packages.size} packages installed under this directory ship a license or notice file.`,
    `They use ${collected.length} distinct ${collected.length === 1 ? "set of terms" : "sets of terms"}, reproduced once each below, with the`,
    "packages that use them, and their copyright notices, listed above each.",
    ""
  ];

  for (const group of collected) {
    out.push(
      RULE,
      group.license.id ? `${group.license.name}  (${group.license.id})` : "Unrecognised license",
      "-".repeat(RULE.length),
      ""
    );
    for (const entry of group.packages) {
      out.push(entry.name);
      for (const notice of entry.notices) {
        out.push(`    ${notice}`);
      }
    }
    out.push("", RULE, "", group.terms, "", "");
  }

  return { content: out.join("\n"), licenses: collected.length, packages: packages.size };
}

const RULE = "=".repeat(78);
