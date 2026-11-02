import 'package:flutter/widgets.dart';

import '../../../core/auth/auth_state.dart';
import '../controllers/notification_poller.dart';

class NotificationBadgeScope extends InheritedNotifier<NotificationPoller> {
  const NotificationBadgeScope({
    super.key,
    required NotificationPoller poller,
    required super.child,
  }) : super(notifier: poller);

  static NotificationPoller? maybeOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<NotificationBadgeScope>()?.notifier;
}

class NotificationBadgeHost extends StatefulWidget {
  const NotificationBadgeHost(
      {super.key, required this.auth, required this.builder});
  final AuthState auth;
  final Widget Function(BuildContext, NotificationPoller) builder;

  @override
  State<NotificationBadgeHost> createState() => _NotificationBadgeHostState();
}

class _NotificationBadgeHostState extends State<NotificationBadgeHost> {
  late final NotificationPoller _poller = NotificationPoller(widget.auth);

  @override
  void dispose() {
    _poller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => NotificationBadgeScope(
        poller: _poller,
        child: AnimatedBuilder(
            animation: _poller,
            builder: (context, _) => widget.builder(context, _poller)),
      );
}
