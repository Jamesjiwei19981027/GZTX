/**
 * 协作域 API（项目树 / 材料 / 智能体）
 * 走 utils/request，路径与 api-contracts-v1 对齐
 */
const { get, post } = require('./request')

function listProjects(companyId, page) {
  return get('/projects', {
    company_id: companyId,
    page: page || 1,
    page_size: 50,
  })
}

function getProject(projectId) {
  return get('/projects/' + projectId)
}

function getProjectTree(projectId) {
  return get('/projects/' + projectId + '/tree', { format: 'nested' })
}

function getNode(nodeId) {
  return get('/nodes/' + nodeId)
}

function getNodeProgress(nodeId) {
  return get('/nodes/' + nodeId + '/progress')
}

function submitEvidence(nodeId, body) {
  return post('/nodes/' + nodeId + '/evidence', body)
}

function agentChat(body) {
  return post('/agents/chat', body)
}

function wxCollabChat(body) {
  return post('/wx/collab/chat', body)
}

module.exports = {
  listProjects,
  getProject,
  getProjectTree,
  getNode,
  getNodeProgress,
  submitEvidence,
  agentChat,
  wxCollabChat,
}
