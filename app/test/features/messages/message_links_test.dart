import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/data/message_links.dart';

void main() {
  const base = 'http://localhost:8010/api/v1';

  group('附件与钉选链接地址解析', () {
    test('后端返回的相对地址（已带 /api/v1 前缀）不会重复加前缀', () {
      expect(
        resolveMessageLink(base, '/api/v1/collab/files/301/download'),
        'http://localhost:8010/api/v1/collab/files/301/download',
      );
    });

    test('不带接口前缀的相对地址补到 baseUrl 之后', () {
      expect(
        resolveMessageLink(base, '/collab/files/301/download'),
        'http://localhost:8010/api/v1/collab/files/301/download',
      );
      expect(
        resolveMessageLink(base, 'collab/files/301/download'),
        'http://localhost:8010/api/v1/collab/files/301/download',
      );
    });

    test('已是完整 http(s) 地址时原样返回', () {
      expect(
        resolveMessageLink(base, 'https://example.com/spec'),
        'https://example.com/spec',
      );
      expect(
        resolveMessageLink(base, 'http://cdn.example.com:9000/a/b.pdf'),
        'http://cdn.example.com:9000/a/b.pdf',
      );
    });

    test('baseUrl 带结尾斜杠时也不会拼出双斜杠', () {
      expect(
        resolveMessageLink('$base/', '/api/v1/collab/files/301/download'),
        'http://localhost:8010/api/v1/collab/files/301/download',
      );
    });

    test('接口部署在根路径时相对地址只拼到来源之后', () {
      expect(
        resolveMessageLink('https://app.example.com', '/collab/files/9/download'),
        'https://app.example.com/collab/files/9/download',
      );
    });

    test('空地址原样返回，不拼出无意义的链接', () {
      expect(resolveMessageLink(base, '   '), '');
    });
  });
}
