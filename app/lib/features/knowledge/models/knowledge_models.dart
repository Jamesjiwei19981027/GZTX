/// 知识空间数据模型（对齐后端 `personal_knowledge` / `project_knowledge` 接口）
///
/// 字段名与网页版 `frontend/src/api/personalKnowledge.ts`、
/// `frontend/src/api/projectKnowledge.ts` 保持一致，解析时全部做空值兜底，
/// 避免个别字段缺失导致整页白屏。
library;

/// 知识空间归属范围
class KnowledgeScope {
  const KnowledgeScope({
    required this.companyId,
    required this.projectId,
    required this.ownerUserId,
  });

  final int companyId;
  final int projectId;
  final int ownerUserId;

  factory KnowledgeScope.fromJson(Map<String, dynamic> json) {
    return KnowledgeScope(
      companyId: (json['company_id'] as num?)?.toInt() ?? 0,
      projectId: (json['project_id'] as num?)?.toInt() ?? 0,
      ownerUserId: (json['owner_user_id'] as num?)?.toInt() ?? 0,
    );
  }
}

/// 关联图上的坐标
class KnowledgePoint {
  const KnowledgePoint(this.x, this.y);

  final double x;
  final double y;

  factory KnowledgePoint.fromJson(dynamic json) {
    if (json is Map) {
      return KnowledgePoint(
        ((json['x'] as num?) ?? 0).toDouble(),
        ((json['y'] as num?) ?? 0).toDouble(),
      );
    }
    return const KnowledgePoint(0, 0);
  }

  Map<String, dynamic> toJson() => {'x': x, 'y': y};
}

/// 个人知识条目
class PersonalKnowledgeEntry {
  const PersonalKnowledgeEntry({
    required this.id,
    required this.title,
    this.bodyText = '',
    this.tags = const [],
    this.position,
    this.sourceType = 'manual',
    this.sourceId,
    this.sourceRef = const {},
    this.updatedAt,
  });

  final int id;
  final String title;
  final String bodyText;
  final List<String> tags;
  final KnowledgePoint? position;
  final String sourceType;
  final int? sourceId;
  final Map<String, dynamic> sourceRef;
  final String? updatedAt;

  /// 网页版 `sourceNames` 映射：把来源类型翻译成用户看得懂的中文
  String get sourceLabel => switch (sourceType) {
        'manual' => '我的笔记',
        'evidence_package' => '我的材料',
        'evidence_file' => '上传文件',
        'agent_report' => '我的汇报',
        'agent_message' => '与 AI 的交流',
        'project_summary' => '项目知识总结',
        _ => '我的笔记',
      };

  PersonalKnowledgeEntry copyWith({
    String? title,
    String? bodyText,
    List<String>? tags,
    KnowledgePoint? position,
  }) {
    return PersonalKnowledgeEntry(
      id: id,
      title: title ?? this.title,
      bodyText: bodyText ?? this.bodyText,
      tags: tags ?? this.tags,
      position: position ?? this.position,
      sourceType: sourceType,
      sourceId: sourceId,
      sourceRef: sourceRef,
      updatedAt: updatedAt,
    );
  }

  factory PersonalKnowledgeEntry.fromJson(Map<String, dynamic> json) {
    final rawTags = json['tags'];
    return PersonalKnowledgeEntry(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? (json['title'] as String).trim()
          : '未命名笔记',
      bodyText: (json['body_text'] as String?) ?? '',
      tags: rawTags is List
          ? rawTags.map((tag) => tag.toString()).toList(growable: false)
          : const [],
      position: json['position'] == null
          ? null
          : KnowledgePoint.fromJson(json['position']),
      sourceType: (json['source_type'] as String?) ?? 'manual',
      sourceId: (json['source_id'] as num?)?.toInt(),
      sourceRef: json['source_ref'] is Map<String, dynamic>
          ? json['source_ref'] as Map<String, dynamic>
          : const {},
      updatedAt: json['updated_at'] as String?,
    );
  }
}

/// 个人知识条目之间的关联
class PersonalKnowledgeLink {
  const PersonalKnowledgeLink({
    required this.id,
    required this.sourceEntryId,
    required this.targetEntryId,
    this.label = '',
  });

  final int id;
  final int sourceEntryId;
  final int targetEntryId;
  final String label;

