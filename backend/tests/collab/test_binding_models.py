def test_binding_and_notify_models():
    from app.models.bindings import AsrBinding, StorageBinding, ModelBinding
    from app.models.notify import NotifyPolicy, NotifyJob, CollabInboxMessage

    assert AsrBinding.__tablename__ == "asr_bindings"
    assert StorageBinding.__tablename__ == "storage_bindings"
    assert ModelBinding.__tablename__ == "model_bindings"
    assert NotifyPolicy.__tablename__ == "notify_policies"
    assert NotifyJob.__tablename__ == "notify_jobs"
    assert CollabInboxMessage.__tablename__ == "collab_inbox"
