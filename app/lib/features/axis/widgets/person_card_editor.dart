import 'dart:convert';
import 'package:flutter/material.dart';
import '../data/axis_models.dart';
import '../data/person_cards.dart';
import 'person_card_fields.dart';

Future<void> showPersonCardEditor(
    {required BuildContext context,
    required String mode,
    required Map<String, dynamic> initial,
    Map<String, dynamic> template = const {},
    Map<String, dynamic> style = const {},
    AxisPersonNode? node,
    required Future<void> Function(Map<String, dynamic>) onSave}) async {
  await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SizedBox(
          height: MediaQuery.sizeOf(ctx).height * .94,
          child: PersonCardEditor(
              mode: mode,
              initial: initial,
              template: template,
              style: style,
              node: node,
              onSave: onSave,
              onClose: () => Navigator.of(ctx).pop())));
}

class PersonCardEditor extends StatefulWidget {
  const PersonCardEditor(
      {super.key,
      required this.mode,
      required this.initial,
      required this.onSave,
      required this.onClose,
      this.template = const {},
      this.style = const {},
      this.node});
  final String mode;
  final Map<String, dynamic> initial, template, style;
  final AxisPersonNode? node;
  final Future<void> Function(Map<String, dynamic>) onSave;
  final VoidCallback onClose;
  @override
  State<PersonCardEditor> createState() => _PersonCardEditorState();
}

class _PersonCardEditorState extends State<PersonCardEditor> {
  late Map<String, dynamic> draft;
  late List<String> order;
  late List<int> tagIds, customIds;
  int nextId = 0;
  bool busy = false;
  String? error;
  final scroll = ScrollController();
  @override
  void initState() {
    super.initState();
    draft = Map<String, dynamic>.from(
        jsonDecode(jsonEncode(widget.initial)) as Map);
    tagIds =
        List.generate((draft['tags'] as List? ?? []).length, (_) => nextId++);
    customIds = List.generate(
        (draft['custom_fields'] as List? ?? []).length, (_) => nextId++);
    final selected = (config['fields'] as List).cast<String>();
    order = [
      ...selected,
      ...personCardFields.where((f) => !selected.contains(f))
    ];
  }

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  Map<String, dynamic> get config => widget.mode == 'template'
      ? mergePersonCard(draft)
      : widget.mode == 'style'
          ? mergePersonCard(widget.template, draft)
          : mergePersonCard(widget.template, widget.style, draft);
  String get title => widget.mode == 'template'
      ? '卡片模板'
      : widget.mode == 'style'
          ? '编辑卡片'
          : '显示设置';
  void update(String key, Object? value) => setState(() {
        if (value == null) {
          draft.remove(key);
        } else {
          draft[key] = value;
        }
        error = null;
      });
  void reorder(int oldIndex, int newIndex) {
    if (newIndex > oldIndex) newIndex--;
    setState(() {
      final selected = (config['fields'] as List).cast<String>();
      final f = order.removeAt(oldIndex);
      order.insert(newIndex, f);
      draft['fields'] = order.where(selected.contains).toList();
    });
  }

