import { describe, expect, it } from "vitest";
import { combineLicenses, detectLicense, normalise, splitAtTerms } from "../../../lib/prod-prune/licenses";

const MIT = `MIT License

Copyright (c) 2020 Someone

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`;

// same terms, different title wording and owner — must merge with MIT above
const MIT_VARIANT = `The MIT License (MIT)

Copyright (c) 2015-2021 Someone Else

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`;

// MIT plus an extra clause — must NOT merge
const MIT_PLUS = `${MIT}
You must also send the author a postcard.
`;

// How DefinitelyTyped ships it: every line indented, and "SOFTWARE" with no
// full stop where everyone else writes "SOFTWARE." Same terms; must merge.
const MIT_INDENTED = MIT.split("\n")
  .map(line => (line ? `    ${line}` : line))
  .join("\n")
  .trimEnd()
  .replace(/\.$/, "");

const ISC = `Copyright (c) 2019 Someone

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.
`;

const BSD3 = `Copyright (c) 2011, Someone
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
Neither the name of the copyright holder nor the names of its contributors
may be used to endorse or promote products.
`;

const BSD2 = `Copyright (c) 2011, Someone
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
Redistributions of source code must retain the above copyright notice.
`;

const APACHE = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   APPENDIX: How to apply the Apache License to your work.

      Copyright [yyyy] [name of copyright owner]
`;

describe("normalise", () => {
  it("collapses indentation and wrapping", () => {
    expect(normalise("    Foo bar\n    baz")).toBe(normalise("Foo bar baz"));
  });

  it("ignores trailing punctuation", () => {
    expect(normalise("in the software.")).toBe(normalise("in the software"));
  });

  it("keeps dots inside the text, which the signature phrases need", () => {
    expect(normalise("Version 2.0, January 2004")).toBe("version 2.0 january 2004");
    expect(normalise("copy, modify, and/or distribute")).toBe("copy modify and/or distribute");
  });
});

describe("detectLicense", () => {
  it.each([
    [MIT, "MIT"],
    [ISC, "ISC"],
    [BSD3, "BSD-3-Clause"],
    [BSD2, "BSD-2-Clause"],
    [APACHE, "Apache-2.0"]
  ])("identifies %#", (text, id) => {
    expect(detectLicense(text).id).toBe(id);
  });

  it("distinguishes ISC from 0BSD by the copyright-retention clause", () => {
    const zeroBsd = `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS".
`;
    expect(detectLicense(zeroBsd).id).toBe("0BSD");
    expect(detectLicense(ISC).id).toBe("ISC");
  });

  it("reports nothing for text it does not recognise", () => {
    expect(detectLicense("You may use this if you are nice about it.").id).toBe("");
  });
});

describe("splitAtTerms", () => {
  it("puts the copyright above the terms and drops the title", () => {
    const { attribution, terms } = splitAtTerms(MIT, detectLicense(MIT).phrase);
    expect(attribution).toEqual(["Copyright (c) 2020 Someone"]);
    expect(terms.startsWith("Permission is hereby granted")).toBe(true);
    expect(terms).not.toContain("Copyright (c) 2020");
  });

  it.each([
    ["MIT License"],
    ["The MIT License (MIT)"],
    ["BSD 2-Clause License"],
    ["Apache License Version 2.0"]
  ])("treats %s as a title, not attribution", title => {
    const { attribution } = splitAtTerms(`${title}\n\n${MIT}`, detectLicense(MIT).phrase);
    expect(attribution).toEqual(["Copyright (c) 2020 Someone"]);
  });

  it("keeps attribution that no copyright regex would catch", () => {
    const text = `MIT License

Original code Copyright Julian Gruber
Port to TypeScript Copyright Isaac Z. Schlueter
The team members are listed at https://example.test/team.

${MIT}`;
    const { attribution } = splitAtTerms(text, detectLicense(text).phrase);
    expect(attribution).toContain("Original code Copyright Julian Gruber");
    expect(attribution).toContain("Port to TypeScript Copyright Isaac Z. Schlueter");
    expect(attribution).toContain("The team members are listed at https://example.test/team.");
  });

  it("leaves an unrecognised text whole", () => {
    const text = "Use it however you like.";
    expect(splitAtTerms(text, "")).toEqual({ attribution: [], terms: text });
  });

  it("does not disturb a license whose body mentions copyright", () => {
    const { terms } = splitAtTerms(APACHE, detectLicense(APACHE).phrase);
    // the appendix placeholder is part of the license text, not an attribution
    expect(terms).toContain("Copyright [yyyy] [name of copyright owner]");
  });
});

describe("combineLicenses", () => {
  const entry = (name: string, text: string, file = "LICENSE") => ({ package: name, file, text });

  it("merges the same terms across packages and lists each one", () => {
    const { content, licenses, packages } = combineLicenses([
      entry("a@1.0.0", MIT),
      entry("b@2.0.0", MIT_VARIANT)
    ]);
    expect(licenses).toBe(1);
    expect(packages).toBe(2);
    expect(content).toContain("MIT License  (MIT)");
    expect(content).toContain("a@1.0.0");
    expect(content).toContain("b@2.0.0");
    expect(content).toContain("Copyright (c) 2020 Someone");
    expect(content).toContain("Copyright (c) 2015-2021 Someone Else");
    // the shared terms appear exactly once
    expect(content.split("Permission is hereby granted").length - 1).toBe(1);
  });

  it("merges terms that differ only in indentation and trailing punctuation", () => {
    const { licenses, content } = combineLicenses([
      entry("plain@1.0.0", MIT),
      entry("indented@1.0.0", MIT_INDENTED)
    ]);
    expect(licenses).toBe(1);
    expect(content).toContain("plain@1.0.0");
    expect(content).toContain("indented@1.0.0");
  });

  it("keeps terms apart when a package adds to them", () => {
    const { licenses, content } = combineLicenses([entry("a@1.0.0", MIT), entry("b@1.0.0", MIT_PLUS)]);
    expect(licenses).toBe(2);
    expect(content).toContain("postcard");
  });

  it("groups by license, not by package", () => {
    const { licenses } = combineLicenses([
      entry("a@1.0.0", MIT),
      entry("b@1.0.0", MIT_VARIANT),
      entry("c@1.0.0", ISC),
      entry("d@1.0.0", BSD3)
    ]);
    expect(licenses).toBe(3);
  });

  it("never merges NOTICE files into a license", () => {
    const { content, licenses } = combineLicenses([
      entry("a@1.0.0", MIT),
      entry("a@1.0.0", "Attribution required for a@1.0.0.", "NOTICE")
    ]);
    expect(licenses).toBe(2);
    expect(content).toContain("Attribution notice  (NOTICE)");
    expect(content).toContain("Attribution required for a@1.0.0.");
  });

  it("keeps an unrecognised license verbatim", () => {
    const odd = "You may use this only on Tuesdays.";
    const { content, licenses } = combineLicenses([entry("a@1.0.0", MIT), entry("b@1.0.0", odd)]);
    expect(licenses).toBe(2);
    expect(content).toContain("Unrecognised license");
    expect(content).toContain(odd);
  });

  it("produces identical bytes regardless of input order", () => {
    const entries = [entry("a@1.0.0", MIT), entry("b@1.0.0", ISC), entry("c@1.0.0", MIT_VARIANT)];
    const forwards = combineLicenses(entries).content;
    const backwards = combineLicenses([...entries].reverse()).content;
    expect(backwards).toBe(forwards);
  });

  it("ignores an empty license file", () => {
    expect(combineLicenses([entry("a@1.0.0", "   \n\n")]).licenses).toBe(0);
  });
});
