import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

class AgentChatScreen extends StatefulWidget {
  const AgentChatScreen({
    super.key,
    this.projectId,
    this.agentId,
    this.agentName,
  });

  final int? projectId;
  final int? agentId;
  final String? agentName;

  @override
  State<AgentChatScreen> createState() => _AgentChatScreenState();
}

class _AgentChatScreenState extends State<AgentChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<_ChatMsg> _messages = [];
  List<AgentItem> _agents = [];
  int? _agentId;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _agentId = widget.agentId;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAgents());
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadAgents() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) return;
    try {
      final agents = await context.read<AppState>().collab.listAgents(company.id);
      if (!mounted) return;
      setState(() {
        _agents = agents;
        _agentId ??= agents.isNotEmpty ? agents.first.id : null;
      });
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    final company = context.read<AppState>().currentCompany;
    if (company == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先选择公司')),
      );
      return;
    }
    setState(() {
      _messages.add(_ChatMsg(role: 'user', text: text));
      _sending = true;
      _input.clear();
    });
    _scrollToEnd();
    try {
      final res = await context.read<AppState>().collab.chat(
            companyId: company.id,
            message: text,
            projectId: widget.projectId,
            agentDefinitionId: _agentId,
          );
      final reply = (res['reply'] ?? '').toString();
      if (!mounted) return;
      setState(() {
        _messages.add(_ChatMsg(role: 'assistant', text: reply.isEmpty ? '（空回复）' : reply));
      });
      _scrollToEnd();
    } catch (e) {
      if (mounted) {
        showApiError(context, e);
        await maybeOpenVerify(context, e);
        setState(() {
          _messages.add(_ChatMsg(role: 'system', text: '发送失败：$e'));
        });
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 80,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.agentName ?? '智能体对话'),
        bottom: _agents.isEmpty
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(48),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                  child: DropdownButtonFormField<int>(
                    initialValue: _agents.any((a) => a.id == _agentId)
                        ? _agentId
                        : null,
                    decoration: const InputDecoration(
                      isDense: true,
                      border: OutlineInputBorder(),
                      labelText: '选择智能体',
                    ),
                    items: _agents
                        .map(
                          (a) => DropdownMenuItem(
                            value: a.id,
                            child: Text('${a.name} (${a.kind})'),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setState(() => _agentId = v),
                  ),
                ),
              ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? const EmptyHint('发送消息开始对话')
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length,
                    itemBuilder: (ctx, i) {
                      final m = _messages[i];
                      final isUser = m.role == 'user';
                      final align =
                          isUser ? Alignment.centerRight : Alignment.centerLeft;
                      final color = m.role == 'system'
                          ? Colors.orange.shade50
                          : isUser
                              ? Theme.of(context).colorScheme.primaryContainer
                              : Theme.of(context).colorScheme.surfaceContainerHighest;
                      return Align(
                        alignment: align,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          padding: const EdgeInsets.all(12),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * 0.85,
                          ),
                          decoration: BoxDecoration(
                            color: color,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(m.text),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        hintText: '输入消息…',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatMsg {
  _ChatMsg({required this.role, required this.text});
  final String role;
  final String text;
}
