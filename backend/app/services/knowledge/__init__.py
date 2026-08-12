"""统一知识检索层：分词 · 切块 · 索引 · 检索

权限（ACL）不在本层做，调用方（API / 智能体）负责 progress.read 校验；
本层只保证所有查询强制 company_id + project_id 过滤。
"""
