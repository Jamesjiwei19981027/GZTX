import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_audit_models.dart';
import '../data/axis_rules.dart';
import '../widgets/axis_common.dart';
import 'axis_audit_result.dart';

/// AI 审计：只在用户明确发起时调用模型，历史和权限均由后端裁剪。
class AxisAuditScreen extends StatefulWidget {
  const AxisAuditScreen({super.key, this.api, this.authState, this.projectId});
  final AxisApi? api;
  final AuthState? authState;
  final int? projectId;
  @override
  State<AxisAuditScreen> createState() => _AxisAuditScreenState();
}

class _AxisAuditScreenState extends State<AxisAuditScreen> {
  AxisApi? _api;
  AuthState? _auth;
  final _instruction = TextEditingController();
  final _scroll = ScrollController();
  AxisAuditOptions? _options;
  List<AxisAuditRecord> _history = [];
  AxisAuditRecord? _result;
  String _scope = 'self';
  bool _loading = true;
  bool _busy = false;
  bool _hasMore = false;
  Object? _error;
  VoidCallback? _retry;
  int _permissionRevision = 0;
  int _epoch = 0;
  int? _loadedProjectId;
  String? _loadedAuthKey;
  Timer? _pollTimer;
  bool _polling = false;
  bool _routeActive = true;
  bool _reloadOnResume = false;
  int _pollRevision = 0;
  String get _authKey =>
      '${_auth?.currentUser?.id}:${_auth?.status}:${_auth?.api.tokens.sessionGeneration}';
  int? get _projectId => widget.projectId ?? _auth?.currentProject?.id;

  AuthState? _readAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  void _configure() {
    _auth?.removeListener(_authChanged);
    _auth = widget.authState ?? _readAuth();
    _auth?.addListener(_authChanged);
    _api = widget.api ?? AxisApi(_auth!.api);
    _load();
  }

  void _authChanged() {
    if (_loadedProjectId != _projectId || _loadedAuthKey != _authKey) _load();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final active = ModalRoute.of(context)?.isCurrent ?? true;
    if (_api == null) {
      _routeActive = active;
      _configure();
    } else if (_routeActive != active) {
      _routeActive = active;
      if (active) {
        if (_reloadOnResume) {
          _load();
        } else {
          _schedulePoll();
        }
      } else {
        _reloadOnResume = _loading || _busy;
        _epoch++;
        _stopPolling();
      }
    }
  }

