import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import 'adaptive_base.dart';

/// 自适应文本输入框（支持多行自增高、清除按钮、前后缀）
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    this.controller,
    this.initialValue,
    this.placeholder,
    this.label,
    this.errorText,
    this.prefix,
    this.suffix,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.minLines,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.enabled = true,
    this.autofocus = false,
    this.clearButtonEnabled = true,
  });

  final TextEditingController? controller;
  final String? initialValue;
  final String? placeholder;
  final String? label;
  final String? errorText;
  final Widget? prefix;
  final Widget? suffix;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final int? minLines;
  final int? maxLines;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final bool autofocus;
  final bool clearButtonEnabled;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late TextEditingController _effectiveController;
  bool _showClear = false;

  @override
  void initState() {
    super.initState();
    _effectiveController = widget.controller ??
        TextEditingController(text: widget.initialValue);
    _effectiveController.addListener(_handleTextChanged);
    _showClear = _effectiveController.text.isNotEmpty;
  }

  /// 同一位置复用本组件但换了外部控制器时（如表单切换），必须跟着换，否则输入会写进旧控制器
  @override
  void didUpdateWidget(covariant AppTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.controller == oldWidget.controller) return;
    _effectiveController.removeListener(_handleTextChanged);
    if (oldWidget.controller == null) {
      _effectiveController.dispose();
    }
    _effectiveController = widget.controller ??
        TextEditingController(text: widget.initialValue);
    _effectiveController.addListener(_handleTextChanged);
    _showClear = _effectiveController.text.isNotEmpty;
  }

  @override
  void dispose() {
    _effectiveController.removeListener(_handleTextChanged);
    if (widget.controller == null) {
      _effectiveController.dispose();
    }
    super.dispose();
  }

  void _handleTextChanged() {
    final hasText = _effectiveController.text.isNotEmpty;
    if (_showClear != hasText) {
      setState(() => _showClear = hasText);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);

    Widget? clearBtn;
    if (widget.clearButtonEnabled && _showClear && widget.enabled) {
      clearBtn = GestureDetector(
        onTap: () {
          _effectiveController.clear();
          widget.onChanged?.call('');
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          child: Icon(
            isIos ? CupertinoIcons.clear_thick_circled : Icons.cancel,
            size: 18,
            color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
          ),
        ),
      );
    }

    final suffixWidget = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (clearBtn != null) clearBtn,
        if (widget.suffix != null) widget.suffix!,
      ],
    );

    if (isIos) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.label != null) ...[
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 6),
              child: Text(
                widget.label!,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
            ),
          ],
          CupertinoTextField(
            controller: _effectiveController,
            placeholder: widget.placeholder,
            obscureText: widget.obscureText,
            keyboardType: widget.keyboardType,
            textInputAction: widget.textInputAction,
            minLines: widget.minLines,
            maxLines: widget.maxLines,
            enabled: widget.enabled,
            autofocus: widget.autofocus,
            onChanged: widget.onChanged,
            onSubmitted: widget.onSubmitted,
            prefix: widget.prefix != null
                ? Padding(
                    padding: const EdgeInsets.only(left: AppSpacing.md),
                    child: widget.prefix,
                  )
                : null,
            suffix: suffixWidget,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            style: TextStyle(
              fontSize: 15,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
            placeholderStyle: TextStyle(
              fontSize: 15,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurfaceVariant : const Color(0xFFF1F3F5),
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: widget.errorText != null
                  ? Border.all(color: AppColors.danger, width: 1.5)
                  : null,
            ),
          ),
          if (widget.errorText != null) ...[
            Padding(
              padding: const EdgeInsets.only(left: 4, top: 4),
              child: Text(
                widget.errorText!,
                style: const TextStyle(fontSize: 12, color: AppColors.danger),
              ),
            ),
          ],
        ],
      );
    }

    // Android Material 3 风格
    return TextFormField(
      controller: _effectiveController,
      obscureText: widget.obscureText,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      minLines: widget.minLines,
      maxLines: widget.maxLines,
      enabled: widget.enabled,
      autofocus: widget.autofocus,
      onChanged: widget.onChanged,
      onFieldSubmitted: widget.onSubmitted,
      style: TextStyle(
        fontSize: 15,
        color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
      ),
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.placeholder,
        errorText: widget.errorText,
        prefixIcon: widget.prefix,
        suffixIcon: suffixWidget,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        filled: true,
        fillColor: isDark ? AppColors.darkSurfaceVariant : AppColors.background,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.border,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.border,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
      ),
    );
  }
}
