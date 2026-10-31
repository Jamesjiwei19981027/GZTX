/// 项目模型
class Project {
  const Project({
    required this.id,
    required this.name,
    this.companyId,
    this.description,
    this.status,
    this.color,
    this.role,
    this.createdAt,
    this.updatedAt,
  });

  final int id;
  final String name;
  final int? companyId;
  final String? description;
  final String? status;
  final String? color;
  final String? role;
  final String? createdAt;
  final String? updatedAt;

  factory Project.fromJson(Map<String, dynamic> json) {
    return Project(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: (json['name'] as String?) ?? '未命名项目',
      companyId: (json['company_id'] as num?)?.toInt(),
      description: json['description'] as String?,
      status: json['status'] as String?,
      color: json['color'] as String?,
      role: json['role'] as String?,
      createdAt: json['created_at'] as String?,
      updatedAt: json['updated_at'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'company_id': companyId,
        'description': description,
        'status': status,
        'color': color,
        'role': role,
        'created_at': createdAt,
        'updated_at': updatedAt,
      };
}
