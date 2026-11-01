import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/features/axis/data/axis_api.dart';

void main() {
  /// 后端 `FinalOwnerPositionBody.along_delta` 是整数字段：
  /// 画布非 1 倍缩放时拖出的小数会被 Pydantic 判 422。
  test('终责位置保存把小数偏移取整后再提交', () async {
    final bodies = <Map<String, dynamic>>[];
    final client = MockClient((request) async {
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response(
        jsonEncode({
          'code': 200,
          'message': 'success',
          'data': {'project_id': 7, 'final_owner_along_delta': 26},
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final api = AxisApi(ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'token'),
      httpClient: client,
      baseUrl: 'http://localhost:8010/api/v1',
    ));

    final saved = await api.saveFinalOwnerDelta(7, 25.5);

    expect(bodies.single['along_delta'], 26);
    expect(bodies.single['along_delta'], isA<int>());
    expect(saved, 26);
  });

  test('终责位置保存对向下小数也按四舍五入取整', () async {
    final bodies = <Map<String, dynamic>>[];
    final client = MockClient((request) async {
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return http.Response(
        jsonEncode({
          'code': 200,
          'message': 'success',
          'data': {'project_id': 7, 'final_owner_along_delta': 25},
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final api = AxisApi(ApiClient(
      tokenStorage: InMemoryTokenStorage(access: 'token'),
      httpClient: client,
      baseUrl: 'http://localhost:8010/api/v1',
    ));

    await api.saveFinalOwnerDelta(7, 25.4);

    expect(bodies.single['along_delta'], 25);
  });
}
