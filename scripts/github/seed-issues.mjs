#!/usr/bin/env node
/**
 * Seeds GitHub from ROADMAP.md:
 *   - labels (module:*, type:*), milestones (Stage 1..4)
 *   - epic issues and feature issues (features linked to epics as sub-issues)
 *   - "blocked by" issue dependencies from the "Depends on" column (best effort)
 *   - a GitHub Project (v2) with Module / Level fields, every issue added to it
 *   - writes issue links back into ROADMAP.md
 *
 * Idempotent: issues are matched by the ID prefix in their title ("INV-01: ..."),
 * so re-running only creates what is missing.
 *
 * Requires: `gh` CLI authenticated with scopes `repo` and `project`.
 * Usage:    node scripts/github/seed-issues.mjs <owner>/<repo> [project title]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [repoArg, projectTitle = 'Flower Network'] = process.argv.slice(2);
if (!repoArg || !repoArg.includes('/')) {
  console.error('Usage: node scripts/github/seed-issues.mjs <owner>/<repo> [project title]');
  process.exit(1);
}
const [OWNER, REPO] = repoArg.split('/');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROADMAP_PATH = path.join(ROOT, 'ROADMAP.md');

/** Delay between write requests to stay under GitHub secondary rate limits. */
const WRITE_DELAY_MS = 1000;

const MODULES = {
  PLT: { name: 'platform', color: '6b7280' },
  IAM: { name: 'identity', color: '7c3aed' },
  LOC: { name: 'locations', color: '0891b2' },
  CAT: { name: 'catalog', color: '2563eb' },
  PRC: { name: 'procurement', color: '0d9488' },
  INV: { name: 'inventory', color: '16a34a' },
  ADM: { name: 'admin-ui', color: '4b5563' },
  STF: { name: 'storefront', color: 'db2777' },
  CRT: { name: 'cart', color: 'ea580c' },
  ORD: { name: 'orders', color: 'dc2626' },
  PAY: { name: 'payments', color: 'ca8a04' },
  FUL: { name: 'fulfillment', color: '9333ea' },
  NTF: { name: 'notifications', color: '0284c7' },
  POS: { name: 'pos', color: 'be123c' },
  FSC: { name: 'fiscal', color: '78716c' },
  ANL: { name: 'analytics', color: '4f46e5' },
};

