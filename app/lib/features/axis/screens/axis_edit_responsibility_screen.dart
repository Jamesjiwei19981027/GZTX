import 'package:flutter/material.dart';

import 'package:provider/provider.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../data/axis_tree_mapper.dart';
import '../widgets/axis_person_form.dart';

/// 编辑人员职责与权限（axis-edit-responsibility）。
///
/// 表单与新增人员复用同一套 [AxisPersonForm]，保证两处字段、权限与校验一致。
class AxisEditResponsibilityScreen extends StatefulWidget {
  const AxisEditResponsibilityScreen({
    super.key,
    required this.personId,
    this.projectId,
    this.api,
  });

  final int personId;
  final int? projectId;
  final AxisApi? api;

  @override
  State<AxisEditResponsibilityScreen> createState() =>
      _AxisEditResponsibilityScreenState();
}

class _AxisEditResponsibilityScreenState
    extends State<AxisEditResponsibilityScreen> {
  AxisApi? _api;
  bool _loading = true;
  bool _dirty = false;
  Object? _error;
  AxisPersonNode? _person;
  List<AxisPersonNode> _tree = const [];
  List<AxisMember> _members = const [];
  AxisPermissions _permissions = AxisPermissions.empty;
  int? _projectId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api != null) return;
    _api = widget.api ?? AxisApi(context.read<AuthState>().api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = _api!;
      final node = await api.fetchNode(widget.personId);
      final projectId = widget.projectId ??
          (node['project_id'] as num?)?.toInt() ??
          await api.findProjectIdForNode(widget.personId);
      if (projectId == null) {
        throw ApiException('无法确定该人员所属项目', code: 422);
      }
      final results = await Future.wait<dynamic>([
        api.fetchProjectTree(projectId),
        api.fetchMembers(projectId),
        api.fetchPermissions(projectId),
      ]);
      if (!mounted) return;
      final tree = AxisTreeMapper.mapTree(
        results[0] as List<Map<String, dynamic>>,
      );
      AxisPersonNode? found;
      for (final item in tree) {
        if (item.id == widget.personId) found = item;
      }
      setState(() {
        _tree = tree;
        _members = results[1] as List<AxisMember>;
        _permissions = results[2] as AxisPermissions;
        _person = found;
        _projectId = projectId;
        _loading = false;
        _dirty = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AppScaffold(
        title: '编辑人员职责',
        body: Center(child: AppLoading()),
      );
    }
    if (_error != null) {
      return AppScaffold(
        title: '编辑人员职责',
        body: AppErrorState(
          title: '无法加载人员',
          message: axisErrorMessage(_error!),
          onRetry: _load,
        ),
      );
    }
    final person = _person;
    if (person == null) {
      return AppScaffold(
        title: '编辑人员职责',
        body: AppErrorState(
          title: '人员已不在人轴上',
          message: '该人员可能已被移除，请返回人轴刷新。',
          onRetry: _load,
        ),
      );
    }

    return AppBackScope(
      isDirty: _dirty,
      child: AppScaffold(
        title: '编辑人员职责',
        body: AxisPersonForm(
          api: _api!,
          projectId: _projectId ?? widget.projectId ?? 0,
          allNodes: _tree,
          members: _members,
          node: person,
          canChangeSupervisor: _permissions.isPm ||
              _permissions.isSuperAdmin ||
              _permissions.canEditAll,
          canManageAssignees: _permissions.nodeCan(
                person,
                'can_manage_assignees',
              ) ||
              _permissions.isPm ||
              _permissions.isSuperAdmin,
          onDirty: () {
            if (!_dirty) setState(() => _dirty = true);
          },
          onSaved: () async {
            if (!mounted) return;
            setState(() => _dirty = false);
            showAppToast(context, '人员信息保存成功', type: ToastType.success);
            Navigator.of(context).maybePop();
          },
        ),
      ),
    );
  }
}