  factory PersonalKnowledgeLink.fromJson(Map<String, dynamic> json) {
    return PersonalKnowledgeLink(
      id: (json['id'] as num?)?.toInt() ?? 0,
      sourceEntryId: (json['source_entry_id'] as num?)?.toInt() ?? 0,
      targetEntryId: (json['target_entry_id'] as num?)?.toInt() ?? 0,
      label: (json['label'] as String?) ?? '',
    );
  }
}

/// 个人知识空间整体数据
class PersonalKnowledgeSpace {
  const PersonalKnowledgeSpace({
    required this.scope,
    required this.entries,
    required this.links,
  });

  final KnowledgeScope scope;
  final List<PersonalKnowledgeEntry> entries;
  final List<PersonalKnowledgeLink> links;

  factory PersonalKnowledgeSpace.fromJson(Map<String, dynamic> json) {
    final rawEntries = json['entries'];
    final rawLinks = json['links'];
    return PersonalKnowledgeSpace(
      scope: json['scope'] is Map<String, dynamic>
          ? KnowledgeScope.fromJson(json['scope'] as Map<String, dynamic>)
          : const KnowledgeScope(companyId: 0, projectId: 0, ownerUserId: 0),
      entries: rawEntries is List
          ? rawEntries
              .whereType<Map<String, dynamic>>()
              .map(PersonalKnowledgeEntry.fromJson)
              .toList(growable: false)
          : const [],
      links: rawLinks is List
          ? rawLinks
              .whereType<Map<String, dynamic>>()
              .map(PersonalKnowledgeLink.fromJson)
              .toList(growable: false)
          : const [],
    );
  }
}

/// AI 找到的一条关联建议（采纳前不写入）
class KnowledgeSuggestion {
  const KnowledgeSuggestion({
    required this.sourceEntryId,
    required this.targetEntryId,
    required this.label,
    required this.reason,
    required this.sourceQuote,
    required this.targetQuote,
    required this.sourceFingerprint,
    required this.targetFingerprint,
  });

  final int sourceEntryId;
  final int targetEntryId;
  final String label;
  final String reason;
  final String sourceQuote;
  final String targetQuote;
  final String sourceFingerprint;
  final String targetFingerprint;

  factory KnowledgeSuggestion.fromJson(Map<String, dynamic> json) {
    return KnowledgeSuggestion(
      sourceEntryId: (json['source_entry_id'] as num?)?.toInt() ?? 0,
      targetEntryId: (json['target_entry_id'] as num?)?.toInt() ?? 0,
      label: (json['label'] as String?) ?? '',
      reason: (json['reason'] as String?) ?? '',
      sourceQuote: (json['source_quote'] as String?) ?? '',
      targetQuote: (json['target_quote'] as String?) ?? '',
      sourceFingerprint: (json['source_fingerprint'] as String?) ?? '',
      targetFingerprint: (json['target_fingerprint'] as String?) ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'source_entry_id': sourceEntryId,
        'target_entry_id': targetEntryId,
        'label': label,
        'reason': reason,
        'source_quote': sourceQuote,
        'target_quote': targetQuote,
        'source_fingerprint': sourceFingerprint,
        'target_fingerprint': targetFingerprint,
      };
}

/// AI 整理结果：建议列表与被分析的笔记条数
class KnowledgeSuggestionResult {
  const KnowledgeSuggestionResult({
    required this.suggestions,
    required this.analyzed,
  });

  final List<KnowledgeSuggestion> suggestions;
  final int analyzed;

  factory KnowledgeSuggestionResult.fromJson(Map<String, dynamic> json) {
    final raw = json['suggestions'];
    return KnowledgeSuggestionResult(
      suggestions: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(KnowledgeSuggestion.fromJson)
              .toList(growable: false)
          : const [],
      analyzed: (json['analyzed'] as num?)?.toInt() ?? 0,
    );
  }
}

/// 收集资料结果
class KnowledgeSyncResult {
  const KnowledgeSyncResult({required this.created, required this.skipped});

  final int created;
  final int skipped;

  factory KnowledgeSyncResult.fromJson(Map<String, dynamic> json) {
    return KnowledgeSyncResult(
      created: (json['created'] as num?)?.toInt() ?? 0,
      skipped: (json['skipped'] as num?)?.toInt() ?? 0,
    );
  }
}

/// 项目共享知识页
class ProjectKnowledgePage {
  const ProjectKnowledgePage({
    required this.id,
    required this.title,
    this.bodyText = '',
    this.source = 'manual',
    this.meta = const {},
    this.updatedAt,
  });

