"""Disposable joint-debug fixture, restricted to its dedicated database."""
import asyncio
import json
import logging
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import async_session_factory, engine
from app.models.user import User
from app.models.category import Category
from app.models.company import CompanyMembership
from app.models.project import Project
from app.services.company_bootstrap import bootstrap_single_company, apply_license_to_company
from app.services.license_verify import sign_license_dev
from app.services.project_service import ProjectService
from app.services.tree_service import TreeService

async def ensure_role_project(db):
    name = '跨项目角色联调'
    existing = await db.scalar(select(Project).where(Project.name == name))
    if existing:
        return existing.id
    first = await db.scalar(select(Project).where(Project.name == '责任树联合调试'))
    users = {u.username: u for u in (await db.scalars(select(User).where(User.username.in_(['axis_pm', 'axis_member', 'axis_dev'])))).all()}
    from app.models.company import Company
    company = await db.get(Company, first.company_id)
    ps, ts = ProjectService(), TreeService()
    project = await ps.create_project(db, company=company, name=name, creator_user_id=users['axis_member'].id)
    await ps.assign_pm(db, project, users['axis_member'].id)
    for username, role in [('axis_pm', '设计协作负责人'), ('axis_dev', '测试负责人')]:
        user = users[username]
        await ps.pull_member(db, project, user.id)
        owner = await ts.create_node(db, project, parent_id=None, node_type_key='person', title=role,
                                     assignees=[{'user_id': user.id, 'role_key': 'primary'}], created_by=users['axis_member'].id)
        await ts.create_node(db, project, parent_id=owner.id, node_type_key='work_item', title=f'{role}验收事项', created_by=users['axis_member'].id)
    return project.id

async def main():
    assert settings.DEBUG and 'axis_joint_debug_' in settings.DATABASE_URL
    engine.echo = False
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    async with async_session_factory() as db:
        # Directly seeded users need the default category created by normal
        # registration, too. Keep reruns safe for an existing fixture.
        for user in (await db.scalars(select(User).where(User.username.in_([
            'axis_pm', 'axis_member', 'axis_product', 'axis_dev', 'axis_reader',
        ])))).all():
            if not await db.scalar(select(Category.id).where(Category.user_id == user.id, Category.is_default.is_(True)).limit(1)):
                db.add(Category(user_id=user.id, name='工作', color='#409EFF', icon='work', is_default=True, sort_order=0))
        existing = await db.scalar(select(Project).where(Project.name == '责任树联合调试'))
        if existing:
            second_id = await ensure_role_project(db)
            await db.commit()
            print(json.dumps({'project_id': existing.id, 'role_project_id': second_id, 'existing': True}))
            return
        users = []
        for username, name in [('axis_pm', '王宁'), ('axis_member', '林悦'), ('axis_product', '赵晨'), ('axis_dev', '陈宇'), ('axis_reader', '只读观察员')]:
            user = User(username=username, nickname=name, email=f'{username}@example.test', password_hash=get_password_hash('axis-debug-2026'), email_verified_at=datetime.utcnow(), phone_verified_at=datetime.utcnow(), is_active=True)
            db.add(user)
            await db.flush()
            db.add(Category(user_id=user.id, name='工作', color='#409EFF', icon='work', is_default=True, sort_order=0))
            users.append(user)
        pm, member, product, dev, reader = users
        company = await bootstrap_single_company(db, name='责任树联调测试公司', slug='axis-joint-debug', admin_user_id=pm.id)
        raw = json.dumps({'company_slug': company.slug, 'features': {'project_tree': True, 'agents': True}, 'quotas': {'max_users': 50, 'max_projects': 20}, 'valid_to': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}, sort_keys=True)
        await apply_license_to_company(db, company, raw, sign_license_dev(raw, settings.LICENSE_PUBLIC_KEY))
        for user in users[1:]:
            db.add(CompanyMembership(company_id=company.id, user_id=user.id, status='active', employment_status='active', is_super_admin=False, is_org_leader=False))
        await db.flush()
        ps, ts = ProjectService(), TreeService()
        project = await ps.create_project(db, company=company, name='责任树联合调试', creator_user_id=pm.id)
        await ps.assign_pm(db, project, pm.id)
        for user in users[1:]:
            await ps.pull_member(db, project, user.id)
        roots = []
        for i, (user, role, task_title) in enumerate([(product, '产品负责人', '需求方案确认'), (member, '设计负责人', '交互原型设计'), (dev, '研发负责人', '核心功能开发')]):
            owner = await ts.create_node(db, project, parent_id=None, node_type_key='person', title=role, sort_order=i, assignees=[{'user_id': user.id, 'role_key': 'primary'}], created_by=pm.id)
            roots.append(owner)
            await ts.create_node(db, project, parent_id=owner.id, node_type_key='work_item', title=task_title, assignees=[{'user_id': user.id, 'role_key': 'primary'}], created_by=pm.id)
        await ts.create_node(db, project, parent_id=roots[2].id, node_type_key='person', title='前端工程师', description='person: 刘洋', created_by=pm.id)
        await db.commit()
        second_id = await ensure_role_project(db)
        await db.commit()
        print(json.dumps({'project_id': project.id, 'role_project_id': second_id, 'roots': [n.id for n in roots], 'users': {u.username: u.id for u in users}}, ensure_ascii=False))
    await engine.dispose()

asyncio.run(main())
