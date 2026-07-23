import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../work_tree/work_tree_canvas.dart';
import '../work_tree/work_tree_layout.dart';

class ProjectDetailScreen extends StatefulWidget {
  const ProjectDetailScreen({
    super.key,
    required this.projectId,
    this.projectName,
  });

  final int projectId;
  final String? projectName;

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  ProjectItem? _project;
  List<TreeNodeItem> _tree = [];
  List<ProjectMemberItem> _members = [];
  bool _loading = true;
  TreeNodeItem? _selected;
  List<EvidenceItem> _evidence = [];
  bool _showEvidencePanel = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    setState(() => _loading = true);
    try {
      final project = await state.collab.getProject(widget.projectId);
      final tree = await state.collab.projectTree(widget.projectId);
      final members =
          await state.collab.listProjectMembers(widget.projectId);
      if (!mounted) return;
      setState(() {
        _project = project;
        _tree = tree;
        _members = members;
        if (_selected != null) {
          _selected = _findNode(_tree, _selected!.id) ?? _selected;
        }
      });
    } catch (e) {
      if (mounted) showApiError(context, e, '加载项目失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  TreeNodeItem? _findNode(List<TreeNodeItem> nodes, int id) {
    for (final n in nodes) {
      if (n.id == id) return n;
      final hit = _findNode(n.children, id);
      if (hit != null) return hit;
    }
    return null;
  }

  Future<void> _onSelection(TreeNodeItem node) async {
    setState(() {
      _selected = node;
      _evidence = [];
    });
    try {
      final items = await context.read<AppState>().collab.nodeEvidence(node.id);
      if (mounted) setState(() => _evidence = items);
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _createNode({
    required String nodeTypeKey,
    required String title,
    int? parentId,
    String? dueAt,
  }) async {
    try {
      await context.read<AppState>().collab.createNode(
            projectId: widget.projectId,
            title: title,
            nodeTypeKey: nodeTypeKey,
            parentId: parentId,
            dueAt: dueAt,
          );
      await _load();
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _updateNode({
    required int nodeId,
    String? title,
    String? nodeTypeKey,
    String? dueAt,
  }) async {
    try {
      await context.read<AppState>().collab.patchNode(
            nodeId: nodeId,
            title: title,
            nodeTypeKey: nodeTypeKey,
            dueAt: dueAt,
          );
      await _load();
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _moveNode({
    required int nodeId,
    int? newParentId,
  }) async {
    try {
      await context.read<AppState>().collab.moveNode(
            nodeId: nodeId,
            newParentId: newParentId,
          );
      await _load();
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _setAssignees({
    required int nodeId,
    required List<int> userIds,
  }) async {
    try {
      await context.read<AppState>().collab.setAssignees(
            nodeId: nodeId,
            userIds: userIds,
          );
      await _load();
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _ensureLeaderNode() async {
    final owner = _project?.finalOwner;
    final ownerId = owner?.userId ?? _project?.pmUserId;
    if (ownerId == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('项目尚未指定最终负责人（PM）')),
      );
      return;
    }
    if (WorkTreeLayout.hasLeaderOnSpine(_tree, ownerId)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('负责人节点已在主干上')),
      );
      return;
    }
    try {
      final collab = context.read<AppState>().collab;
      final title = owner?.displayName ?? '项目负责人';
      final node = await collab.createNode(
        projectId: widget.projectId,
        title: title,
        nodeTypeKey: 'person',
        parentId: null,
      );
      await collab.setAssignees(nodeId: node.id, userIds: [ownerId]);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已将「$title」放到主干终点')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _deleteNode(TreeNodeItem node) async {
    try {
      await context.read<AppState>().collab.deleteNode(node.id);
      if (!mounted) return;
      setState(() {
        if (_selected?.id == node.id) {
          _selected = null;
          _evidence = [];
          _showEvidencePanel = false;
        }
      });
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已删除「${node.title}」')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _submitEvidence(TreeNodeItem node) async {
    final ctrl = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('提交材料 · ${node.title}'),
        content: TextField(
          controller: ctrl,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: '摘要说明',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('提交'),
          ),
        ],
      ),
    );
    if (text == null || text.isEmpty || !mounted) return;
    final collab = context.read<AppState>().collab;
    try {
      await collab.submitEvidence(nodeId: node.id, summary: text);
      final items = await collab.nodeEvidence(node.id);
      if (!mounted) return;
      setState(() {
        _evidence = items;
        _showEvidencePanel = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('材料已提交')),
      );
    } catch (e) {
      if (!mounted) return;
      showApiError(context, e);
      await maybeOpenVerify(context, e);
    }
  }

  void _openAgent(TreeNodeItem node) {
    Navigator.of(context).pushNamed(
      '/agents/chat',
      arguments: {
        'projectId': widget.projectId,
        'agentName': '节点：${node.title}',
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final title = _project?.name ?? widget.projectName ?? '项目详情';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          if (_selected != null)
            IconButton(
              tooltip: '节点材料',
              onPressed: () =>
                  setState(() => _showEvidencePanel = !_showEvidencePanel),
              icon: Badge(
                isLabelVisible: _evidence.isNotEmpty,
                label: Text('${_evidence.length}'),
                child: const Icon(Icons.folder_open_outlined),
              ),
            ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_project?.finalOwner != null)
                  _FinalOwnerBanner(owner: _project!.finalOwner!),
                Expanded(
                  child: WorkTreeCanvas(
                    roots: _tree,
                    projectId: widget.projectId,
                    userId: state.user?.id,
                    needsVerification: state.needsVerification,
                    members: _members,
                    finalOwnerUserId: _project?.finalOwner?.userId ??
                        _project?.pmUserId,
                    finalOwnerName: _project?.finalOwner?.displayName,
                    canDragLeader: state.user?.id != null &&
                        (state.user!.id == _project?.pmUserId ||
                            state.user!.id == _project?.createdBy),
                    onEnsureLeader: _ensureLeaderNode,
                    onCreateNode: _createNode,
                    onMoveNode: _moveNode,
                    onUpdateNode: _updateNode,
                    onSetAssignees: _setAssignees,
                    onDeleteNode: _deleteNode,
                    onSubmitEvidence: _submitEvidence,
                    onOpenAgent: _openAgent,
                    onSelectionChanged: _onSelection,
                  ),
                ),
                if (_showEvidencePanel && _selected != null)
                  _EvidenceSheet(
                    node: _selected!,
                    items: _evidence,
                    onClose: () => setState(() => _showEvidencePanel = false),
                    onSubmit: () => _submitEvidence(_selected!),
                  ),
              ],
            ),
    );
  }
}

class _FinalOwnerBanner extends StatelessWidget {
  const _FinalOwnerBanner({required this.owner});
  final ProjectOwner owner;

  @override
  Widget build(BuildContext context) {
    final text = owner.isMe
        ? '你是本项目最终负责人（${owner.displayName}）'
        : '本项目最终负责人：${owner.displayName}';
    return Material(
      color: owner.isMe ? const Color(0xFFE8F5E9) : const Color(0xFFF3F0EA),
      child: ListTile(
        dense: true,
        leading: CircleAvatar(
          radius: 16,
          backgroundImage:
              owner.avatarUrl != null && owner.avatarUrl!.isNotEmpty
                  ? NetworkImage(owner.avatarUrl!)
                  : null,
          child: owner.avatarUrl == null || owner.avatarUrl!.isEmpty
              ? Text(
                  owner.displayName.isNotEmpty ? owner.displayName[0] : '?',
                )
              : null,
        ),
        title: Text(
          text,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: const Text(
          '以项目指定为准；主干终点应对齐最终负责人',
          style: TextStyle(fontSize: 11),
        ),
      ),
    );
  }
}

class _EvidenceSheet extends StatelessWidget {
  const _EvidenceSheet({
    required this.node,
    required this.items,
    required this.onClose,
    required this.onSubmit,
  });

  final TreeNodeItem node;
  final List<EvidenceItem> items;
  final VoidCallback onClose;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 220,
          child: Column(
            children: [
              ListTile(
                dense: true,
                title: Text('材料 · ${node.title}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextButton(onPressed: onSubmit, child: const Text('提交')),
                    IconButton(
                      onPressed: onClose,
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: items.isEmpty
                    ? const EmptyHint('暂无材料')
                    : ListView.builder(
                        itemCount: items.length,
                        itemBuilder: (ctx, i) {
                          final e = items[i];
                          return ListTile(
                            dense: true,
                            title: Text(
                              e.summary?.isNotEmpty == true
                                  ? e.summary!
                                  : '材料 #${e.id}',
                            ),
                            subtitle: Text([
                              if (e.status != null) e.status!,
                              if (e.createdAt != null) e.createdAt!,
                            ].join(' · ')),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
