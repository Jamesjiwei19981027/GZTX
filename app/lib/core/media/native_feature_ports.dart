import 'package:flutter/widgets.dart';

import '../../design/design.dart';
import '../../features/evidence/models/evidence_models.dart';
import '../../features/evidence/services/attachment_picker.dart';
import '../../features/messages/data/message_file_transfer.dart';
import 'system_media.dart';

class NativeAttachmentPicker implements AttachmentPicker {
  NativeAttachmentPicker(this.context);
  final BuildContext context;

  @override
  bool get isAvailable => true;

  PickedAttachment? _convert(SystemFile? file) => file == null
      ? null
      : PickedAttachment(
          name: file.name, bytes: file.bytes, mimeType: file.mimeType);

  @override
  Future<PickedAttachment?> pickFile() async {
    bool? useImage;
    await showAppActionSheet(
      context: context,
      title: '添加材料',
      actions: [
        AppActionSheetItem(label: '选择文件或音频', onPressed: () => useImage = false),
        AppActionSheetItem(label: '拍照或从相册选择', onPressed: () => useImage = true),
      ],
    );
    if (useImage == null || !context.mounted) return null;
    return useImage! ? pickImage() : _convert(await SystemMedia.pickFile());
  }

  @override
  Future<PickedAttachment?> pickImage() async =>
      _convert(await SystemMedia.pickImage(context));
}

class NativeMessageFilePicker implements MessageFilePicker {
  const NativeMessageFilePicker();

  @override
  bool get isAvailable => true;

  @override
  Future<PickedMessageFile?> pickFile() async {
    final file = await SystemMedia.pickFile();
    return file == null
        ? null
        : PickedMessageFile(
            name: file.name, bytes: file.bytes, mimeType: file.mimeType);
  }
}
