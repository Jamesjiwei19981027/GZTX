import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';
import '../work_tree/work_tree_canvas.dart';

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
      if (!mounted) return;
      setState(() {
        _project = project;
        _tree = tree;
      });
    } catch (e) {
      if (mounted) showApiError(context, e, '加载项目失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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

  Future<void> _addNode({int? parentId}) async {
    final ctrl = TextEditingController();
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(parentId == null ? '新建根节点' : '新建子节点'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: '标题',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('创建'),
          ),
        ],
      ),
    );
    if (title == null || title.isEmpty || !mounted) return;
    try {
      await context.read<AppState>().collab.createNode(
            projectId: widget.projectId,
            title: title,
            parentId: parentId,
          );
      await _load();
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
                Expanded(
                  child: WorkTreeCanvas(
                    roots: _tree,
                    projectId: widget.projectId,
                    userId: state.user?.id,
                    needsVerification: state.needsVerification,
                    onCreateRoot: () => _addNode(),
                    onAddChild: (n) => _addNode(parentId: n.id),
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
                    IconButton(onPressed: onClose, icon: const Icon(Icons.close)),
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
