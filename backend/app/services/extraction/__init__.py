"""材料文件抽取管线：格式路由 · 多引擎 · 逐级降级

设计见 docs/superpowers/specs/2026-08-12-rag-knowledge-retrieval-design.md「抽取管线」。
引擎依赖（markitdown/docling）全部 lazy import，不进 backend 主依赖；
不可用时逐级降级，任何异常不外抛到判定主流程（由 service.extract_package 兜底标 failed）。
"""
