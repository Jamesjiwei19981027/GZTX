/// 企业成员管理使用企业身份，不把项目负责人角色写入企业角色。
class CompanyMember {
  const CompanyMember({
    required this.userId,
    required this.name,
    required this.status,
    required this.employmentStatus,
    required this.isSuperAdmin,
    required this.isOrgLeader,
  });

  final int userId;
  final String name;
  final String status;
  final String employmentStatus;
  final bool isSuperAdmin;
  final bool isOrgLeader;

  factory CompanyMember.fromJson(Map<String, dynamic> json) => CompanyMember(
        userId: (json['user_id'] as num).toInt(),
        name: (json['nickname'] as String?)?.trim().isNotEmpty == true
            ? (json['nickname'] as String).trim()
            : (json['username'] as String? ?? '企业成员'),
        status: json['status'] as String? ?? 'active',
        employmentStatus: json['employment_status'] as String? ?? 'active',
        isSuperAdmin: json['is_super_admin'] == true,
        isOrgLeader: json['is_org_leader'] == true,
      );

  bool get canBeProjectOwner =>
      status == 'active' && employmentStatus == 'active';
  String get statusLabel => status == 'disabled'
      ? '已停用'
      : status == 'removed'
          ? '已移出'
          : '已启用';
  String get roleLabel => isSuperAdmin
      ? '超级管理员'
      : isOrgLeader
          ? '组织负责人'
          : '普通成员';
}

class ProjectReportPolicy {
  const ProjectReportPolicy({
    this.period = 'weekly',
    this.deadlineTime = '18:00',
    this.weekday = 5,
    this.monthDay = 25,
    this.remind = false,
    this.enabled = true,
  });

  final String period;
  final String deadlineTime;
  final int weekday;
  final int monthDay;
  final bool remind;
  final bool enabled;

  factory ProjectReportPolicy.fromJson(Map<String, dynamic> json) =>
      ProjectReportPolicy(
        period: json['period'] as String? ?? 'weekly',
        deadlineTime: json['deadline_time'] as String? ?? '18:00',
        weekday: (json['weekday'] as num?)?.toInt() ?? 5,
        monthDay: (json['month_day'] as num?)?.toInt() ?? 25,
        remind: json['remind'] == true,
        enabled: json['enabled'] != false,
      );

  Map<String, dynamic> toJson() => {
        'period': period,
        'deadline_time': deadlineTime,
        'weekday': weekday,
        'month_day': monthDay,
        'remind': remind,
        'enabled': enabled,
      };
}
