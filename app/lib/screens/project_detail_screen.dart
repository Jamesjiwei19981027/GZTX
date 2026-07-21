import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

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
  List<AgentItem> _agents = [];
  bool _loading = true;
  int? _selectedNodeId;
  List<EvidenceItem> _evidence = [];

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
      List<AgentItem> agents = [];
      if (state.currentCompany != null) {
        agents = await state.collab.listAgents(state.currentCompany!.id);
      }
      if (!mounted) return;
      setState(() {
        _project = project;
        _tree = tree;
        _agents = agents;
      });
    } catch (e) {
      if (mounted) showApiError(context, e, '加载项目失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _selectNode(TreeNodeItem node) async {
    setState(() {
      _selectedNodeId = node.id;
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

  Future<void> _submitEvidence() async {
    if (_selectedNodeId == null) return;
    final ctrl = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('提交材料'),
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
      await collab.submitEvidence(
        nodeId: _selectedNodeId!,
        summary: text,
      );
      final items = await collab.nodeEvidence(_selectedNodeId!);
      if (!mounted) return;
      setState(() => _evidence = items);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('材料已提交')),
      );
    } catch (e) {
      if (!mounted) return;
      showApiError(context, e);
      await maybeOpenVerify(context, e);
    }
  }

  List<Widget> _buildTree(List<TreeNodeItem> nodes, {int depth = 0}) {
    final widgets = <Widget>[];
    for (final n in nodes) {
      final selected = n.id == _selectedNodeId;
      widgets.add(
        Card(
          color: selected
              ? Theme.of(context).colorScheme.primaryContainer
              : null,
          margin: EdgeInsets.only(left: depth * 12.0, top: 4, bottom: 4),
          child: ListTile(
            dense: true,
            title: Text(n.title),
            subtitle: Text([
              if (n.nodeTypeKey != null) n.nodeTypeKey!,
              if (n.progressStatus != null) n.progressStatus!,
              if (n.progressPercent != null) '${n.progressPercent}%',
            ].where((e) => e.isNotEmpty).join(' · ')),
            trailing: IconButton(
              icon: const Icon(Icons.add),
              tooltip: '添加子节点',
              onPressed: () => _addNode(parentId: n.id),
            ),
            onTap: () => _selectNode(n),
          ),
        ),
      );
      if (n.children.isNotEmpty) {
        widgets.addAll(_buildTree(n.children, depth: depth + 1));
      }
    }
    return widgets;
  }

  @override
  Widget build(BuildContext context) {
    final title = _project?.name ?? widget.projectName ?? '项目详情';
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: '智能体对话',
            onPressed: () => Navigator.of(context).pushNamed(
              '/agents/chat',
              arguments: {'projectId': widget.projectId},
            ),
            icon: const Icon(Icons.smart_toy_outlined),
          ),
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addNode(),
        icon: const Icon(Icons.add),
        label: const Text('根节点'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
                children: [
                  if (_agents.isNotEmpty) ...[
                    const SectionHeader('项目智能体'),
                    Wrap(
                      spacing: 8,
                      children: _agents
                          .take(6)
                          .map(
                            (a) => ActionChip(
                              avatar: const Icon(Icons.smart_toy, size: 16),
                              label: Text(a.name),
                              onPressed: () => Navigator.of(context).pushNamed(
                                '/agents/chat',
                                arguments: {
                                  'projectId': widget.projectId,
                                  'agentId': a.id,
                                  'agentName': a.name,
                                },
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                  const SectionHeader('工作树'),
                  if (_tree.isEmpty)
                    const EmptyHint('暂无节点，点击右下角添加')
                  else
                    ..._buildTree(_tree),
                  if (_selectedNodeId != null) ...[
                    SectionHeader(
                      '节点材料',
                      trailing: TextButton(
                        onPressed: _submitEvidence,
                        child: const Text('提交'),
                      ),
                    ),
                    if (_evidence.isEmpty)
                      const EmptyHint('暂无材料')
                    else
                      ..._evidence.map(
                        (e) => Card(
                          child: ListTile(
                            title: Text(e.summary?.isNotEmpty == true
                                ? e.summary!
                                : '材料 #${e.id}'),
                            subtitle: Text([
                              if (e.status != null) e.status!,
                              if (e.createdAt != null) e.createdAt!,
                            ].join(' · ')),
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}