  @override
  void didUpdateWidget(covariant AxisAuditScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.api != oldWidget.api ||
        widget.authState != oldWidget.authState ||
        widget.projectId != oldWidget.projectId) {
      _configure();
    }
  }

  @override
  void dispose() {
    _epoch++;
    _stopPolling();
    _auth?.removeListener(_authChanged);
    _instruction.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    _stopPolling();
    _retry = _load;
    final ticket = ++_epoch;
    final projectId = _projectId;
    _loadedProjectId = projectId;
    _loadedAuthKey = _authKey;
    _instruction.clear();
    setState(() {
      _loading = true;
      _busy = false;
      _error = null;
      _options = null;
      _history = [];
      _result = null;
      _hasMore = false;
      _scope = 'self';
    });
    if (_auth != null && !_auth!.isAuthenticated) {
      setState(() {
        _loading = false;
        _error = _auth!.status == AuthStatus.offline
            ? '当前离线，联网后再查看审计'
            : '登录已过期，请重新登录';
      });
      return;
    }
    if (projectId == null) {
      setState(() {
        _loading = false;
        _error = '缺少项目上下文，请重新进入项目';
      });
      return;
    }
    try {
      final values = await Future.wait<Object>(
          [_api!.fetchAuditOptions(projectId), _api!.fetchAudits(projectId)]);
      if (!mounted || ticket != _epoch) return;
      final history = values[1] as AxisAuditHistory;
      setState(() {
        _options = values[0] as AxisAuditOptions;
        _history = history.items;
        _hasMore = history.hasMore;
      });
    } catch (e) {
      if (mounted && ticket == _epoch) setState(() => _error = e);
    } finally {
      if (mounted && ticket == _epoch) {
        setState(() => _loading = false);
        _schedulePoll();
      }
    }
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _pollRevision++;
  }

  Set<int> get _runningIds => {
        if (_result?.isRunning == true) _result!.id,
        for (final record in _history)
          if (record.isRunning) record.id,
      };

  void _schedulePoll() {
    _pollTimer?.cancel();
    _pollTimer = null;
    if (!mounted ||
        !_routeActive ||
        _loading ||
        _busy ||
        _polling ||
        _loadedProjectId == null ||
        _runningIds.isEmpty ||
        (_auth != null && !_auth!.isAuthenticated)) {
      return;
    }
    _pollTimer = Timer(const Duration(seconds: 5), _poll);
  }

  AxisAuditRecord _latestRecord(AxisAuditRecord record) {
    if (!record.isRunning) return record;
    if (_result?.id == record.id && !_result!.isRunning) return _result!;
    for (final row in _history) {
      if (row.id == record.id && !row.isRunning) return row;
    }
    return record;
  }

  void _replaceRecord(AxisAuditRecord incoming) {
    final record = _latestRecord(incoming);
    if (_result?.id == record.id) _result = record;
    _history = [
      for (final row in _history) row.id == record.id ? record : row,
    ];
  }

  Future<void> _poll() async {
    _pollTimer = null;
    if (_polling || _busy || !_routeActive) {
      _schedulePoll();
      return;
    }
    final projectId = _loadedProjectId;
    if (projectId == null) return;
    final ticket = _epoch;
    final revision = _pollRevision;
    final api = _api!;
    _polling = true;
    try {
      // 每条记录同一轮只请求一次；整轮完成后再安排下一次，慢请求不会重叠。
      await Future.wait(_runningIds.map((id) async {
        try {
          final record = await api.fetchAudit(projectId, id);
          if (!mounted ||
              ticket != _epoch ||
              revision != _pollRevision ||
              !_routeActive) {
            return;
          }
          setState(() => _replaceRecord(record));
        } catch (_) {
          // 临时断网保留规则快照，下一轮恢复读取，不重新发起模型。
        }
      }));
    } finally {
      // 取消仅使旧响应失效；仍等待这轮请求结束，避免返回页面时重叠请求。
      _polling = false;
      _schedulePoll();
    }
  }

  Future<void> _run() async {
    _retry = _run;
    final ticket = _epoch;
    final projectId = _loadedProjectId;
    if (projectId == null || _busy) return;
    final selected =
        _options?.scopes.where((s) => s.key == _scope).toList() ?? [];
    if (selected.isEmpty) {
      setState(() => _error = '请选择已授权的审计范围');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result =
          await _api!.createAudit(projectId, selected.first, _instruction.text);
      if (!mounted || ticket != _epoch) return;
      setState(() {
        _result = result;
        _history = [result, ..._history.where((row) => row.id != result.id)];
      });
      try {
        final history = await _api!.fetchAudits(projectId);
        if (!mounted || ticket != _epoch) return;
        setState(() {
          _history = [
            if (!history.items.any((row) => row.id == result.id)) result,
            ...history.items.map(_latestRecord),
          ];
          _hasMore = history.hasMore;
        });
      } catch (e) {
        if (mounted && ticket == _epoch) {
          setState(() {
            _retry = () => _refreshHistory();
            _error = '审计已存档，历史刷新失败：${axisErrorMessage(e)}';
          });
        }
      }
    } catch (e) {
      if (mounted && ticket == _epoch) setState(() => _error = e);
    } finally {
      if (mounted && ticket == _epoch) {
        setState(() => _busy = false);
        _schedulePoll();
      }
    }
  }

  Future<void> _open(int id) async {
    _retry = () => _open(id);
    final ticket = _epoch;
    if (_loadedProjectId == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _api!.fetchAudit(_loadedProjectId!, id);
      if (!mounted || ticket != _epoch) return;
      setState(() {
        _result = _latestRecord(result);
        _replaceRecord(_result!);
      });
      if (_scroll.hasClients) _scroll.jumpTo(0);
    } catch (e) {
      if (mounted && ticket == _epoch) setState(() => _error = e);
    } finally {
      if (mounted && ticket == _epoch) {
        setState(() => _busy = false);
        _schedulePoll();
      }
    }
  }

  Future<void> _more() => _refreshHistory(append: true);

  Future<void> _refreshHistory({bool append = false}) async {
    _retry = () => _refreshHistory(append: append);
    final ticket = _epoch;
    if (_loadedProjectId == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final history = await _api!
          .fetchAudits(_loadedProjectId!, offset: append ? _history.length : 0);
      if (!mounted || ticket != _epoch) return;
      setState(() {
        _history = append
            ? {
                ...{for (final row in _history) row.id: row},
                ...{for (final row in history.items) row.id: _latestRecord(row)}
              }.values.toList()
            : history.items.map(_latestRecord).toList();
        _hasMore = history.hasMore;
      });
    } catch (e) {
      if (mounted && ticket == _epoch) setState(() => _error = e);
    } finally {
      if (mounted && ticket == _epoch) {
        setState(() => _busy = false);
        _schedulePoll();
      }
    }
  }

  Future<void> _permission(int nodeId, String value) async {
    _retry = () => _permission(nodeId, value);
    final ticket = _epoch;
    if (_loadedProjectId == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final options = await _api!.saveAuditPermission(_loadedProjectId!, nodeId,
          value == 'default' ? null : value == 'true');
      if (!mounted || ticket != _epoch) return;
      setState(() {
        _options = options;
        if (!options.scopes.any((s) => s.key == _scope)) _scope = 'self';
      });
    } catch (e) {
      if (mounted && ticket == _epoch) setState(() => _error = e);
    } finally {
      if (mounted && ticket == _epoch) {
        setState(() {
          _busy = false;
          _permissionRevision++;
        });
        _schedulePoll();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    final secondary = TextStyle(
        fontSize: 13, height: 1.5, color: AppColors.textSecondaryOf(dark));
    return AppScaffold(
        title: 'AI 审计',
        body: _loading
            ? const Center(child: AppLoading())
            : ListView(
                controller: _scroll,
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    AxisErrorBanner(
                        key: const ValueKey('audit-error'),
                        message: axisErrorMessage(_error!),
                        onRetry: _retry ?? _load),
                  if (_options != null)
                    AxisCard(
                        key: const ValueKey('audit-form'),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('发起审计',
                                  style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w500)),
                              const SizedBox(height: 16),
                              SizedBox(
                                  key: const ValueKey('audit-scope'),
                                  width: double.infinity,
                                  child: DropdownButtonFormField<String>(
                                    key: ValueKey(_scope),
                                    initialValue: _scope,
                                    isExpanded: true,
                                    decoration: const InputDecoration(
                                        labelText: '审计范围'),
                                    items: _options!.scopes
                                        .map((scope) => DropdownMenuItem(
                                            value: scope.key,
                                            child: Text(scope.label,
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis)))
                                        .toList(),
                                    onChanged: _busy
                                        ? null
                                        : (value) {
                                            if (value != null) {
                                              setState(() => _scope = value);
                                            }
                                          },
                                  )),
                              const SizedBox(height: 16),
                              TextField(
                                key: const ValueKey('audit-instruction'),
                                controller: _instruction,
                                enabled: !_busy,
                                minLines: 2,
                                maxLines: 4,
                                maxLength: 500,
                                style: const TextStyle(fontSize: 14),
                                decoration: const InputDecoration(
                                    labelText: '自定义审查要求（选填）',
                                    hintText: '例如：核验交付材料'),
                                onChanged: (_) => setState(() {}),
                              ),
                              Text('填写要求时优先使用你的个人 AI，未填写时使用企业 AI',
                                  style: secondary),
                              const SizedBox(height: 8),
                              Text('结果会存档，被审人可查看针对本人的部分', style: secondary),
                              const SizedBox(height: 16),
                              AppButton(
                                  key: const ValueKey('audit-run'),
                                  label: '开始审计',
                                  isLoading: _busy,
                                  isFullWidth: true,
                                  size: AppButtonSize.lg,
                                  onPressed: _busy ||
                                          _options!.scopes.isEmpty ||
                                          _instruction.text.runes.length > 500
                                      ? null
                                      : _run),
                            ])),
                  if (_result != null) const SizedBox(height: 16),
                  if (_result != null)
                    AxisStoredAuditResult(
                        key: const ValueKey('audit-result'), record: _result!),
                  const AxisSectionTitle('审计历史'),
                  AxisCard(
                      key: const ValueKey('audit-history'),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('我发起的和针对本人的审计', style: secondary),
                            if (_history.isEmpty)
                              const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 16),
                                  child: Text('暂无审计记录')),
                            for (final record in _history)
                              SizedBox(
                                  width: double.infinity,
                                  child: TextButton(
                                    key: ValueKey('audit-history-${record.id}'),
                                    onPressed:
                                        _busy ? null : () => _open(record.id),
                                    style: TextButton.styleFrom(
                                        alignment: Alignment.centerLeft,
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 12)),
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                              AxisRules.formatDateTime(
                                                  record.summary.generatedAt),
                                              style: TextStyle(
                                                  fontSize: 14,
                                                  color: dark
                                                      ? AppColors
                                                          .darkTextPrimary
                                                      : AppColors.textPrimary)),
                                          Text(
                                              '${record.restricted ? '针对本人' : '我发起的'} · ${record.statusLabel} · ${record.mode == 'ai' ? 'AI 审计' : '规则检查'} · ${record.summary.overallRiskLabel}',
                                              style: secondary),
                                        ]),
                                  )),
                            if (_hasMore)
                              AppButton(
                                  label: '加载更多',
                                  variant: AppButtonVariant.secondary,
                                  onPressed: _busy ? null : _more),
                          ])),
                  if (_options?.canManage == true) const SizedBox(height: 16),
                  if (_options?.canManage == true)
                    AxisCard(
                        key: const ValueKey('audit-permissions'),
                        child: ExpansionTile(
                          tilePadding: EdgeInsets.zero,
                          title: const Text('下属审计权限',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w500)),
                          children: [
                            Text('第 1、2 层默认打开，第 3 层及更深层默认关闭；打开后可审整棵下属子树',
                                style: secondary),
                            for (final person in _options!.people)
                              Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 12),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(person.title,
                                            style:
                                                const TextStyle(fontSize: 14)),
                                        Text(
                                            '第 ${person.depth} 层 · 当前${person.effective ? '打开' : '关闭'}',
                                            style: secondary),
                                        const SizedBox(height: 8),
                                        DropdownButtonFormField<String>(
                                          key: ValueKey(
                                              'audit-permission-${person.nodeId}-${person.value}-$_permissionRevision'),
                                          initialValue:
                                              person.value?.toString() ??
                                                  'default',
                                          isExpanded: true,
                                          decoration: const InputDecoration(
                                              labelText: '下属审计权限'),
                                          items: const [
                                            DropdownMenuItem(
                                                value: 'default',
                                                child: Text('按层级默认')),
                                            DropdownMenuItem(
                                                value: 'true',
                                                child: Text('打开')),
                                            DropdownMenuItem(
                                                value: 'false',
                                                child: Text('关闭'))
                                          ],
                                          onChanged: _busy
                                              ? null
                                              : (value) {
                                                  if (value != null) {
                                                    _permission(
                                                        person.nodeId, value);
                                                  }
                                                },
                                        ),
                                      ])),
                          ],
                        )),
                ],
              ));
  }
}
