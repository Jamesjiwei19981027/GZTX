/// 公司/企业工作区模型
class Company {
  const Company({
    required this.id,
    required this.name,
    this.code,
    this.role,
    this.status,
    this.createdAt,
  });

  final int id;
  final String name;
  final String? code;
  final String? role;
  final String? status;
  final String? createdAt;

  factory Company.fromJson(Map<String, dynamic> json) {
    return Company(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: (json['name'] as String?) ?? '默认企业',
      code: json['code'] as String?,
      role: json['role'] as String?,
      status: json['status'] as String?,
      createdAt: json['created_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'code': code,
        'role': role,
        'status': status,
        'created_at': createdAt,
      };
}
