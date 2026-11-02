import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:share_plus/share_plus.dart';

import '../../design/design.dart';

class SystemFile {
  const SystemFile(this.name, this.bytes, this.mimeType);
  final String name;
  final Uint8List bytes;
  final String mimeType;
}

class SystemMedia {
  static Future<SystemFile?> pickFile({bool audioOnly = false}) async {
    final file = await FilePicker.pickFile(
      type: audioOnly ? FileType.audio : FileType.any,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      throw StateError('文件内容为空或无法读取，请重新选择');
    }
    return SystemFile(file.name, bytes,
        lookupMimeType(file.name) ?? 'application/octet-stream');
  }

  static Future<SystemFile?> pickImage(BuildContext context) async {
    ImageSource? source;
    await showAppActionSheet(
      context: context,
      title: '选择图片',
      actions: [
        AppActionSheetItem(
          label: '从相册选择',
          onPressed: () => source = ImageSource.gallery,
        ),
        AppActionSheetItem(
          label: '拍照',
          onPressed: () => source = ImageSource.camera,
        ),
      ],
    );
    if (source == null) return null;
    final image = await ImagePicker().pickImage(
      source: source!,
      maxWidth: 2400,
      maxHeight: 2400,
      imageQuality: 90,
      requestFullMetadata: false,
    );
    if (image == null) return null;
    return SystemFile(image.name, await image.readAsBytes(),
        lookupMimeType(image.name) ?? 'image/jpeg');
  }

  static Future<void> shareInvite(String link, BuildContext context) async {
    try {
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(ShareParams(
        text: link,
        subject: '邀请加入协同项目',
        sharePositionOrigin:
            box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      ));
    } catch (error) {
      if (!context.mounted) return;
      showAppToast(context, '系统分享失败：$error', type: ToastType.error);
    }
  }
}
