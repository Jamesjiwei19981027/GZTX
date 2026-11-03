/// Axis view state shared by the APP canvas and controls.
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
  compact('紧凑', 0.75),
  standard('标准', 1.0),
  loose('宽松', 1.5);

  const AxisSpacing(this.label, this.siblingFactor);
  final String label;
  final double siblingFactor;

  // Kept as a source compatibility getter for older screens.
  double get stationGap => 48 * siblingFactor;
}

enum AxisEdgeStyle { curve, straight }
