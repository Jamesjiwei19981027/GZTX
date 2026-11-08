/// T05 材料与项目知识库数据模型
///
/// 字段与后端 `_pkg_dto`（`backend/app/api/v1/nodes.py`）、
/// 项目知识 `entry_dto`（`backend/app/services/project_wiki.py`）、
/// 检索结果（`backend/app/services/knowledge/search.py`）保持一致。
library;

/// 材料类型中文文案
const Map<String, String> evidenceKindLabels = {
  'document': '文档',
  'figma': '设计稿',
  'commit': '代码提交',
  'log': '日志',
  'delivery': '交付物',
};

/// 材料包状态中文文案
const Map<String, String> evidenceStatusLabels = {
  'draft': '草稿',
  'submitted': '已提交',
  'pending': '待验收',
  'pending_review': '待负责人确认',
  'adopted': '已采纳',
  'rejected': '已驳回',
  'superseded': '已被替代',
};

/// 后台任务状态中文文案
const Map<String, String> jobStatusLabels = {
  'pending': '排队处理中',
  'running': '正在处理',
  'succeeded': '处理完成',
  'failed': '处理失败',
};

String evidenceKindLabel(String? kind) =>
    evidenceKindLabels[kind] ?? (kind == null || kind.isEmpty ? '材料' : kind);

String evidenceStatusLabel(String? status) =>
    evidenceStatusLabels[status] ?? '未知状态';

String jobStatusLabel(String? status) => jobStatusLabels[status] ?? '处理中';

