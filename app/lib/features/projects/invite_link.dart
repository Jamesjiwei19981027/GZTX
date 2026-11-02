/// 邀请链接与深链接地址构造
///
/// 网页真源：`frontend/src/utils/invite.ts`
/// - 网页分享链接：`{origin}/?invite={token}`（大小写不敏感，token 需 URL 编码）
/// - 原生 App 内部路由：`/projects/invite/accept?token={token}`
///
/// 正式域名与 iOS Universal Links / 安卓 App Links 的系统级注册由 T10 统一配置，
/// 这里只提供链接构造与路由地址，便于 T10 在链接入口处直接复用。
library;

/// 邀请链接基地址，可用 `--dart-define=INVITE_LINK_BASE=https://...` 覆盖
const String kInviteLinkBase = String.fromEnvironment(
  'INVITE_LINK_BASE',
  defaultValue: 'worktodo://invite/',
);

/// 分享给同事的邀请链接（接受方点开后进入网页版或原生深链接）
String buildInviteLink(String token) {
  if (Uri.parse(kInviteLinkBase).scheme == 'worktodo') {
    return Uri(scheme: 'worktodo', host: 'invite', pathSegments: [token])
        .toString();
  }
  final base =
      kInviteLinkBase.endsWith('/') ? kInviteLinkBase : '$kInviteLinkBase/';
  return Uri.parse(base).replace(
    queryParameters: {'invite': token},
  ).toString();
}

/// 原生 App 内接受邀请的页面地址
String inviteAcceptLocation(String token) {
  return Uri(
    path: '/projects/invite/accept',
    queryParameters: {'token': token},
  ).toString();
}

/// 从深链接查询参数中取出邀请令牌（`?invite=` 或 `?token=`）
String? readInviteTokenFromQuery(Map<String, String> query) {
  for (final key in const ['token', 'invite']) {
    final value = query[key]?.trim();
    if (value != null && value.isNotEmpty) return value;
  }
  return null;
}
