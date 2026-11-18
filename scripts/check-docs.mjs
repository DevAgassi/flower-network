#!/usr/bin/env node
// Checks the project documentation (run by `pnpm docs:check` and CI):
// - every relative link in CLAUDE.md, README.md and docs/ points to an
//   existing file, and every #anchor to an existing heading;
// - every document in docs/ (except _templates/) has the frontmatter fields
//   described in docs/README.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const FRONTMATTER_FIELDS = ['title', 'module', 'kind', 'audience'];
const KINDS = new Set(['overview', 'reference', 'guide', 'journal', 'process']);

/** Repository-relative path with forward slashes, for messages and matching. */
function display(file) {
  return relative(ROOT, file).split(sep).join('/');
}

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

/** GitHub's heading anchor: lowercase, punctuation removed, spaces → hyphens. */
function anchorOf(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*]/g, '')
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .replaceAll(' ', '-');
}

const anchorCache = new Map();
function anchorsOf(file) {
  if (!anchorCache.has(file)) {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) =>
      anchorOf(m[1]),
    );
    anchorCache.set(file, new Set(headings));
  }
  return anchorCache.get(file);
}

const problems = [];
const docs = markdownFiles(join(ROOT, 'docs')).filter(
  (file) => !display(file).split('/').includes('_templates'),
);
const files = [join(ROOT, 'CLAUDE.md'), join(ROOT, 'README.md'), ...docs];

for (const file of files) {
  const name = display(file);
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue; // http:, https:, mailto:
    const [path, anchor] = target.split('#');
    const resolved = path
      ? normalize(join(dirname(file), decodeURI(path)))
      : file;
    if (!existsSync(resolved)) {
      problems.push(`${name}: broken link ${target}`);
    } else if (
      anchor &&
      resolved.endsWith('.md') &&
      !anchorsOf(resolved).has(anchor)
    ) {
      problems.push(`${name}: no heading for #${anchor} in ${target}`);
    }
  }
}

for (const file of docs) {
  const name = display(file);
  const match = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    problems.push(`${name}: no frontmatter`);
    continue;
  }
  const fields = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const i = line.indexOf(':');
      return [
        line.slice(0, i).trim(),
        line
          .slice(i + 1)
          .replace(/#.*$/, '')
          .trim(),
      ];
    }),
  );
  for (const field of FRONTMATTER_FIELDS) {
    if (!fields[field]) problems.push(`${name}: frontmatter has no "${field}"`);
  }
  if (fields.kind && !KINDS.has(fields.kind)) {
    problems.push(`${name}: unknown kind "${fields.kind}"`);
  }
  if (fields.audience && !/^\[.+\]$/.test(fields.audience)) {
    problems.push(`${name}: audience must be a list, e.g. [developer]`);
  }
}

if (problems.length > 0) {
  console.error(
    `Documentation problems (${problems.length}):\n  - ${problems.join('\n  - ')}`,
  );
  process.exit(1);
}
console.log(
  `Documentation OK: ${files.length} files, ${docs.length} with frontmatter.`,
);
