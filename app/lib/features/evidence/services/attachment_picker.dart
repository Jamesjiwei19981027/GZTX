import '../models/evidence_models.dart';

/// 附件选择不可用的原因分类，供界面给出可操作的引导
enum AttachmentPickerIssue {
  /// 当前安装包尚未集成系统选择器（缺少共享依赖）
  unavailable,

  /// 用户主动取消
  cancelled,
}

/// 附件选择异常
class AttachmentPickerException implements Exception {
  AttachmentPickerException(this.issue, this.message);

  final AttachmentPickerIssue issue;
  final String message;

  @override
  String toString() => message;
}

/// 附件选择端口。
///
/// 真正的系统文件选择/拍照需要 `file_picker`、`image_picker` 依赖，
/// 属于共享改动，已写入回传报告的共享改动申请；本任务只定义端口并提供
/// 明确的不可用实现，绝不静默失败或伪造数据。
abstract class AttachmentPicker {
  Future<PickedAttachment?> pickFile();

  Future<PickedAttachment?> pickImage();

  /// 是否具备真实选择能力（界面据此提示）
  bool get isAvailable;
}

/// 未接入系统选择器时的实现
class UnavailableAttachmentPicker implements AttachmentPicker {
  const UnavailableAttachmentPicker();

  @override
  bool get isAvailable => false;

  @override
  Future<PickedAttachment?> pickFile() async => throw AttachmentPickerException(
        AttachmentPickerIssue.unavailable,
        '当前安装包尚未集成系统文件选择组件，暂时无法添加附件（已提交共享改动申请）。'
        '可先用文字材料提交。',
      );

  @override
  Future<PickedAttachment?> pickImage() async => throw AttachmentPickerException(
        AttachmentPickerIssue.unavailable,
        '当前安装包尚未集成拍照与相册组件，暂时无法选择图片（已提交共享改动申请）。',
      );
}
