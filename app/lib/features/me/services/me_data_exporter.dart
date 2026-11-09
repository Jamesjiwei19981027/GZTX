import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/errors/app_error.dart';

/// 私有目录保留一份导出文件，并交给系统分享另存；无需申请整个存储空间的权限。
class MeDataExporter {
  MeDataExporter({
    Future<Directory> Function()? directory,
    Future<ShareResult> Function(ShareParams)? share,
  })  : _directory = directory ?? getApplicationDocumentsDirectory,
        _share = share ?? SharePlus.instance.share;

  final Future<Directory> Function() _directory;
  final Future<ShareResult> Function(ShareParams) _share;

  Future<String> saveAndShare(Map<String, dynamic> data, {Rect? origin}) async {
    final root = await _directory();
    final folder =
        await Directory('${root.path}/exports').create(recursive: true);
    final file = File(
        '${folder.path}/我的数据-${DateTime.now().microsecondsSinceEpoch}.json');
    await file.writeAsString(const JsonEncoder.withIndent('  ').convert(data),
        encoding: utf8, flush: true);
    try {
      final result = await _share(ShareParams(
        files: [XFile(file.path, mimeType: 'application/json')],
        subject: '我的数据导出',
        sharePositionOrigin: origin,
      ));
      return '文件已保存到应用目录：${file.path}。'
          '${result.status == ShareResultStatus.dismissed ? '已取消分享，可再次导出后另存。' : '可通过系统分享另存到手机下载目录。'}';
    } catch (_) {
      throw ApiException('文件已保存到应用目录：${file.path}；系统分享未能打开，请重试');
    }
  }
}
