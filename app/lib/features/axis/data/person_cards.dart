import 'dart:convert';
import 'package:flutter/material.dart';

const personCardFields = [
  'avatar',
  'name',
  'role',
  'department',
  'description',
  'task_count',
  'overdue_count',
  'progress',
  'recent_progress',
  'next_due',
  'tags',
  'custom_fields'
];
const personCardLabels = {
  'avatar': '头像',
  'name': '姓名',
  'role': '角色/职位',
  'department': '部门',
  'description': '职责描述',
  'task_count': '任务数',
  'overdue_count': '逾期数',
  'progress': '进度条',
  'recent_progress': '最近进展',
  'next_due': '最近截止日期',
  'tags': '标签',
  'custom_fields': '自定义字段'
};
const personCardColors = <String, Color>{
  'ink': Color(0xFF1D4E9E),
  'slate': Color(0xFF596678),
  'sage': Color(0xFF526C5B),
  'ochre': Color(0xFF8B682F),
  'clay': Color(0xFF98634F),
  'rose': Color(0xFF945D67),
  'plum': Color(0xFF79617D),
  'stone': Color(0xFF6D695F)
};
const personCardColorNames = {
  'ink': '墨蓝',
  'slate': '岩灰',
  'sage': '鼠尾草',
  'ochre': '赭石',
  'clay': '陶土',
  'rose': '灰玫瑰',
  'plum': '灰梅',
  'stone': '石灰'
};

Map<String, dynamic> mergePersonCard(
    [Map<String, dynamic> template = const {},
    Map<String, dynamic> style = const {},
    Map<String, dynamic> view = const {}]) {
  final result = Map<String, dynamic>.from(jsonDecode(jsonEncode({
    'fields': personCardFields,
    'density': 'standard',
    'color': 'ink',
    'tags': [],
    'custom_fields': [],
    'avatar': 'profile',
    ...template,
    ...style,
    if (view.containsKey('fields')) 'fields': view['fields'],
    if (view.containsKey('density')) 'density': view['density'],
  })) as Map);
  if (view['show_colors'] == false) {
    result['color'] = 'ink';
    result['tags'] = (result['tags'] as List)
        .map((t) => {...t as Map, 'color': 'ink'})
        .toList();
  }
  if (view['show_tags'] == false) result['tags'] = [];
  return result;
}

String? personCardDraftError(Map<String, dynamic> value) {
  final tags = value['tags'] as List? ?? [];
  final fields = value['custom_fields'] as List? ?? [];
  if (tags.length > 8 || fields.length > 10) return '标签最多8个，自定义字段最多10个';
  if (tags.any((t) =>
      (t['text'] as String).trim().isEmpty ||
      (t['text'] as String).runes.length > 12)) {
    return '标签不能为空且最多12字';
  }
  if (fields.any((f) =>
      (f['key'] as String).trim().isEmpty ||
      (f['key'] as String).runes.length > 12 ||
      (f['value'] as String).runes.length > 60)) {
    return '字段名称不能为空且最多12字，值最多60字';
  }
  return null;
}
