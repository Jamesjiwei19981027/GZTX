import '../features/projects/invite_link.dart';
import '../features/auth/auth_paths.dart';

/// Only the registered custom scheme and legacy in-app invite paths are read.
String? normalizeAppLink(Uri uri) {
  if (uri.scheme == 'worktodo') {
    if (uri.host == 'sso') {
      if (uri.path != '/callback' ||
          uri.hasQuery ||
          uri.userInfo.isNotEmpty ||
          uri.hasPort) {
        return null;
      }
      Map<String, List<String>> params;
      try {
        params = Uri(query: uri.fragment).queryParametersAll;
      } catch (_) {
        return null;
      }
      final tickets = params['sso_ticket'];
      if (params.length != 1 || tickets == null || tickets.length != 1) {
        return null;
      }
      final ticket = tickets.single;
      if (!RegExp(r'^[A-Za-z0-9_-]{20,256}$').hasMatch(ticket)) return null;
      return Uri(
          path: AuthPaths.ssoCallback,
          queryParameters: {'ticket': ticket}).toString();
    }
    if (uri.host != 'invite' || uri.pathSegments.length != 1) return null;
    final token = uri.pathSegments.single.trim();
    if (token.isEmpty || !isValidInviteToken(token)) return null;
    PendingInviteHolder.set(token);
    return inviteAcceptLocation(token);
  }
  if (uri.hasScheme || uri.hasAuthority) return null;
  if (uri.pathSegments.length == 2 && uri.pathSegments.first == 'invite') {
    final token = uri.pathSegments.last.trim();
    if (token.isEmpty || !isValidInviteToken(token)) return null;
    PendingInviteHolder.set(token);
    return inviteAcceptLocation(token);
  }
  if (uri.path.isEmpty || uri.path == '/') {
    final token = readInviteTokenFromQuery(uri.queryParameters);
    if (token != null) {
      PendingInviteHolder.set(token);
      return inviteAcceptLocation(token);
    }
  }
  return null;
}
