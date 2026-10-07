// Builds fynjs.pages.dev into site-pub/ at the repo root: landing page, llms.txt, llms-full.txt,
// one reference per package copied from packages/<dir>/docs/reference.md, TypeDoc HTML under
// api/, and robots.txt with a sitemap.xml.
// TypeDoc reads each package's types, so the monorepo must be bootstrapped first.
import Fs from "node:fs";
import Path from "node:path";
import { Application } from "typedoc";

const SITE_URL = "https://fynjs.pages.dev";
const SITE = import.meta.dirname;
const PACKAGES = Path.join(SITE, "..", "packages");
const OUT = Path.join(SITE, "..", "site-pub");

// Every published package must be in exactly one group, so a new package can't go missing.
const GROUPS = {
  Tools: ["fyn", "fynpo", "fynpo-base", "fynpo-cli", "xarc-run"],
  CLI: ["cli-args", "chalker", "visual-logger", "visual-exec", "xsh", "unwrap-npm-cmd"],
  Async: ["aveazul", "xaa", "item-queue", "xflight"],
  "I/O": ["fetch", "filter-scan-dir", "munchy", "reflink"],
  Packaging: ["publish-util", "pkg-preper", "check-pkg-new-version", "check-pkg-new-version-engine"],
  Misc: ["error", "optional-import", "run-verify", "string-array", "ts-resolve", "xenv-config"]
};

const SUMMARY =
  "fyn is a fast node.js package manager. fynpo is a zero setup monorepo manager built on it. " +
  "fynjs is their monorepo, plus the small packages they are built from.";

const ABOUT = `Each package has one Markdown reference covering its full API, options and runtime
behavior. The same file ships in the npm package at \`node_modules/<name>/docs/reference.md\`
and matches the installed version.`;

const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function loadPackages() {
  const grouped = new Set(Object.values(GROUPS).flat());
  const pkgs = new Map();
  for (const dir of Fs.readdirSync(PACKAGES)) {
    const pkgFile = Path.join(PACKAGES, dir, "package.json");
    if (!Fs.existsSync(pkgFile)) continue;
    const pkg = JSON.parse(Fs.readFileSync(pkgFile, "utf8"));
    if (pkg.private) continue;
    if (!grouped.has(dir)) throw new Error(`packages/${dir} is published but not in a GROUPS entry`);
    const refFile = Path.join(PACKAGES, dir, "docs", "reference.md");
    pkgs.set(dir, {
      dir,
      name: pkg.name,
      version: pkg.version,
      description: pkg.description || "",
      types: pkg.types,
      ref: Fs.existsSync(refFile) ? Fs.readFileSync(refFile, "utf8") : undefined,
      api: undefined
    });
  }
  for (const dir of grouped) {
    if (!pkgs.has(dir)) throw new Error(`GROUPS lists ${dir}, which is not a published package`);
  }
  return pkgs;
}

// One TypeDoc run in packages mode over every published package that ships types.
async function buildApi(pkgs) {
  const typed = [...pkgs.values()].filter(p => p.types && Fs.existsSync(Path.join(PACKAGES, p.dir, p.types)));
  const app = await Application.bootstrapWithPlugins({
    options: Path.join(SITE, "typedoc.json"),
    entryPoints: typed.map(p => Path.join(PACKAGES, p.dir))
  });
  const project = await app.convert();
  if (!project) throw new Error("TypeDoc failed to convert the packages");
  await app.generateDocs(project, Path.join(OUT, "api"));
  // TypeDoc names a package's page after its npm name, with @ and / turned into _
  for (const p of typed) {
    const page = `api/modules/${p.name.replace(/[@/]/g, "_")}.html`;
    if (Fs.existsSync(Path.join(OUT, page))) p.api = page;
  }
}

