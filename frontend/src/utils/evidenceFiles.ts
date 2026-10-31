/** A package with mixed file formats is a delivery; no manual category is needed. */
export function inferEvidenceKind(files: Array<{ name: string; type?: string }>): 'document' | 'figma' | 'commit' | 'log' | 'delivery' {
  const kinds = files.map((file) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (extension === 'fig' || extension === 'sketch') return 'figma';
    if (extension === 'log') return 'log';
    if (/^(ts|tsx|js|jsx|py|java|go|rs|c|cpp|h|css|html|sql|patch|diff)$/.test(extension)) return 'commit';
    if (/^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|rtf|odt)$/.test(extension) || file.type?.startsWith('text/')) return 'document';
    return 'delivery';
  });
  return kinds.length && kinds.every((kind) => kind === kinds[0]) ? kinds[0] : kinds.length ? 'delivery' : 'document';
}
