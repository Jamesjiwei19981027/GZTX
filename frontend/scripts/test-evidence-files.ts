import assert from 'node:assert/strict';
import { inferEvidenceKind } from '../src/utils/evidenceFiles';

assert.equal(inferEvidenceKind([{ name: '评审.PDF', type: 'application/pdf' }]), 'document');
assert.equal(inferEvidenceKind([{ name: '原型.fig' }]), 'figma');
assert.equal(inferEvidenceKind([{ name: 'main.ts' }, { name: 'styles.css' }]), 'commit');
assert.equal(inferEvidenceKind([{ name: 'server.log' }]), 'log');
assert.equal(inferEvidenceKind([{ name: '截图.png', type: 'image/png' }]), 'delivery');
assert.equal(inferEvidenceKind([{ name: '评审.pdf' }, { name: '截图.png' }]), 'delivery');
assert.equal(inferEvidenceKind([]), 'document');
console.log('Evidence types inferred from uploaded files: passed');
