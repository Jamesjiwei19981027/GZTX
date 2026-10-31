import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

/// Personal and project report views. The server remains the human-axis ACL authority.
class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, this.reportId, this.projectId});
  final int? reportId;
  final int? projectId;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _editor = TextEditingController();
  var _tab = 0;
  var _loading = true;
  var _busy = false;
  List<ReportItem> _reports = [];
  List<ReportItem> _projectReports = [];
  List<ReportInboxItem> _inbox = [];
  ReportItem? _detail;
  ReportItem? _projectSummary;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _editor.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final api = context.read<AppState>().reports;
      if (widget.reportId != null) {
        _detail = await api.get(widget.reportId!);
        _editor.text = _detail?.summary ?? _detail?.content ?? '';
      } else {
        final values = await Future.wait(
            [api.myReports(projectId: widget.projectId), api.inbox()]);
        _reports = values[0] as List<ReportItem>;
        _inbox = values[1] as List<ReportInboxItem>;
        if (widget.projectId != null) {
          try {
            _projectReports = await api.projectReports(widget.projectId!);
          } catch (_) {
            _projectReports = [];
          }
        }
      }
    } catch (e) {
      if (mounted) showApiError(context, e, '加载汇报失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _generate() async {
    try {
      final projectId = widget.projectId;
      final reports = context.read<AppState>().reports;
      if (projectId != null) await reports.bindProjectAgents(projectId);
      await reports.generate(projectId: projectId);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('汇报草稿已生成')));
      }
    } catch (e) {
      if (mounted) showApiError(context, e, '生成汇报失败');
    }
  }

  Future<void> _submit() async {
    if (_detail == null || _busy || _editor.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final updated = await context
          .read<AppState>()
          .reports
          .submit(_detail!.id, summary: _editor.text.trim());
      if (updated != null) setState(() => _detail = updated);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('已提交，直属领导和其 AI 将收到提醒')));
      }
    } catch (e) {
      if (mounted) showApiError(context, e, '提交汇报失败');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _aggregate() async {
    final projectId = widget.projectId;
    if (projectId == null || _busy) return;
    setState(() => _busy = true);
    try {
      final reports = context.read<AppState>().reports;
      // Idempotently initialize project/member agents before the first summary.
      await reports.bindProjectAgents(projectId);
      final result = await reports.aggregateProject(projectId);
      if (result != null) setState(() => _projectSummary = result);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('项目汇报已汇总')));
      }
    } catch (e) {
      if (mounted) showApiError(context, e, '项目汇总失败（仅项目管理者可执行）');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showLeadershipSummary() async {
    final companyId = context.read<AppState>().currentCompany?.id;
    if (companyId == null) return;
    try {
      final summary =
          await context.read<AppState>().reports.leadershipLatest(companyId);
      if (!mounted) return;
      if (summary == null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('暂无总领导汇报')));
        return;
      }
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('总领导 AI 摘要'),
          content: SingleChildScrollView(
              child: Text(summary.summary ?? summary.content ?? '暂无内容')),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('关闭'))
          ],
        ),
      );
    } catch (e) {
      if (mounted) showApiError(context, e, '暂无总领导摘要或权限不足');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.reportId != null) return _detailView(context);
    // Keep the manager tab visible even before the first subordinate report;
    // the manager can initialize/aggregate an empty project explicitly.
    final hasProject = widget.projectId != null;
    final segments = <ButtonSegment<int>>[
      const ButtonSegment(
          value: 0,
          label: Text('我的汇报'),
          icon: Icon(Icons.description_outlined)),
      ButtonSegment(
          value: 1,
          label: Text(
              '上级消息${_inbox.where((e) => !e.read).isEmpty ? ' · ${_inbox.where((e) => !e.read).length}' : ''}'),
          icon: const Icon(Icons.notifications_outlined)),
      if (hasProject)
        const ButtonSegment(
            value: 2,
            label: Text('项目汇总'),
            icon: Icon(Icons.account_tree_outlined)),
    ];
    if (_tab >= segments.length) _tab = 0;
    return Scaffold(
      appBar: AppBar(title: const Text('AI 汇报'), actions: [
        IconButton(
            tooltip: '总领导 AI 摘要',
            onPressed: _showLeadershipSummary,
            icon: const Icon(Icons.leaderboard_outlined)),
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh))
      ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(children: [
              SegmentedButton<int>(
                  segments: segments,
                  selected: {_tab},
                  onSelectionChanged: (s) => setState(() => _tab = s.first)),
              Expanded(
                  child: _tab == 0
                      ? _reportList()
                      : _tab == 1
                          ? _inboxList()
                          : _projectList()),
            ]),
      floatingActionButton: _tab == 0
          ? FloatingActionButton.extended(
              onPressed: _generate,
              icon: const Icon(Icons.auto_awesome),
              label: const Text('生成汇报'))
          : _tab == 2
              ? FloatingActionButton.extended(
                  onPressed: _busy ? null : _aggregate,
                  icon: const Icon(Icons.summarize_outlined),
                  label: const Text('汇总项目'))
              : null,
    );
  }

  Widget _reportList() => _reports.isEmpty
      ? const EmptyHint('暂无汇报，先生成一份草稿')
      : ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: _reports.length,
          itemBuilder: (_, i) {
            final r = _reports[i];
            return Card(
                child: ListTile(
                    title: Text(r.projectName ?? r.title ?? '项目汇报'),
                    subtitle: Text(
                        '${r.summary ?? r.content ?? '暂无摘要'}${r.sourceCount > 0 ? '\n资料来源 ${r.sourceCount} 条' : ''}',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis),
                    trailing: _status(r),
                    onTap: () =>
                        Navigator.of(context).pushNamed('/reports/${r.id}')));
          });

  Widget _inboxList() => _inbox.isEmpty
      ? const EmptyHint('暂无上级消息')
      : ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: _inbox.length,
          itemBuilder: (_, i) {
            final m = _inbox[i];
            return Card(
                child: ListTile(
                    leading: Icon(m.read
                        ? Icons.mark_email_read_outlined
                        : Icons.mark_email_unread_outlined),
                    title: Text(m.title ?? m.eventType ?? '汇报提醒'),
                    subtitle: Text(m.message ?? '直属领导有新的汇报消息'),
                    onTap: () async {
                      if (!m.read) {
                        await context.read<AppState>().reports.markRead(m.id);
                        setState(() => _inbox[i] = ReportInboxItem(
                            id: m.id,
                            title: m.title,
                            message: m.message,
                            eventType: m.eventType,
                            read: true,
                            createdAt: m.createdAt,
                            reportId: m.reportId));
                      }
                      if (m.reportId != null && mounted) {
                        Navigator.of(context)
                            .pushNamed('/reports/${m.reportId}');
                      }
                    }));
          });

  Widget _projectList() {
    if (_projectReports.isEmpty) return const EmptyHint('暂无下属汇报或你没有项目管理权限');
    return ListView(padding: const EdgeInsets.all(12), children: [
      if (_projectSummary != null)
        Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(_projectSummary!.summary ??
                    _projectSummary!.content ??
                    '暂无项目汇总'))),
      ..._projectReports.map((r) => Card(
          child: ListTile(
              title: Text('成员汇报 #${r.id}'),
              subtitle: Text(r.summary ?? '暂无内容',
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              trailing: _status(r),
              onTap: () =>
                  Navigator.of(context).pushNamed('/reports/${r.id}')))),
    ]);
  }

  Widget _status(ReportItem r) {
    final labels = <String>[];
    if (r.status != null) labels.add(r.status!);
    if (r.stale) labels.add('过期');
    if (r.conflicts.isNotEmpty) labels.add('有冲突');
    return Text(labels.isEmpty ? '草稿' : labels.join(' · '),
        style: TextStyle(
            color: r.conflicts.isNotEmpty ? Colors.red : null, fontSize: 12));
  }

  Widget _detailView(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('汇报详情')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _detail == null
                ? const EmptyHint('汇报不存在或无权查看')
                : ListView(padding: const EdgeInsets.all(16), children: [
                    Text(_detail!.projectName ?? _detail!.title ?? '项目汇报',
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 8),
                    _status(_detail!),
                    if (_detail!.stale)
                      const _ReportWarning(text: '这份汇报可能已过期，请补充最新进展。'),
                    if (_detail!.conflicts.isNotEmpty)
                      const _ReportWarning(text: '汇报与项目资料存在冲突，请直属领导确认。'),
                    const SizedBox(height: 16),
                    TextField(
                        controller: _editor,
                        maxLines: 10,
                        decoration: const InputDecoration(
                            labelText: 'AI 汇报内容（可编辑）',
                            border: OutlineInputBorder())),
                    if (_detail!.sources.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      const Text('资料来源',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                      ..._detail!.sources.map((s) => ListTile(
                          dense: true,
                          leading: const Icon(Icons.link),
                          title: Text(s is Map
                              ? '${s['source_type'] ?? '资料'} #${s['source_id'] ?? ''}'
                              : '资料'),
                          subtitle: s is Map && s['excerpt'] != null
                              ? Text('${s['excerpt']}')
                              : null)),
                    ],
                    if (_detail!.status != 'aggregated') ...[
                      const SizedBox(height: 16),
                      FilledButton.icon(
                          onPressed: _busy ? null : _submit,
                          icon: const Icon(Icons.send),
                          label: Text(_busy ? '提交中...' : '保存并提交给直属领导')),
                    ],
                  ]),
      );
}

class _ReportWarning extends StatelessWidget {
  const _ReportWarning({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      color: Colors.orange.shade50,
      child: Text(text, style: TextStyle(color: Colors.orange.shade900)));
}
