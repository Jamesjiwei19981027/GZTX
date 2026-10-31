import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'adaptive_base.dart';

/// 统一自适应图标组件，对齐前端 `frontend/src/mobile/ui/AppIcon.tsx`
class AppIcon extends StatelessWidget {
  const AppIcon(
    this.name, {
    super.key,
    this.size = 20,
    this.color,
  });

  final String name;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final iconData = _resolveIcon(name, isIos);
    return Icon(iconData, size: size, color: color);
  }

  static IconData _resolveIcon(String name, bool isIos) {
    switch (name) {
      case 'back':
      case 'chevron-left':
        return isIos ? CupertinoIcons.chevron_back : Icons.arrow_back;
      case 'chevron-right':
        return isIos ? CupertinoIcons.chevron_forward : Icons.chevron_right;
      case 'chevron-down':
        return isIos ? CupertinoIcons.chevron_down : Icons.keyboard_arrow_down;
      case 'chevron-up':
        return isIos ? CupertinoIcons.chevron_up : Icons.keyboard_arrow_up;
      case 'close':
      case 'x':
        return isIos ? CupertinoIcons.xmark : Icons.close;
      case 'check':
        return isIos ? CupertinoIcons.check_mark : Icons.check;
      case 'check-circle':
        return isIos ? CupertinoIcons.check_mark_circled : Icons.check_circle_outline;
      case 'plus':
        return isIos ? CupertinoIcons.plus : Icons.add;
      case 'search':
        return isIos ? CupertinoIcons.search : Icons.search;
      case 'filter':
        return isIos ? CupertinoIcons.slider_horizontal_3 : Icons.filter_list;
      case 'sliders':
        return isIos ? CupertinoIcons.tuningfork : Icons.tune;
      case 'work':
        return isIos ? CupertinoIcons.briefcase_fill : Icons.work;
      case 'axis':
        return isIos ? CupertinoIcons.tuningfork : Icons.account_tree;
      case 'knowledge':
        return isIos ? CupertinoIcons.book_fill : Icons.menu_book;
      case 'ai':
        return isIos ? CupertinoIcons.sparkles : Icons.auto_awesome;
      case 'messages':
        return isIos ? CupertinoIcons.chat_bubble_2_fill : Icons.chat;
      case 'me':
        return isIos ? CupertinoIcons.person_crop_circle : Icons.person;
      case 'calendar':
        return isIos ? CupertinoIcons.calendar : Icons.calendar_month;
      case 'kanban':
        return isIos ? CupertinoIcons.square_grid_2x2 : Icons.view_kanban;
      case 'reports':
      case 'stats':
        return isIos ? CupertinoIcons.chart_bar_alt_fill : Icons.bar_chart;
      case 'trash':
        return isIos ? CupertinoIcons.trash : Icons.delete_outline;
      case 'settings':
        return isIos ? CupertinoIcons.settings : Icons.settings;
      case 'bell':
        return isIos ? CupertinoIcons.bell : Icons.notifications_none;
      case 'user':
        return isIos ? CupertinoIcons.person : Icons.person_outline;
      case 'team':
        return isIos ? CupertinoIcons.person_3 : Icons.group;
      case 'edit':
        return isIos ? CupertinoIcons.pencil : Icons.edit;
      case 'more':
        return isIos ? CupertinoIcons.ellipsis_vertical : Icons.more_vert;
      case 'more-horizontal':
        return isIos ? CupertinoIcons.ellipsis : Icons.more_horiz;
      case 'alert':
      case 'warning':
        return isIos ? CupertinoIcons.exclamationmark_triangle : Icons.warning_amber_rounded;
      case 'info':
        return isIos ? CupertinoIcons.info_circle : Icons.info_outline;
      case 'help':
        return isIos ? CupertinoIcons.question_circle : Icons.help_outline;
      case 'send':
        return isIos ? CupertinoIcons.paperplane : Icons.send;
      case 'phone':
        return isIos ? CupertinoIcons.phone : Icons.phone;
      case 'video':
        return isIos ? CupertinoIcons.videocam : Icons.videocam;
      case 'mail':
        return isIos ? CupertinoIcons.mail : Icons.mail_outline;
      case 'pin':
        return isIos ? CupertinoIcons.pin : Icons.push_pin;
      case 'archive':
        return isIos ? CupertinoIcons.archivebox : Icons.archive;
      case 'undo':
        return isIos ? CupertinoIcons.arrow_counterclockwise : Icons.undo;
      case 'thumbs-up':
        return isIos ? CupertinoIcons.hand_thumbsup : Icons.thumb_up_alt_outlined;
      case 'paperclip':
        return isIos ? CupertinoIcons.paperclip : Icons.attach_file;
      case 'eye':
        return isIos ? CupertinoIcons.eye : Icons.visibility;
      case 'eye-off':
        return isIos ? CupertinoIcons.eye_slash : Icons.visibility_off;
      case 'logout':
        return isIos ? CupertinoIcons.square_arrow_right : Icons.logout;
      case 'folder':
        return isIos ? CupertinoIcons.folder : Icons.folder_outlined;
      case 'file':
        return isIos ? CupertinoIcons.doc : Icons.description_outlined;
      case 'lock':
        return isIos ? CupertinoIcons.lock : Icons.lock_outline;
      case 'refresh':
        return isIos ? CupertinoIcons.refresh : Icons.refresh;
      case 'share':
        return isIos ? CupertinoIcons.share : Icons.share;
      case 'copy':
        return isIos ? CupertinoIcons.doc_on_doc : Icons.copy;
      case 'clock':
        return isIos ? CupertinoIcons.clock : Icons.access_time;
      case 'arrow-right':
        return isIos ? CupertinoIcons.arrow_right : Icons.arrow_forward;
      case 'shield':
        return isIos ? CupertinoIcons.shield : Icons.shield_outlined;
      case 'key':
        return isIos ? CupertinoIcons.lock : Icons.vpn_key;
      case 'cpu':
        return isIos ? CupertinoIcons.cube : Icons.memory;
      case 'mic':
        return isIos ? CupertinoIcons.mic : Icons.mic;
      case 'server':
        return isIos ? CupertinoIcons.tray_2 : Icons.dns;
      case 'smartphone':
        return isIos ? CupertinoIcons.device_phone_portrait : Icons.smartphone;
      case 'globe':
        return isIos ? CupertinoIcons.globe : Icons.public;
      case 'palette':
        return isIos ? CupertinoIcons.paintbrush : Icons.palette_outlined;
      case 'card':
        return isIos ? CupertinoIcons.creditcard : Icons.credit_card;
      case 'wifi':
        return isIos ? CupertinoIcons.wifi : Icons.wifi;
      case 'wifi-off':
        return isIos ? CupertinoIcons.wifi_slash : Icons.wifi_off;
      case 'database':
        return isIos ? CupertinoIcons.square_stack_3d_up : Icons.storage;
      default:
        return isIos ? CupertinoIcons.circle : Icons.circle_outlined;
    }
  }
}