// ---------------------------------------------------------------------------
// gh helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Calls `gh api`. `body` is sent as JSON on stdin. Returns parsed JSON (or null). */
function api(method, endpoint, body, { paginate = false } = {}) {
  const args = ['api', endpoint, '--method', method];
  if (paginate) args.push('--paginate', '--slurp');
  if (body !== undefined) args.push('--input', '-');
  const out = execFileSync('gh', args, {
    input: body !== undefined ? JSON.stringify(body) : undefined,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (method !== 'GET') sleep(WRITE_DELAY_MS);
  return out.trim() ? JSON.parse(out) : null;
}

function graphql(query, variables = {}) {
  const res = api('POST', 'graphql', { query, variables });
  if (res.errors?.length) throw new Error(JSON.stringify(res.errors));
  return res.data;
}

function errorText(err) {
  return String(err.stderr || err.message || err);
}

// ---------------------------------------------------------------------------
// ROADMAP.md parsing
// ---------------------------------------------------------------------------

function parseRoadmap(md) {
  const stages = {};
  for (const m of md.matchAll(/subgraph S(\d)\["Stage \d · (.+?)"\]/g)) {
    stages[m[1]] = m[2];
  }

  const epics = [];
  for (const m of md.matchAll(/^\s*(E_([A-Z]{3})_S(\d))\["[A-Z]{3} · (.+?)"\]/gm)) {
    epics.push({ id: m[1], module: m[2], stage: m[3], title: m[4] });
  }

  const features = [];
  const rowRe = /^\| ([A-Z]{3}-\d{2}) \| (E_[A-Z]{3}_S\d) \| (.+?) \| (.+?) \| (\w+) \| .*\|$/gm;
  for (const m of md.matchAll(rowRe)) {
    features.push({
      id: m[1],
      epic: m[2],
      module: m[1].slice(0, 3),
      stage: m[2].slice(-1),
      title: m[3],
      deps: expandDeps(m[4]),
      status: m[5],
    });
  }
  return { stages, epics, features };
}

/** "CAT-01…CAT-06, PLT-06" -> ["CAT-01", ..., "CAT-06", "PLT-06"]; "—" -> []. */
function expandDeps(cell) {
  const deps = [];
  for (const part of cell.split(',').map((s) => s.trim())) {
    const range = part.match(/^([A-Z]{3})-(\d{2})…[A-Z]{3}-(\d{2})$/);
    if (range) {
      for (let n = Number(range[2]); n <= Number(range[3]); n++) {
        deps.push(`${range[1]}-${String(n).padStart(2, '0')}`);
      }
    } else if (/^[A-Z]{3}-\d{2}$/.test(part)) {
      deps.push(part);
    }
  }
  return deps;
}

/** Orders features so that every dependency is created before its dependents. */
function topoSort(features) {
  const byId = new Map(features.map((f) => [f.id, f]));
  const result = [];
  const state = new Map();
  const visit = (f) => {
    if (state.get(f.id) === 'done') return;
    if (state.get(f.id) === 'visiting') throw new Error(`Dependency cycle at ${f.id}`);
    state.set(f.id, 'visiting');
    for (const d of f.deps) {
      if (!byId.has(d)) throw new Error(`${f.id} depends on unknown feature ${d}`);
      visit(byId.get(d));
    }
    state.set(f.id, 'done');
    result.push(f);
  };
  features.forEach(visit);
  return result;
}

// ---------------------------------------------------------------------------
// Seeding steps
// ---------------------------------------------------------------------------

function ensureLabels() {
  const labels = [
    { name: 'type:epic', color: '1f2937', description: 'Epic: module scope within one stage' },
    { name: 'type:feature', color: 'd1d5db', description: 'Feature from the ROADMAP registry' },
    ...Object.entries(MODULES).map(([code, m]) => ({
      name: `module:${m.name}`,
      color: m.color,
      description: `Module ${m.name} (${code})`,
    })),
  ];
  const existing = new Set(
    api('GET', `repos/${OWNER}/${REPO}/labels?per_page=100`, undefined, { paginate: true })
      .flat()
      .map((l) => l.name),
  );
  for (const l of labels) {
    if (existing.has(l.name)) continue;
    api('POST', `repos/${OWNER}/${REPO}/labels`, l);
    console.log(`label   + ${l.name}`);
  }
}

function ensureMilestones(stages) {
  const existing = api('GET', `repos/${OWNER}/${REPO}/milestones?state=all&per_page=100`, undefined, {
    paginate: true,
  }).flat();
  const numbers = {};
  for (const [n, name] of Object.entries(stages)) {
    const title = `Stage ${n}`;
    let ms = existing.find((m) => m.title === title);
    if (!ms) {
      ms = api('POST', `repos/${OWNER}/${REPO}/milestones`, { title, description: name });
      console.log(`mstone  + ${title}`);
    }
    numbers[n] = ms.number;
  }
  return numbers;
}

function loadExistingIssues() {
  const all = api('GET', `repos/${OWNER}/${REPO}/issues?state=all&per_page=100`, undefined, {
    paginate: true,
  })
    .flat()
    .filter((i) => !i.pull_request);
  const byKey = new Map();
  for (const i of all) {
    const key = i.title.split(':')[0].trim();
    byKey.set(key, i);
  }
  return byKey;
}

function issueRef(issue) {
  return `#${issue.number}`;
}

function createEpics(epics, stages, milestones, existing) {
  const result = new Map();
  for (const e of epics) {
    let issue = existing.get(e.id);
    if (!issue) {
      issue = api('POST', `repos/${OWNER}/${REPO}/issues`, {
        title: `${e.id}: ${e.title} (Stage ${e.stage})`,
        body: [
          `**Epic** · module \`${MODULES[e.module].name}\` · Stage ${e.stage} — ${stages[e.stage]}`,
          '',
          'Features of this epic are tracked as sub-issues.',
          '',
          'Source: [ROADMAP.md](../blob/main/ROADMAP.md), [init.md](../blob/main/init.md)',
        ].join('\n'),
        labels: ['type:epic', `module:${MODULES[e.module].name}`],
        milestone: milestones[e.stage],
      });
      console.log(`epic    + ${e.id} -> #${issue.number}`);
    }
    result.set(e.id, issue);
  }
  return result;
}

function createFeatures(features, stages, milestones, epicIssues, existing) {
  const result = new Map();
  for (const f of topoSort(features)) {
    let issue = existing.get(f.id);
    if (!issue) {
      const depsLine = f.deps.length
        ? f.deps.map((d) => `${d} (${issueRef(result.get(d))})`).join(', ')
        : '—';
      issue = api('POST', `repos/${OWNER}/${REPO}/issues`, {
        title: `${f.id}: ${f.title}`,
        body: [
          `**Feature ${f.id}** · module \`${MODULES[f.module].name}\` · Stage ${f.stage} — ${stages[f.stage]}`,
          '',
          `Epic: ${f.epic} (${issueRef(epicIssues.get(f.epic))})`,
          `Depends on: ${depsLine}`,
          '',
          'Spec: [init.md](../blob/main/init.md) · Registry: [ROADMAP.md](../blob/main/ROADMAP.md)',
        ].join('\n'),
        labels: ['type:feature', `module:${MODULES[f.module].name}`],
        milestone: milestones[f.stage],
      });
      console.log(`feature + ${f.id} -> #${issue.number}`);
    }
    result.set(f.id, issue);
  }
  return result;
}

function linkSubIssues(features, epicIssues, featureIssues) {
  for (const f of features) {
    const epic = epicIssues.get(f.epic);
    const child = featureIssues.get(f.id);
    try {
      api('POST', `repos/${OWNER}/${REPO}/issues/${epic.number}/sub_issues`, { sub_issue_id: child.id });
      console.log(`sub     + ${f.epic} <- ${f.id}`);
    } catch (err) {
      const text = errorText(err);
      if (!/already|duplicate|422/i.test(text)) console.warn(`sub     ! ${f.id}: ${text.trim()}`);
    }
  }
}

function linkDependencies(features, featureIssues) {
  for (const f of features) {
    const issue = featureIssues.get(f.id);
    for (const d of f.deps) {
      try {
        api('POST', `repos/${OWNER}/${REPO}/issues/${issue.number}/dependencies/blocked_by`, {
          issue_id: featureIssues.get(d).id,
        });
        console.log(`dep     + ${f.id} blocked by ${d}`);
      } catch (err) {
        const text = errorText(err);
        if (/404|Not Found/i.test(text)) {
          console.warn('dep     ! issue dependencies API unavailable, skipping (deps stay in issue bodies)');
          return;
        }
        if (!/already|422/i.test(text)) console.warn(`dep     ! ${f.id} <- ${d}: ${text.trim()}`);
      }
    }
  }
}

function ensureProject(allIssues) {
  const repoNodeId = api('GET', `repos/${OWNER}/${REPO}`).node_id;
  const { user } = graphql(
    `query($login: String!) { user(login: $login) { id projectsV2(first: 100) { nodes { id number title url } } } }`,
    { login: OWNER },
  );

  let project = user.projectsV2.nodes.find((p) => p.title === projectTitle);
  if (!project) {
    project = graphql(
      `mutation($owner: ID!, $title: String!, $repo: ID!) {
         createProjectV2(input: { ownerId: $owner, title: $title, repositoryId: $repo }) {
           projectV2 { id number title url }
         }
       }`,
      { owner: user.id, title: projectTitle, repo: repoNodeId },
    ).createProjectV2.projectV2;
    console.log(`project + ${project.url}`);
  }

  const fieldsQuery = `query($id: ID!) { node(id: $id) { ... on ProjectV2 { fields(first: 50) { nodes {
      ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }`;
  const loadFields = () =>
    graphql(fieldsQuery, { id: project.id }).node.fields.nodes.filter((n) => n && n.name);

  const wanted = {
    Module: Object.values(MODULES).map((m) => m.name),
    Level: ['Epic', 'Feature'],
  };
  let fields = loadFields();
  for (const [name, options] of Object.entries(wanted)) {
    if (fields.some((f) => f.name === name)) continue;
    graphql(
      `mutation($project: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
         createProjectV2Field(input: { projectId: $project, dataType: SINGLE_SELECT, name: $name, singleSelectOptions: $options }) {
           projectV2Field { ... on ProjectV2SingleSelectField { id } }
         }
       }`,
      {
        project: project.id,
        name,
        options: options.map((o) => ({ name: o, color: 'GRAY', description: '' })),
      },
    );
    console.log(`field   + ${name}`);
  }
  fields = loadFields();

  const field = (name) => {
    const f = fields.find((x) => x.name === name);
    if (!f) throw new Error(`Project field "${name}" not found`);
    return f;
  };
  const option = (fieldName, optionName) => {
    const o = field(fieldName).options.find((x) => x.name === optionName);
    if (!o) throw new Error(`Option "${optionName}" not found in field "${fieldName}"`);
    return o.id;
  };

  for (const { issue, module, type } of allIssues) {
    const itemId = graphql(
      `mutation($project: ID!, $content: ID!) {
         addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
       }`,
      { project: project.id, content: issue.node_id },
    ).addProjectV2ItemById.item.id;

    graphql(
      `mutation($p: ID!, $i: ID!, $sf: ID!, $so: String!, $mf: ID!, $mo: String!, $tf: ID!, $to: String!) {
         s: updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $sf, value: { singleSelectOptionId: $so } }) { clientMutationId }
         m: updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $mf, value: { singleSelectOptionId: $mo } }) { clientMutationId }
         t: updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $tf, value: { singleSelectOptionId: $to } }) { clientMutationId }
       }`,
      {
        p: project.id,
        i: itemId,
        sf: field('Status').id,
        so: option('Status', 'Todo'),
        mf: field('Module').id,
        mo: option('Module', MODULES[module].name),
        tf: field('Level').id,
        to: option('Level', type),
      },
    );
    console.log(`item    + #${issue.number}`);
  }
  return project;
}

function writeBackLinks(md, epics, epicIssues, featureIssues) {
  let out = md;
  for (const [id, issue] of featureIssues) {
    const lineRe = new RegExp(`^(\\| ${id} \\|.*\\| \\w+ )\\|[^|]*\\|$`, 'm');
    out = out.replace(lineRe, `$1| [#${issue.number}](${issue.html_url}) |`);
  }
  const table = [
    '| Epic | Title | Issue |',
    '|---|---|---|',
    ...epics.map((e) => {
      const i = epicIssues.get(e.id);
      return `| ${e.id} | ${e.title} | [#${i.number}](${i.html_url}) |`;
    }),
  ].join('\n');
  out = out.replace(/(<!-- epics:start -->)[\s\S]*?(<!-- epics:end -->)/, `$1\n${table}\n$2`);
  return out;
}

// ---------------------------------------------------------------------------

const md = readFileSync(ROADMAP_PATH, 'utf8');
const { stages, epics, features } = parseRoadmap(md);
console.log(`parsed: ${Object.keys(stages).length} stages, ${epics.length} epics, ${features.length} features`);

const epicIds = new Set(epics.map((e) => e.id));
for (const f of features) {
  if (!epicIds.has(f.epic)) throw new Error(`${f.id} references unknown epic ${f.epic}`);
  if (!MODULES[f.module]) throw new Error(`${f.id} has unknown module ${f.module}`);
}
topoSort(features);
if (process.env.DRY_RUN) {
  console.log('DRY_RUN set: parsing and validation passed, nothing was written');
  process.exit(0);
}

ensureLabels();
const milestones = ensureMilestones(stages);
const existing = loadExistingIssues();
const epicIssues = createEpics(epics, stages, milestones, existing);
const featureIssues = createFeatures(features, stages, milestones, epicIssues, existing);
linkSubIssues(features, epicIssues, featureIssues);
linkDependencies(features, featureIssues);

writeFileSync(ROADMAP_PATH, writeBackLinks(md, epics, epicIssues, featureIssues));
console.log('ROADMAP.md updated with issue links');

const project = ensureProject([
  ...epics.map((e) => ({ issue: epicIssues.get(e.id), module: e.module, type: 'Epic' })),
  ...features.map((f) => ({ issue: featureIssues.get(f.id), module: f.module, type: 'Feature' })),
]);
console.log(`done: ${project.url}`);
