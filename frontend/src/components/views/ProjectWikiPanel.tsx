import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, FileText, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { generateWikiDraft, getProjectWiki, publishWikiDraft, type ProjectWikiCatalog, type WikiFact } from '../../api/projectWiki'
import type { Language } from '../../types'
import { AxisDialog } from './ResponsibilityWorkspace'
import './projectWiki.css'

function Facts({ facts, zh }: { facts: WikiFact[]; zh: boolean }) {
  return <ul className="project-wiki-facts">{facts.map((fact, index) => <li key={`${fact.source_id}-${index}`}>
    <p>{fact.text}</p><blockquote>{fact.quote}</blockquote>
    <small>{fact.source_name} · {zh ? `第 ${fact.line_start}–${fact.line_end} 行` : `lines ${fact.line_start}–${fact.line_end}`} · {zh ? '材料' : 'Evidence'} #{fact.package_id}</small>
  </li>)}</ul>
}

export function ProjectWikiPanel({ projectId, projectName, lang, onClose }: {
  projectId: number; projectName: string; lang: Language; onClose: () => void
}) {
  const zh = lang === 'zh'
  const [catalog, setCatalog] = useState<ProjectWikiCatalog | null>(null)
  const [material, setMaterial] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const load = useCallback(async (q = '') => {
    const data = await getProjectWiki(projectId, q)
    if (alive.current) { setCatalog(data); setMaterial(value => value || String(data.materials.find(m => m.can_generate)?.id || '')) }
  }, [projectId])
  useEffect(() => { void load().catch(err => { if (alive.current) setError(err.message) }) }, [load])
  const run = async (kind: string, action: () => Promise<unknown>, message: string) => {
    setBusy(kind); setError(''); setNotice('')
    try {
      await action()
      if (!alive.current) return
      await load(query)
      if (alive.current) setNotice(message)
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : String(err)) }
    finally { if (alive.current) setBusy(null) }
  }
  return <AxisDialog title={zh ? '项目知识' : 'Project knowledge'} onClose={onClose}>
    <section className="project-wiki-panel" aria-busy={!!busy}>
      <div className="project-wiki-heading"><BookOpen size={26} /><div><h2>{projectName} · {zh ? '项目知识' : 'Knowledge'}</h2>
        <p>{zh ? '材料有出处，知识随项目积累' : 'Source-backed knowledge, maintained as your project evolves'}</p></div></div>
      {error && <div className="project-wiki-error" role="alert">{error}<button onClick={() => void run('reload', () => load(query), '')}>{zh ? '重试加载' : 'Retry'}</button></div>}
      {notice && <p className="project-wiki-notice" role="status">{notice}</p>}
      {!catalog && !error && <p role="status">{zh ? '正在加载项目知识…' : 'Loading knowledge…'}</p>}
      {catalog && <>
        <section className="project-wiki-intake"><h3><Sparkles size={17} />{zh ? '整理项目材料' : 'Organize project evidence'}</h3>
          <p>{zh ? '读取材料正文，生成事项、风险和决策草稿。确认后合入项目知识。' : 'Read source material and propose updates to work, risks and decisions.'}</p>
          <label>{zh ? '选择材料' : 'Choose evidence'}<select value={material} disabled={!!busy} onChange={e => setMaterial(e.target.value)}>
            <option value="">{zh ? '请选择材料' : 'Choose evidence'}</option>
            {catalog.materials.filter(m => m.can_generate).map(m => <option key={m.id} value={m.id}>#{m.id} · {m.title}</option>)}
          </select></label>
          <button className="axis-primary-button" disabled={!!busy || !material} onClick={() => void run('generate', () => generateWikiDraft(projectId, Number(material)), zh ? '草稿已生成，请核对原文依据。' : 'Draft ready for review.')}>
            {busy === 'generate' ? <LoaderCircle size={17} className="project-wiki-spin" /> : <Sparkles size={17} />}
            {zh ? busy === 'generate' ? '正在阅读并整理材料…' : 'AI 整理为草稿' : 'Generate draft'}</button>
          {!catalog.materials.some(m => m.can_generate) && <small>{zh ? '请先在有权限的事项下提交材料。' : 'Submit evidence under an authorized work item first.'}</small>}
        </section>
        {catalog.drafts.length > 0 && <section><h3>{zh ? '待确认草稿' : 'Drafts for review'}</h3>
          {catalog.drafts.map(draft => <article className="project-wiki-card is-draft" key={draft.id}>
            <div className="project-wiki-card-title"><FileText size={18} /><strong className="font-medium">{draft.title}</strong><span>{zh ? '待确认' : 'Draft'}</span></div>
            {(draft.meta.proposals || []).map(proposal => <div key={proposal.key}><h4>{proposal.title}</h4><Facts facts={proposal.facts} zh={zh} /></div>)}
            {catalog.can_publish ? <button className="axis-primary-button" disabled={!!busy} onClick={() => void run(`publish-${draft.id}`, () => publishWikiDraft(projectId, draft.id), zh ? '已发布到项目知识。' : 'Published.')}>
              {zh ? '确认发布到项目知识' : 'Confirm and publish'}</button> : <small>{zh ? '等待项目管理人员核对并发布。' : 'Awaiting project manager review.'}</small>}
          </article>)}</section>}
        <section><h3>{zh ? '已发布知识' : 'Published knowledge'}</h3>
          <form className="project-wiki-search" onSubmit={e => { e.preventDefault(); void run('search', () => load(query), '') }}>
            <label className="sr-only" htmlFor="project-wiki-query">{zh ? '搜索项目知识' : 'Search project knowledge'}</label>
            <input id="project-wiki-query" value={query} onChange={e => setQuery(e.target.value)} placeholder={zh ? '搜索事项、风险、决策…' : 'Search work, risks, decisions…'} />
            <button className="axis-secondary-button" disabled={!!busy} aria-label={zh ? '搜索' : 'Search'}><Search size={18} /></button>
          </form>
          {catalog.pages.map(page => <article className="project-wiki-card" key={page.id}>
            <div className="project-wiki-card-title"><BookOpen size={18} /><strong className="font-medium">{page.title}</strong></div>
            <small>{zh ? `已发布 · 版本 ${page.meta.revision || 1}` : `Published · revision ${page.meta.revision || 1}`}</small>
            <Facts facts={page.meta.facts || []} zh={zh} />
          </article>)}
          {!catalog.pages.length && <p className="project-wiki-empty">{zh ? query ? '没有匹配的知识页。' : '发布第一份草稿，建立这个项目的知识。' : 'No published pages yet.'}</p>}
        </section>
      </>}
    </section>
  </AxisDialog>
}
