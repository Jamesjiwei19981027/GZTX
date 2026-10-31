/// 当前用户信息模型
class User {
  const User({
    required this.id,
    required this.username,
    this.nickname,
    this.avatarUrl,
    this.email,
    this.phone,
    this.emailVerified = false,
    this.phoneVerified = false,
    this.notifyPref = const {},
    this.createdAt,
  });

  final int id;
  final String username;
  final String? nickname;
  final String? avatarUrl;
  final String? email;
  final String? phone;
  final bool emailVerified;
  final bool phoneVerified;
  final Map<String, dynamic> notifyPref;
  final String? createdAt;

  String get displayName {
    if (nickname != null && nickname!.trim().isNotEmpty) {
      return nickname!.trim();
    }
    return username;
  }

  bool get isFullyVerified => emailVerified && phoneVerified;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: (json['id'] as num?)?.toInt() ?? 0,
      username: (json['username'] as String?) ?? '',
      nickname: json['nickname'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      emailVerified: json['email_verified'] == true,
      phoneVerified: json['phone_verified'] == true,
      notifyPref: json['notify_pref'] is Map<String, dynamic>
          ? json['notify_pref'] as Map<String, dynamic>
          : const {},
      createdAt: json['created_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'nickname': nickname,
        'avatar_url': avatarUrl,
        'email': email,
        'phone': phone,
        'email_verified': emailVerified,
        'phone_verified': phoneVerified,
        'notify_pref': notifyPref,
        'created_at': createdAt,
      };
}