  Future<void> save(Map<String, dynamic> value) async {
    final validation = personCardDraftError(value);
    if (validation != null) {
      setState(() => error = validation);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onSave(value);
      if (mounted) widget.onClose();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget select(String key, String label, Map<String, String> values) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: DropdownButtonFormField<String>(
              initialValue: draft[key] as String? ?? '',
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: '', child: Text('继承默认')),
                ...values.entries.map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              ],
              onChanged: busy ? null : (v) => update(key, v == '' ? null : v)));
  Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Text(text,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500)));
  @override
  Widget build(BuildContext context) {
    final current = config;
    final fields = (current['fields'] as List).cast<String>();
    final sample = widget.node ??
        const AxisPersonNode(
            id: 0,
            parentId: null,
            title: '姓名',
            description: '',
            name: '姓名',
            roleTitle: '角色/职位',
            department: '部门',
            nodeOrigin: 'project',
            isTerminalPm: false,
            ownerUserIds: [],
            workItems: [],
            responsibilityPermissions: {});
    final tags = (draft['tags'] as List? ?? []).cast<Map>();
    final custom = (draft['custom_fields'] as List? ?? []).cast<Map>();
    return Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: Column(children: [
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(children: [
                Expanded(
                    child: Text(title,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w500))),
                IconButton(
                    tooltip: '关闭$title',
                    onPressed: busy ? null : widget.onClose,
                    icon: const Icon(Icons.close, size: 18))
              ])),
          Expanded(
              child: ListView(
                  controller: scroll,
                  padding: const EdgeInsets.all(16),
                  children: [
                Text(widget.mode == 'view'
                    ? '只影响你在当前项目看到的卡片'
                    : widget.mode == 'template'
                        ? '对项目全员生效，个人覆盖优先'
                        : '只修改此人员的项目卡片'),
                heading(widget.node == null ? '示例预览' : '实时预览'),
                Container(
                    constraints: const BoxConstraints(maxHeight: 160),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                        color: (personCardColors[current['color']] ??
                                personCardColors['ink']!)
                            .withValues(alpha: .06),
                        borderRadius: BorderRadius.circular(12),
                        border:
                            Border.all(color: Theme.of(context).dividerColor)),
                    child: SingleChildScrollView(
                        child:
                            PersonCardFields(node: sample, config: current))),
                heading('显示字段与顺序'),
                SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('自定义显示字段'),
                    value: draft.containsKey('fields'),
                    onChanged: busy
                        ? null
                        : (v) => update('fields', v ? fields : null)),
                const Text('长按拖动排序，或用上移、下移按钮调整',
                    style: TextStyle(fontSize: 12)),
                ReorderableListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    buildDefaultDragHandles: false,
                    itemCount: order.length,
                    onReorderItem: (oldIndex, newIndex) => reorder(oldIndex,
                        newIndex > oldIndex ? newIndex + 1 : newIndex),
                    itemBuilder: (context, index) {
                      final f = order[index];
                      return ReorderableDelayedDragStartListener(
                          key: ValueKey(f),
                          index: index,
                          enabled: draft.containsKey('fields') && !busy,
                          child: Row(children: [
                            const Icon(Icons.drag_handle, size: 18),
                            Expanded(
                                child: CheckboxListTile(
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(personCardLabels[f]!,
                                        style: const TextStyle(fontSize: 14)),
                                    value: fields.contains(f),
                                    onChanged:
                                        busy || !draft.containsKey('fields')
                                            ? null
                                            : (v) => update(
                                                'fields',
                                                order
                                                    .where((key) => key == f
                                                        ? v == true
                                                        : fields.contains(key))
                                                    .toList()))),
                            IconButton(
                                tooltip: '上移${personCardLabels[f]}',
                                onPressed: busy ||
                                        !draft.containsKey('fields') ||
                                        index == 0
                                    ? null
                                    : () => reorder(index, index - 1),
                                icon: const Icon(Icons.arrow_upward, size: 18)),
                            IconButton(
                                tooltip: '下移${personCardLabels[f]}',
                                onPressed: busy ||
                                        !draft.containsKey('fields') ||
                                        index == order.length - 1
                                    ? null
                                    : () => reorder(index, index + 2),
                                icon:
                                    const Icon(Icons.arrow_downward, size: 18))
                          ]));
                    }),
                if (widget.mode != 'style')
                  select('density', '卡片密度', const {
                    'compact': '紧凑',
                    'standard': '标准',
                    'detailed': '详细'
                  }),
                if (widget.mode != 'view')
                  select('color', '卡片颜色', personCardColorNames),
                if (widget.mode == 'view') ...[
                  SwitchListTile(
                      title: const Text('显示别人设置的颜色'),
                      value: draft['show_colors'] != false,
                      onChanged: busy ? null : (v) => update('show_colors', v)),
                  SwitchListTile(
                      title: const Text('显示别人设置的标签'),
                      value: draft['show_tags'] != false,
                      onChanged: busy ? null : (v) => update('show_tags', v)),
                ],
                if (widget.mode == 'style') ...[
                  select('avatar', '头像方式',
                      const {'initial': '名字首字', 'profile': '已有个人头像'}),
                  const Text('个人头像可在“我的”资料中上传', style: TextStyle(fontSize: 12)),
                  heading('标签 · ${tags.length}/8'),
                  for (var i = 0; i < tags.length; i++)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(children: [
                          Expanded(
                              child: TextFormField(
                                  enabled: !busy,
                                  key: Key('card-tag-${tagIds[i]}'),
                                  initialValue: tags[i]['text'] as String,
                                  maxLength: 12,
                                  decoration:
                                      InputDecoration(labelText: '标签${i + 1}'),
                                  onChanged: (v) => update('tags', [
                                        for (var j = 0; j < tags.length; j++)
                                          if (i == j)
                                            {...tags[j], 'text': v}
                                          else
                                            tags[j]
                                      ]))),
                          const SizedBox(width: 8),
                          DropdownButton<String>(
                              value: tags[i]['color'] as String,
                              items: personCardColorNames.entries
                                  .map((e) => DropdownMenuItem(
                                      value: e.key, child: Text(e.value)))
                                  .toList(),
                              onChanged: busy
                                  ? null
                                  : (v) => update('tags', [
                                        for (var j = 0; j < tags.length; j++)
                                          if (i == j)
                                            {...tags[j], 'color': v}
                                          else
                                            tags[j]
                                      ])),
                          IconButton(
                              tooltip: '删除标签${i + 1}',
                              onPressed: busy
                                  ? null
                                  : () {
                                      tagIds.removeAt(i);
                                      update('tags', [...tags]..removeAt(i));
                                    },
                              icon: const Icon(Icons.close, size: 18)),
                        ])),
                  TextButton(
                      onPressed: busy || tags.length >= 8
                          ? null
                          : () {
                              tagIds.add(nextId++);
                              update('tags', [
                                ...tags,
                                {'text': '', 'color': 'ink'}
                              ]);
                            },
                      child: const Text('添加标签')),
                  heading('自定义字段 · ${custom.length}/10'),
                  for (var i = 0; i < custom.length; i++)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                  child: TextFormField(
                                      enabled: !busy,
                                      key: Key(
                                          'card-custom-key-${customIds[i]}'),
                                      initialValue: custom[i]['key'] as String,
                                      maxLength: 12,
                                      decoration: InputDecoration(
                                          labelText: '字段${i + 1}名称'),
                                      onChanged: (v) =>
                                          update('custom_fields', [
                                            for (var j = 0;
                                                j < custom.length;
                                                j++)
                                              if (i == j)
                                                {...custom[j], 'key': v}
                                              else
                                                custom[j]
                                          ]))),
                              const SizedBox(width: 8),
                              Expanded(
                                  child: TextFormField(
                                      enabled: !busy,
                                      key: Key(
                                          'card-custom-value-${customIds[i]}'),
                                      initialValue:
                                          custom[i]['value'] as String,
                                      maxLength: 60,
                                      decoration: InputDecoration(
                                          labelText: '字段${i + 1}值'),
                                      onChanged: (v) =>
                                          update('custom_fields', [
                                            for (var j = 0;
                                                j < custom.length;
                                                j++)
                                              if (i == j)
                                                {...custom[j], 'value': v}
                                              else
                                                custom[j]
                                          ]))),
                              IconButton(
                                  tooltip: '删除字段${i + 1}',
                                  onPressed: busy
                                      ? null
                                      : () {
                                          customIds.removeAt(i);
                                          update('custom_fields',
                                              [...custom]..removeAt(i));
                                        },
                                  icon: const Icon(Icons.close, size: 18)),
                            ])),
                  TextButton(
                      onPressed: busy || custom.length >= 10
                          ? null
                          : () {
                              customIds.add(nextId++);
                              update('custom_fields', [
                                ...custom,
                                {'key': '', 'value': ''}
                              ]);
                            },
                      child: const Text('添加字段')),
                ],
              ])),
          if (error != null)
            Padding(
                padding: const EdgeInsets.all(8),
                child: Text(error!,
                    style: const TextStyle(color: Color(0xFFB3261E)))),
          SafeArea(
              top: false,
              child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(children: [
                    Expanded(
                        child: TextButton(
                            key: const Key('card-reset'),
                            onPressed: busy ? null : () => save({}),
                            child: Text(
                                widget.mode == 'style' ? '恢复为项目默认' : '恢复默认'))),
                    const SizedBox(width: 8),
                    FilledButton(
                        key: const Key('card-save'),
                        onPressed: busy ? null : () => save(draft),
                        child: Text(busy ? '保存中…' : '保存'))
                  ]))),
        ]));
  }
}
