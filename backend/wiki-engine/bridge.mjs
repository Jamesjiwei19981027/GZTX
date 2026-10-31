// Host adapter. The imported engine files are unmodified Microsoft MIT sources.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePage } from './dist/wiki.js';
import { writeIndex, readIndex } from './dist/index-ops.js';
import { queryWiki } from './dist/query.js';
import { lintWiki } from './dist/lint.js';
import matter from 'gray-matter';
import yaml from 'js-yaml';

// gray-matter's default engine uses the removed safeLoad/safeDump API. Supply
// the maintained YAML 4 API without modifying the vendored core.
matter.engines.yaml = { parse: yaml.load, stringify: yaml.dump };

let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const root = await mkdtemp(join(tmpdir(), 'worktodo-wiki-'));
try {
  const entries = [];
  for (const page of request.pages) {
    if (!Number.isSafeInteger(page.id) || page.id < 1) throw new Error('Invalid page identity');
    const path = `concepts/entry-${page.id}.md`;
    await writePage(join(root, 'wiki', path), {
      frontmatter: { type: 'concept', title: page.title }, body: page.body_text || '',
    });
    // Upstream query first filters index entries. Include body text so Chinese
    // terms appearing only in the body remain searchable without embeddings.
    entries.push({ path, title: page.title.replace(/[\r\n]/g, ' '),
      summary: (page.body_text || '').replace(/\s+/g, ' '), category: 'Project', tags: [] });
  }
  await writeIndex(join(root, 'wiki', 'index.md'), entries);
  const index = await readIndex(join(root, 'wiki', 'index.md'));
  const search = request.query ? await queryWiki(request.query, root, false) : { results: [] };
  const lint = await lintWiki(root);
  const matches = search.results.map(row => ({ ...row, id: Number(/entry-(\d+)\.md$/.exec(row.path)[1]) }));
  process.stdout.write(JSON.stringify({ engine: 'microsoft/llmwiki', index, matches, lint }));
} finally {
  await rm(root, { recursive: true, force: true });
}
