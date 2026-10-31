import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

class ProjectListScreen extends StatefulWidget {
  const ProjectListScreen({super.key});

  @override
  State<ProjectListScreen> createState() => _ProjectListScreenState();
}

class _ProjectListScreenState extends State<ProjectListScreen> {
  List<ProjectItem> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    if (state.companies.isEmpty) {
      await state.refreshCompanies();
    }
    final company = state.currentCompany;
    if (company == null) {
      setState(() {
        _items = [];
        _loading = false;
      });
      return;
    }
    setState(() => _loading = true);
    try {
      final items = await state.collab.listProjects(company.id);
      if (mounted) setState(() => _items = items);
    } catch (e) {
      if (mounted) showApiError(context, e, '加载项目失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先在设置中选择公司')),
      );
      return;
    }
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建项目'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: '项目名称',
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
    if (name == null || name.isEmpty || !mounted) return;
    try {
      final created = await context.read<AppState>().collab.createProject(
            companyId: company.id,
            name: name,
          );
      setState(() => _items = [created, ..._items]);
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: Text(state.currentCompany == null
            ? '项目'
            : '项目 · ${state.currentCompany!.name}'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _create,
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : state.currentCompany == null
              ? const EmptyHint('请先加入公司并在设置中选择')
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? ListView(
                          children: const [
                            SizedBox(height: 80),
                            EmptyHint('暂无项目'),
                          ],
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(12, 8, 12, 88),
                          itemCount: _items.length,
                          itemBuilder: (ctx, i) {
                            final p = _items[i];
                            return Card(
                              child: ListTile(
                                leading: const Icon(Icons.folder_outlined),
                                title: Text(p.name),
                                subtitle: Text([
                                  if (p.status != null) p.status!,
                                  if (p.myRole != null) '角色 ${p.myRole}',
                                ].join(' · ')),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => Navigator.of(context).pushNamed(
                                  '/projects/${p.id}',
                                  arguments: p.name,
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
