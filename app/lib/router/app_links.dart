import '../features/projects/invite_link.dart';

/// Only the registered custom scheme and legacy in-app invite paths are read.
String? normalizeAppLink(Uri uri) {
  if (uri.scheme == 'worktodo') {
    if (uri.host != 'invite' || uri.pathSegments.length != 1) return null;
    final token = uri.pathSegments.single.trim();
    return token.isEmpty ? null : inviteAcceptLocation(token);
  }
  if (uri.hasScheme || uri.hasAuthority) return null;
  if (uri.pathSegments.length == 2 && uri.pathSegments.first == 'invite') {
    final token = uri.pathSegments.last.trim();
    return token.isEmpty ? null : inviteAcceptLocation(token);
  }
  if (uri.path.isEmpty || uri.path == '/') {
    final token = readInviteTokenFromQuery(uri.queryParameters);
    if (token != null) return inviteAcceptLocation(token);
  }
  return null;
}