/// 文件大小展示，对齐网页版 `(size / 1024 / 1024).toFixed(1) MB / KB`
String formatFileSize(int? bytes) {
  if (bytes == null || bytes <= 0) return '大小未知';
  if (bytes > 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  final kb = (bytes / 1024).round();
  return '${kb < 1 ? 1 : kb} KB';
}

/// 单个文件的分类（对齐 `frontend/src/utils/evidenceFiles.ts`）
String classifyEvidenceFile(String name, String? mimeType) {
  final dot = name.lastIndexOf('.');
  final extension =
      dot >= 0 && dot < name.length - 1 ? name.substring(dot + 1).toLowerCase() : '';
  if (extension == 'fig' || extension == 'sketch') return 'figma';
  if (extension == 'log') return 'log';
  if (RegExp(r'^(ts|tsx|js|jsx|py|java|go|rs|c|cpp|h|css|html|sql|patch|diff)$')
      .hasMatch(extension)) {
    return 'commit';
  }
  if (RegExp(r'^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|rtf|odt)$')
          .hasMatch(extension) ||
      (mimeType?.startsWith('text/') ?? false)) {
    return 'document';
  }
  return 'delivery';
}

/// 推断材料类型：全部同类型取该类型，混合则视为交付物，无文件视为文档。
/// 与网页版 `inferEvidenceKind` 行为一致。
String inferEvidenceKind(List<EvidenceFileRef> files) {
  if (files.isEmpty) return 'document';
  final kinds = files
      .map((file) => classifyEvidenceFile(file.name, file.mimeType))
      .toList(growable: false);
  final first = kinds.first;
  final allSame = kinds.every((kind) => kind == first);
  return allSame ? first : 'delivery';
}

/// 材料包内的文件
class EvidenceFileRef {
  const EvidenceFileRef({
    required this.fileId,
    required this.name,
    this.mimeType,
    this.sizeBytes,
    this.kind,
  });

  final int fileId;
  final String name;
  final String? mimeType;
  final int? sizeBytes;
  final String? kind;

  String get sizeLabel => formatFileSize(sizeBytes);

  String get typeLabel {
    final label = evidenceKindLabel(classifyEvidenceFile(name, mimeType));
    return '$label · $sizeLabel';
  }

  factory EvidenceFileRef.fromJson(Map<String, dynamic> json) {
    return EvidenceFileRef(
      fileId: (json['file_id'] as num?)?.toInt() ?? 0,
      name: (json['original_name'] as String?)?.trim().isNotEmpty == true
          ? json['original_name'] as String
          : '未命名文件',
      mimeType: json['mime_type'] as String?,
      sizeBytes: (json['size_bytes'] as num?)?.toInt(),
      kind: json['kind'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'file_id': fileId,
        'name': name,
        'mime_type': mimeType,
        'size_bytes': sizeBytes,
        'kind': kind,
      };
}

/// 材料包详情
class EvidencePackage {
  const EvidencePackage({
    required this.id,
    required this.nodeId,
    required this.projectId,
    this.status,
    this.summaryText,
    this.evidenceKind,
    this.submitterUserId,
    this.files = const [],
    this.submittedAt,
    this.judgedAt,
    this.precheckErrors = const [],
    this.judgeResult,
  });

  final int id;
  final int nodeId;
  final int projectId;
  final String? status;
  final String? summaryText;
  final String? evidenceKind;
  final int? submitterUserId;
  final List<EvidenceFileRef> files;
  final String? submittedAt;
  final String? judgedAt;
  final List<String> precheckErrors;
  final Map<String, dynamic>? judgeResult;

  String get statusLabel => evidenceStatusLabel(status);

  String get kindLabel => evidenceKindLabel(evidenceKind);

  bool get isRejected => status == 'rejected' || status == 'superseded';

  factory EvidencePackage.fromJson(Map<String, dynamic> json) {
    final rawFiles = json['files'];
    final files = <EvidenceFileRef>[];
    if (rawFiles is List) {
      for (final item in rawFiles) {
        if (item is Map<String, dynamic>) {
          files.add(EvidenceFileRef.fromJson(item));
        } else if (item is Map) {
          files.add(EvidenceFileRef.fromJson(item.cast<String, dynamic>()));
        }
      }
    }
    final rawPrecheck = json['precheck_errors'];
    final precheck = <String>[];
    if (rawPrecheck is List) {
      for (final item in rawPrecheck) {
        if (item is String) {
          precheck.add(item);
        } else if (item is Map && item['message'] is String) {
          precheck.add(item['message'] as String);
        }
      }
    }
    final structured = json['structured'];
    final kindFromStructured = structured is Map
        ? structured['evidence_kind'] as String?
        : null;
    return EvidencePackage(
      id: (json['id'] as num?)?.toInt() ?? 0,
      nodeId: (json['node_id'] as num?)?.toInt() ?? 0,
      projectId: (json['project_id'] as num?)?.toInt() ?? 0,
      status: json['status'] as String?,
      summaryText: json['summary_text'] as String?,
      evidenceKind: (json['evidence_kind'] as String?) ?? kindFromStructured,
      submitterUserId: (json['submitter_user_id'] as num?)?.toInt(),
      files: files,
      submittedAt: json['submitted_at'] as String?,
      judgedAt: json['judged_at'] as String?,
      precheckErrors: precheck,
      judgeResult: json['judge_result'] is Map<String, dynamic>
          ? json['judge_result'] as Map<String, dynamic>
          : null,
    );
  }
}

/// 提交材料后的返回
class SubmitOutcome {
  const SubmitOutcome({required this.packageId, this.status, this.jobId});

  final int packageId;
  final String? status;
  final String? jobId;

  factory SubmitOutcome.fromJson(Map<String, dynamic> json) {
    return SubmitOutcome(
      packageId: (json['package_id'] as num?)?.toInt() ??
          (json['id'] as num?)?.toInt() ??
          0,
      status: json['status'] as String?,
      jobId: json['job_id']?.toString(),
    );
  }
}

/// 后台任务状态
class BackgroundJob {
  const BackgroundJob({
    required this.jobId,
    required this.status,
    this.errorMessage,
  });

  final String jobId;
  final String status;
  final String? errorMessage;

  bool get isTerminal => status == 'succeeded' || status == 'failed';

  bool get isSucceeded => status == 'succeeded';

  bool get isFailed => status == 'failed';

  String get statusLabel => isFailed
      ? (errorMessage?.trim().isNotEmpty == true
          ? '处理失败：$errorMessage'
          : jobStatusLabel(status))
      : jobStatusLabel(status);

  factory BackgroundJob.fromJson(Map<String, dynamic> json) {
    return BackgroundJob(
      jobId: json['job_id']?.toString() ?? '',
      status: json['status'] as String? ?? 'pending',
      errorMessage: json['error_message'] as String?,
    );
  }
}

/// 已上传到服务端的文件（提交前暂存）
class UploadedEvidenceFile {
  const UploadedEvidenceFile({
    required this.fileId,
    required this.name,
    required this.sizeBytes,
    this.mimeType,
  });

  final int fileId;
  final String name;
  final int sizeBytes;
  final String? mimeType;

  String get sizeLabel => formatFileSize(sizeBytes);

  EvidenceFileRef toRef() => EvidenceFileRef(
        fileId: fileId,
        name: name,
        mimeType: mimeType,
        sizeBytes: sizeBytes,
      );

  Map<String, dynamic> toJson() => {
        'file_id': fileId,
        'name': name,
        'size_bytes': sizeBytes,
        'mime_type': mimeType,
      };

  factory UploadedEvidenceFile.fromJson(Map<String, dynamic> json) {
    return UploadedEvidenceFile(
      fileId: (json['file_id'] as num?)?.toInt() ?? 0,
      name: json['name'] as String? ?? '未命名文件',
      sizeBytes: (json['size_bytes'] as num?)?.toInt() ?? 0,
      mimeType: json['mime_type'] as String?,
    );
  }
}

/// 本地离线草稿（文字 + 已上传文件）
class EvidenceDraft {
  const EvidenceDraft({
    required this.summary,
    required this.files,
    required this.savedAt,
  });

  final String summary;
  final List<UploadedEvidenceFile> files;
  final DateTime savedAt;

  bool get isNotEmpty => summary.trim().isNotEmpty || files.isNotEmpty;

  Map<String, dynamic> toJson() => {
        'summary': summary,
        'files': files.map((file) => file.toJson()).toList(),
        'saved_at': savedAt.toUtc().toIso8601String(),
        'version': 1,
      };

  factory EvidenceDraft.fromJson(Map<String, dynamic> json) {
    final rawFiles = json['files'];
    final files = <UploadedEvidenceFile>[];
    if (rawFiles is List) {
      for (final item in rawFiles) {
        if (item is Map<String, dynamic>) {
          files.add(UploadedEvidenceFile.fromJson(item));
        } else if (item is Map) {
          files.add(UploadedEvidenceFile.fromJson(item.cast<String, dynamic>()));
        }
      }
    }
    return EvidenceDraft(
      summary: json['summary'] as String? ?? '',
      files: files,
      savedAt: DateTime.tryParse(json['saved_at'] as String? ?? '')?.toLocal() ??
          DateTime.now(),
    );
  }
}

/// 选中待上传的本地附件
class PickedAttachment {
  const PickedAttachment({
    required this.name,
    required this.bytes,
    required this.mimeType,
  });

  final String name;
  final List<int> bytes;
  final String mimeType;

  int get sizeBytes => bytes.length;
}

/// 知识库事实来源
class WikiFact {
  const WikiFact({
    required this.text,
    required this.quote,
    this.sourceName,
    this.sourceId,
    this.packageId,
    this.lineStart,
    this.lineEnd,
  });

  final String text;
  final String quote;
  final String? sourceName;
  final String? sourceId;
  final int? packageId;
  final int? lineStart;
  final int? lineEnd;

  String get quotePreview => quote.trim().isEmpty ? text : quote;

  String get lineLabel {
    if (lineStart == null && lineEnd == null) return '原文引述';
    return '原文引述（第 $lineStart—$lineEnd 行）';
  }

  factory WikiFact.fromJson(Map<String, dynamic> json) {
    return WikiFact(
      text: json['text'] as String? ?? '',
      quote: json['quote'] as String? ?? '',
      sourceName: json['source_name'] as String?,
      sourceId: json['source_id']?.toString(),
      packageId: (json['package_id'] as num?)?.toInt(),
      lineStart: (json['line_start'] as num?)?.toInt(),
      lineEnd: (json['line_end'] as num?)?.toInt(),
    );
  }
}

/// 知识库条目（已发布页或草稿）
class WikiPage {
  const WikiPage({
    required this.id,
    required this.title,
    this.bodyText,
    this.source,
    this.nodeId,
    this.updatedAt,
    this.facts = const [],
    this.revision,
    this.topic,
  });

  final int id;
  final String title;
  final String? bodyText;
  final String? source;
  final int? nodeId;
  final String? updatedAt;
  final List<WikiFact> facts;
  final int? revision;
  final String? topic;

  bool get isDraft => source == 'llm_wiki_draft' || source == 'draft';

  /// 后端两种引用格式都要读：已发布页写在 `meta.facts`，草稿由
  /// `generate_draft` 写在 `meta.proposals[].facts`，这里按出现顺序展平。
  factory WikiPage.fromJson(Map<String, dynamic> json) {
    final meta = json['meta'] is Map
        ? (json['meta'] as Map).cast<String, dynamic>()
        : const <String, dynamic>{};
    final facts = <WikiFact>[];
    _collectFacts(meta['facts'], facts);
    final proposals = meta['proposals'];
    if (proposals is List) {
      for (final proposal in proposals) {
        if (proposal is Map) _collectFacts(proposal['facts'], facts);
      }
    }
    return WikiPage(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? json['title'] as String
          : '未命名知识页',
      bodyText: json['body_text'] as String?,
      source: json['source'] as String?,
      nodeId: (json['node_id'] as num?)?.toInt(),
      updatedAt: json['updated_at'] as String?,
      facts: facts,
      revision: (meta['revision'] as num?)?.toInt(),
      topic: meta['topic_key'] as String? ?? meta['topic'] as String?,
    );
  }

  static void _collectFacts(Object? raw, List<WikiFact> target) {
    if (raw is! List) return;
    for (final item in raw) {
      if (item is Map) {
        target.add(WikiFact.fromJson(item.cast<String, dynamic>()));
      }
    }
  }
}

/// 可整理为草稿的来源材料
class WikiMaterial {
  const WikiMaterial({
    required this.id,
    required this.title,
    this.nodeId,
    this.status,
    this.canGenerate = false,
  });

  final int id;
  final String title;
  final int? nodeId;
  final String? status;
  final bool canGenerate;

  String get statusLabel => evidenceStatusLabel(status);

  factory WikiMaterial.fromJson(Map<String, dynamic> json) {
    return WikiMaterial(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: (json['title'] as String?)?.trim().isNotEmpty == true
          ? json['title'] as String
          : '材料 #${json['id']}',
      nodeId: (json['node_id'] as num?)?.toInt(),
      status: json['status'] as String?,
      canGenerate: json['can_generate'] == true,
    );
  }
}

/// 项目知识库目录
class WikiCatalog {
  const WikiCatalog({
    required this.engine,
    required this.canPublish,
    this.pages = const [],
    this.drafts = const [],
    this.materials = const [],
  });

  final String engine;
  final bool canPublish;
  final List<WikiPage> pages;
  final List<WikiPage> drafts;
  final List<WikiMaterial> materials;

  /// 优先选 `can_generate` 的材料，否则回退第一条（对齐网页版）
  WikiMaterial? get preferredMaterial {
    if (materials.isEmpty) return null;
    for (final material in materials) {
      if (material.canGenerate) return material;
    }
    return materials.first;
  }

  WikiPage? draftById(int id) {
    for (final draft in drafts) {
      if (draft.id == id) return draft;
    }
    return null;
  }

  factory WikiCatalog.fromJson(Map<String, dynamic> json) {
    List<T> parseList<T>(dynamic raw, T Function(Map<String, dynamic>) build) {
      final out = <T>[];
      if (raw is List) {
        for (final item in raw) {
          if (item is Map<String, dynamic>) {
            out.add(build(item));
          } else if (item is Map) {
            out.add(build(item.cast<String, dynamic>()));
          }
        }
      }
      return out;
    }

    return WikiCatalog(
      engine: json['engine'] as String? ?? '',
      canPublish: json['can_publish'] == true,
      pages: parseList(json['pages'], WikiPage.fromJson),
      drafts: parseList(json['drafts'], WikiPage.fromJson),
      materials: parseList(json['materials'], WikiMaterial.fromJson),
    );
  }
}

/// 项目知识检索命中
class KnowledgeHit {
  const KnowledgeHit({
    required this.chunkId,
    required this.chunkText,
    required this.sourceType,
    required this.sourceId,
    this.score,
  });

  final int chunkId;
  final String chunkText;
  final String sourceType;
  final int sourceId;
  final double? score;

  /// 后端索引器写入的来源类型：`evidence_file`、`wiki_entry`
  /// （见 `backend/app/services/knowledge/indexer.py`）。
  String get sourceLabel => switch (sourceType) {
        'evidence' || 'evidence_file' || 'evidence_package' => '材料',
        'task' => '任务',
        'wiki' || 'wiki_entry' || 'llm_wiki' => '知识',
        _ => '资料',
      };

  factory KnowledgeHit.fromJson(Map<String, dynamic> json) {
    return KnowledgeHit(
      chunkId: (json['chunk_id'] as num?)?.toInt() ?? 0,
      chunkText: json['chunk_text'] as String? ?? '',
      sourceType: json['source_type'] as String? ?? '',
      sourceId: (json['source_id'] as num?)?.toInt() ?? 0,
      score: (json['score'] as num?)?.toDouble(),
    );
  }
}
