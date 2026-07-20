"""组织同步与离职收权定时任务入口"""


async def job_org_sync_all():
    """可选 cron：遍历 integration_accounts 跑同步（P1 骨架仅 log）"""
    print("[OrgSync] job_org_sync_all skipped — trigger via API")


async def job_revoke_left():
    from app.db.session import async_session_factory
    from app.services.membership_revoke import revoke_left_members

    try:
        async with async_session_factory() as db:
            n = await revoke_left_members(db)
            await db.commit()
            print(f"[OrgRevoke] revoked {n} project memberships")
            return n
    except Exception as e:
        print(f"[OrgRevoke] failed: {e}")
        return 0
