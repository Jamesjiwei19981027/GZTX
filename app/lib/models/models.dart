class AppUser {
  AppUser({
    required this.id,
    required this.username,
    this.nickname,
    this.email,
    this.emailVerified = false,
    this.phoneVerified = false,
  });

  final int id;
  final String username;
  final String? nickname;
  final String? email;
  final bool emailVerified;
  final bool phoneVerified;

  String get displayName =>
      (nickname != null && nickname!.trim().isNotEmpty) ? nickname!.trim() : username;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as int,
      username: (json['username'] ?? '') as String,
      nickname: json['nickname'] as String?,
      email: json['email'] as String?,
      emailVerified: json['email_verified'] == true,
      phoneVerified: json['phone_verified'] == true,
    );
  }
}

class TaskItem {
  TaskItem({
    required this.id,
    required this.title,
    this.description,
    required this.status,
    required this.priority,
    this.statusLabel,
    this.priorityLabel,
    this.dueDate,
  });

  final int id;
  final String title;
  final String? description;
  final int status;
  final int priority;
  final String? statusLabel;
  final String? priorityLabel;
  final String? dueDate;

  bool get isDone => status == 2;

  factory TaskItem.fromJson(Map<String, dynamic> json) {
    return TaskItem(
      id: json['id'] as int,
      title: (json['title'] ?? '') as String,
      description: json['description'] as String?,
      status: (json['status'] as num?)?.toInt() ?? 0,
      priority: (json['priority'] as num?)?.toInt() ?? 1,
      statusLabel: json['status_label'] as String?,
      priorityLabel: json['priority_label'] as String?,
      dueDate: json['due_date'] as String?,
    );
  }
}

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.code});

  final String message;
  final int? statusCode;
  final int? code;

  @override
  String toString() => message;
}
