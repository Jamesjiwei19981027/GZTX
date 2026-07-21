import '../models/models.dart';
import 'api_client.dart';

class NotificationService {
  NotificationService(this._api);

  final ApiClient _api;

  Future<SmtpConfig> getSmtp() async {
    final data = await _api.get('/notifications/smtp-config') as JsonMap;
    return SmtpConfig.fromJson(data);
  }

  Future<SmtpConfig> saveSmtp({
    required String host,
    required int port,
    required String user,
    required String from,
    String? password,
  }) async {
    final data = await _api.put('/notifications/smtp-config', body: {
      'smtp_host': host.trim(),
      'smtp_port': port,
      'smtp_user': user.trim(),
      'smtp_from': from.trim(),
      if (password != null && password.isNotEmpty) 'smtp_password': password,
    }) as JsonMap;
    return SmtpConfig.fromJson(data);
  }

  Future<void> testEmail() async {
    await _api.post('/notifications/send-test-email');
  }

  Future<Map<String, dynamic>> emailStatus() async {
    final data = await _api.get('/notifications/email-status') as JsonMap;
    return data;
  }

  Future<LlmConfig> getLlm() async {
    final data = await _api.get('/notifications/llm-config') as JsonMap;
    return LlmConfig.fromJson(data);
  }

  Future<LlmConfig> saveLlm({
    required String provider,
    required String baseUrl,
    required String model,
    double temperature = 0.2,
    int maxTokens = 1024,
    bool enabled = true,
    bool useForAgent = true,
    bool useForJudge = false,
    String? apiKey,
  }) async {
    final data = await _api.put('/notifications/llm-config', body: {
      'provider': provider,
      'base_url': baseUrl.trim(),
      'model': model.trim(),
      'temperature': temperature,
      'max_tokens': maxTokens,
      'enabled': enabled,
      'use_for_agent': useForAgent,
      'use_for_judge': useForJudge,
      if (apiKey != null && apiKey.isNotEmpty) 'api_key': apiKey,
    }) as JsonMap;
    return LlmConfig.fromJson(data);
  }

  Future<Map<String, dynamic>> testLlm() async {
    final data = await _api.post('/notifications/llm-test') as JsonMap;
    return data;
  }
}