  final int id;
  final String title;
  final String bodyText;
  final String source;
  final Map<String, dynamic> meta;
  final String? updatedAt;

  /// 网页版 `pageSource`：不使用“wiki”等看不懂的词
  String get sourceLabel =>
      source == 'llm_wiki' ? 'AI 整理 · 已发布' : '项目共享笔记';

  /// `meta.facts` 里的来源引用（材料包、原文摘引、行号）
  List<KnowledgePageFact> get facts {
    final raw = meta['facts'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => KnowledgePageFact.fromJson(item.cast<String, dynamic>()))
        .toList(growable: false);
  }

  factory ProjectKnowledgePage.fromJson(Map<String, dynamic> json) {
    return ProjectKnowledgePage(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? (json['title'] as String).trim()
          : '未命名共享资料',
      bodyText: (json['body_text'] as String?) ?? '',
      source: (json['source'] as String?) ?? 'manual',
      meta: json['meta'] is Map<String, dynamic>
          ? json['meta'] as Map<String, dynamic>
          : const {},
      updatedAt: json['updated_at'] as String?,
    );
  }
}

/// 项目共享知识页引用的原始依据
class KnowledgePageFact {
  const KnowledgePageFact({
    this.packageId,
    this.text = '',
    this.quote = '',
    this.sourceName = '',
    this.lineStart,
    this.lineEnd,
  });

  final int? packageId;
  final String text;
  final String quote;
  final String sourceName;
  final int? lineStart;
  final int? lineEnd;

  String get lineLabel {
    if (lineStart == null) return '';
    if (lineEnd == null) return '第 $lineStart 行';
    return '第 $lineStart–$lineEnd 行';
  }

  factory KnowledgePageFact.fromJson(Map<String, dynamic> json) {
    return KnowledgePageFact(
      packageId: (json['package_id'] as num?)?.toInt(),
      text: (json['text'] as String?) ?? '',
      quote: (json['quote'] as String?) ?? '',
      sourceName: (json['source_name'] as String?) ?? '',
      lineStart: (json['line_start'] as num?)?.toInt(),
      lineEnd: (json['line_end'] as num?)?.toInt(),
    );
  }
}

/// 项目知识空间的成员授权
class ProjectKnowledgeMember {
  const ProjectKnowledgeMember({
    required this.userId,
    required this.name,
    required this.canSummarize,
    required this.isManager,
  });

  final int userId;
  final String name;
  final bool canSummarize;
  final bool isManager;

  factory ProjectKnowledgeMember.fromJson(Map<String, dynamic> json) {
    return ProjectKnowledgeMember(
      userId: (json['user_id'] as num?)?.toInt() ?? 0,
      name: (json['name'] as String?) ?? '项目成员',
      canSummarize: json['can_summarize'] == true,
      isManager: json['is_manager'] == true,
    );
  }
}

/// 当前用户在项目知识空间的权限
class ProjectKnowledgePermissions {
  const ProjectKnowledgePermissions({
    this.canSummarize = false,
    this.canManageGrants = false,
  });

  final bool canSummarize;
  final bool canManageGrants;

  factory ProjectKnowledgePermissions.fromJson(Map<String, dynamic> json) {
    return ProjectKnowledgePermissions(
      canSummarize: json['can_summarize'] == true,
      canManageGrants: json['can_manage_grants'] == true,
    );
  }
}

/// 项目知识空间目录
class ProjectKnowledgeCatalog {
  const ProjectKnowledgeCatalog({
    required this.scope,
    required this.pages,
    required this.permissions,
    required this.members,
  });

  final KnowledgeScope scope;
  final List<ProjectKnowledgePage> pages;
  final ProjectKnowledgePermissions permissions;
  final List<ProjectKnowledgeMember> members;

  factory ProjectKnowledgeCatalog.fromJson(Map<String, dynamic> json) {
    final rawPages = json['pages'];
    final rawMembers = json['members'];
    return ProjectKnowledgeCatalog(
      scope: json['scope'] is Map<String, dynamic>
          ? KnowledgeScope.fromJson(json['scope'] as Map<String, dynamic>)
          : const KnowledgeScope(companyId: 0, projectId: 0, ownerUserId: 0),
      pages: rawPages is List
          ? rawPages
              .whereType<Map<String, dynamic>>()
              .map(ProjectKnowledgePage.fromJson)
              .toList(growable: false)
          : const [],
      permissions: json['permissions'] is Map<String, dynamic>
          ? ProjectKnowledgePermissions.fromJson(
              json['permissions'] as Map<String, dynamic>)
          : const ProjectKnowledgePermissions(),
      members: rawMembers is List
          ? rawMembers
              .whereType<Map<String, dynamic>>()
              .map(ProjectKnowledgeMember.fromJson)
              .toList(growable: false)
          : const [],
    );
  }
}

/// 总结引用的原页摘引
class KnowledgeSummarySource {
  const KnowledgeSummarySource({
    required this.pageId,
    required this.title,
    required this.quote,
  });

