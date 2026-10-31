"""Create/remove a marked shared Wiki page in the disposable Android fixture only."""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.core.config import settings
from app.db.session import async_session_factory, engine
from app.models.project import Project
from app.models.user import User
from app.models.wiki import ProjectWikiEntry

PREFIX = '[知识空间验收] '


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cleanup', type=int)
    args = parser.parse_args()
    if not settings.DEBUG or 'axis_joint_debug_' not in settings.DATABASE_URL:
        raise RuntimeError('Only the isolated joint-debug database is allowed')
    engine.echo = False
    async with async_session_factory() as db:
        project = await db.scalar(select(Project).where(Project.name == '责任树联合调试'))
        owner = await db.scalar(select(User).where(User.username == 'axis_pm'))
        if not project or not owner or project.pm_user_id != owner.id:
            raise RuntimeError('The expected disposable project and PM are required')
        if args.cleanup is not None:
            page = await db.get(ProjectWikiEntry, args.cleanup)
            if page is not None:
                if (page.company_id != project.company_id or page.project_id != project.id
                    or page.created_by != owner.id or not page.title.startswith(PREFIX)):
                    raise RuntimeError('Refusing to delete an unmarked source page')
                await db.delete(page)
                await db.commit()
            print(json.dumps({'cleaned_page_id': args.cleanup}))
        else:
            page = ProjectWikiEntry(company_id=project.company_id, project_id=project.id,
                created_by=owner.id, title=PREFIX + '项目共享验收说明', source='manual',
                body_text='知识空间验收：已完成八项接口检查，另外两项仍需复核。此页是可清理的自动化验收资料。')
            db.add(page)
            await db.commit()
            print(json.dumps({'project_id': project.id, 'page_id': page.id, 'title': page.title}, ensure_ascii=False))
    await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
