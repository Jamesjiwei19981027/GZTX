/// 人轴视图枚举。数值只影响画布排版，不写回服务端。
library;

enum AxisViewTab {
  mine('我的职责'),
  overview('项目全貌');

  const AxisViewTab(this.label);
  final String label;
}

enum AxisOrientation {
  vertical('纵向树状'),
  horizontal('横向总览');

  const AxisOrientation(this.label);
  final String label;
}

enum AxisSort {
  tree('树序'),
  time('时间序');

  const AxisSort(this.label);
  final String label;
}

enum AxisSpacing {
  compact('紧凑', 148),
  standard('标准', 196),
  loose('宽松', 248);

  const AxisSpacing(this.label, this.stationGap);
  final String label;

  /// 相邻人员站点沿主干方向的间距。
  final double stationGap;
}