  final int pageId;
  final String title;
  final String quote;

  factory KnowledgeSummarySource.fromJson(Map<String, dynamic> json) {
    return KnowledgeSummarySource(
      pageId: (json['page_id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?) ?? '',
      quote: (json['quote'] as String?) ?? '',
    );
  }
}

/// 本人项目知识总结草稿
class ProjectKnowledgeSummary {
  const ProjectKnowledgeSummary({
    required this.id,
    required this.title,
    required this.bodyText,
    this.sources = const [],
    this.pageIds = const [],
    this.status = 'draft',
    this.provider = '',
    this.modelSource = '',
    this.personalEntryId,
  });

  final int id;
  final String title;
  final String bodyText;
  final List<KnowledgeSummarySource> sources;
  final List<int> pageIds;
  final String status;
  final String provider;
  final String modelSource;
  final int? personalEntryId;

  bool get isSaved => status == 'saved';

  factory ProjectKnowledgeSummary.fromJson(Map<String, dynamic> json) {
    final rawSources = json['sources'];
    final rawPageIds = json['page_ids'];
    return ProjectKnowledgeSummary(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?) ?? '',
      bodyText: (json['body_text'] as String?) ?? '',
      sources: rawSources is List
          ? rawSources
              .whereType<Map<String, dynamic>>()
              .map(KnowledgeSummarySource.fromJson)
              .toList(growable: false)
          : const [],
      pageIds: rawPageIds is List
          ? rawPageIds
              .map((id) => (id as num?)?.toInt() ?? 0)
              .where((id) => id > 0)
              .toList(growable: false)
          : const [],
      status: (json['status'] as String?) ?? 'draft',
      provider: (json['provider'] as String?) ?? '',
      modelSource: (json['model_source'] as String?) ?? '',
      personalEntryId: (json['personal_entry_id'] as num?)?.toInt(),
    );
  }
}

/// 沉淀到个人知识的结果
class KnowledgeSaveResult {
  const KnowledgeSaveResult({required this.entry, required this.alreadySaved});

  final PersonalKnowledgeEntry entry;
  final bool alreadySaved;

  factory KnowledgeSaveResult.fromJson(Map<String, dynamic> json) {
    final entry = json['entry'];
    return KnowledgeSaveResult(
      entry: entry is Map<String, dynamic>
          ? PersonalKnowledgeEntry.fromJson(entry)
          : const PersonalKnowledgeEntry(id: 0, title: ''),
      alreadySaved: json['already_saved'] == true,
    );
  }
}

/// 采纳 AI 建议后的结果
class KnowledgeApplyResult {
  const KnowledgeApplyResult({required this.links, required this.created});

  final List<PersonalKnowledgeLink> links;
  final int created;

  factory KnowledgeApplyResult.fromJson(Map<String, dynamic> json) {
    final raw = json['links'];
    return KnowledgeApplyResult(
      links: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(PersonalKnowledgeLink.fromJson)
              .toList(growable: false)
          : const [],
      created: (json['created'] as num?)?.toInt() ?? 0,
    );
  }
}

/// 把标签文本（逗号、中文逗号或换行分隔）转成去重标签列表，与网页版一致
List<String> parseKnowledgeTags(String text) {
  final seen = <String>{};
  final result = <String>[];
  for (final raw in text.split(RegExp(r'[,，\n]'))) {
    final tag = raw.trim();
    if (tag.isEmpty || !seen.add(tag)) continue;
    result.add(tag);
  }
  return result;
}

/// 标题可不填：从正文首行生成，最长 60 个字符（对齐网页版）
String deriveKnowledgeTitle(String title, String bodyText) {
  final trimmed = title.trim();
  if (trimmed.isNotEmpty) return trimmed;
  final firstLine = bodyText.trim().split('\n').first.trim();
  return firstLine.length > 60 ? firstLine.substring(0, 60) : firstLine;
}