// Groups in display order, holding only packages that pass the filter.
function groupsOf(pkgs, filter) {
  return Object.entries(GROUPS)
    .map(([title, dirs]) => [title, dirs.map(d => pkgs.get(d)).filter(filter)])
    .filter(([, list]) => list.length > 0);
}

function llmsTxt(groups) {
  const lines = [`# fynjs`, ``, `> ${SUMMARY}`, ``, ABOUT, ``];
  for (const [title, list] of groups) {
    lines.push(`## ${title}`, ``);
    for (const p of list) {
      lines.push(`- [${p.name}](${SITE_URL}/${p.dir}.md): ${p.description} (v${p.version})`);
    }
    lines.push(``);
  }
  lines.push(`## Optional`, ``, `- [All references in one file](${SITE_URL}/llms-full.txt)`, ``);
  return lines.join("\n");
}

function llmsFullTxt(groups) {
  const refs = groups.flatMap(([, list]) =>
    list.map(p => `<!-- ${p.name} v${p.version}: ${SITE_URL}/${p.dir}.md -->\n\n${p.ref.trim()}\n`)
  );
  return [`# fynjs`, ``, `> ${SUMMARY}`, ``, ...refs].join("\n");
}

function sitemapXml(pkgs, groups) {
  const paths = [
    "",
    "llms.txt",
    "llms-full.txt",
    ...groups.flatMap(([, list]) => list.map(p => `${p.dir}.md`)),
    ...[...pkgs.values()].filter(p => p.api).map(p => p.api)
  ];
  const urls = paths.map(p => `  <url><loc>${SITE_URL}/${p}</loc></url>`);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ``
  ].join("\n");
}

function packagesHtml(groups) {
  return groups
    .map(([title, list]) => {
      const items = list
        .map(p => {
          const links = [p.ref && `<a href="${p.dir}.md">reference</a>`, p.api && `<a href="${p.api}">API</a>`];
          return (
            `<li><a href="https://www.npmjs.com/package/${p.name}"><code>${escapeHtml(p.name)}</code></a>` +
            `<span>${escapeHtml(p.description)}</span>` +
            `<span class="links">${links.filter(Boolean).join(" · ")}</span></li>`
          );
        })
        .join("\n          ");
      return `<section class="group">\n        <h3>${title}</h3>\n        <ul>\n          ${items}\n        </ul>\n      </section>`;
    })
    .join("\n      ");
}

const pkgs = loadPackages();
const missing = [...pkgs.values()].filter(p => !p.ref).map(p => p.dir);

Fs.rmSync(OUT, { recursive: true, force: true });
Fs.mkdirSync(OUT, { recursive: true });
await buildApi(pkgs);

const groups = groupsOf(pkgs, p => p.ref);

for (const [, list] of groups) {
  for (const p of list) Fs.writeFileSync(Path.join(OUT, `${p.dir}.md`), p.ref);
}
Fs.writeFileSync(Path.join(OUT, "llms.txt"), llmsTxt(groups));
Fs.writeFileSync(Path.join(OUT, "llms-full.txt"), llmsFullTxt(groups));
Fs.writeFileSync(
  Path.join(OUT, "index.html"),
  Fs.readFileSync(Path.join(SITE, "index.html"), "utf8").replace(
    "<!-- packages -->",
    packagesHtml(groupsOf(pkgs, p => p.ref || p.api))
  )
);
Fs.writeFileSync(Path.join(OUT, "sitemap.xml"), sitemapXml(pkgs, groups));
Fs.writeFileSync(Path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
for (const file of ["_headers", "favicon.svg", "og-image.png"]) {
  Fs.copyFileSync(Path.join(SITE, file), Path.join(OUT, file));
}

const count = groups.reduce((n, [, list]) => n + list.length, 0);
const apiCount = [...pkgs.values()].filter(p => p.api).length;
console.log(`site-pub: ${count} references, ${apiCount} API pages`);
if (missing.length) console.warn(`no docs/reference.md yet: ${missing.join(", ")}`);
