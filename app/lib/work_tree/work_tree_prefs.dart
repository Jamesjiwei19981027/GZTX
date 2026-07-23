import 'package:shared_preferences/shared_preferences.dart';

enum WorkTreeAxis { vertical, horizontal }

enum WorkTreeSort { tree, time }

class WorkTreePrefs {
  WorkTreePrefs(this.projectId);

  final int projectId;

  String get _axisKey => 'wt_${projectId}_axis';
  String get _sortKey => 'wt_${projectId}_sort';
  String get _lastNodeKey => 'wt_${projectId}_last_node';
  String get _levelsKey => 'wt_${projectId}_visible_levels';
  String get _leaderDeltaKey => 'wt_${projectId}_leaderAlongDelta';

  Future<WorkTreeAxis> loadAxis() async {
    final p = await SharedPreferences.getInstance();
    return p.getString(_axisKey) == 'horizontal'
        ? WorkTreeAxis.horizontal
        : WorkTreeAxis.vertical;
  }

  Future<WorkTreeSort> loadSort() async {
    final p = await SharedPreferences.getInstance();
    return p.getString(_sortKey) == 'time' ? WorkTreeSort.time : WorkTreeSort.tree;
  }

  Future<int?> loadLastNodeId() async {
    final p = await SharedPreferences.getInstance();
    return p.getInt(_lastNodeKey);
  }

  Future<double> loadLeaderAlongDelta() async {
    final p = await SharedPreferences.getInstance();
    return p.getDouble(_leaderDeltaKey) ?? 0;
  }

  Future<void> saveLeaderAlongDelta(double value) async {
    final p = await SharedPreferences.getInstance();
    await p.setDouble(_leaderDeltaKey, value < 0 ? 0 : value);
  }

  Future<void> saveAxis(WorkTreeAxis axis) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(
      _axisKey,
      axis == WorkTreeAxis.horizontal ? 'horizontal' : 'vertical',
    );
  }

  Future<void> saveSort(WorkTreeSort sort) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_sortKey, sort == WorkTreeSort.time ? 'time' : 'tree');
  }

  Future<void> saveLastNodeId(int? id) async {
    final p = await SharedPreferences.getInstance();
    if (id == null) {
      await p.remove(_lastNodeKey);
    } else {
      await p.setInt(_lastNodeKey, id);
    }
  }

  Future<int> loadVisibleLevels() async {
    final p = await SharedPreferences.getInstance();
    return p.getInt(_levelsKey) ?? 3;
  }

  Future<void> saveVisibleLevels(int levels) async {
    final p = await SharedPreferences.getInstance();
    await p.setInt(_levelsKey, levels.clamp(1, 8));
  }
}
