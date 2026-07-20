## Task 6: P4 鈥?椤圭洰鍒楄〃 / 璇︽儏澶х翰鏍?/ 璇佹嵁 / Agent

**Files:**
- Create: `pages/ProjectListPage.tsx`, `pages/ProjectDetailPage.tsx`
- Create: `components/project/OutlineTree.tsx`, `EvidencePanel.tsx`, `AgentChatDrawer.tsx`
- Create: `hooks/useCompanyContext.ts`锛堝鐓?archive锛?
- [ ] **Step 1: ProjectList**

`getProjects` / 鍏徃涓婁笅鏂囷紱鐐瑰嚮杩?`/projects/:id`銆?
- [ ] **Step 2: OutlineTree**

```tsx
// 鍙敤 Ant Design Tree 鎴栭€掑綊 ul
// data: TreeNodeDTO[] nested from getProjectTree(id, 'nested')
// onSelect(node) => 鐖剁粍浠跺姞杞?getNodeProgress / listNodeEvidence
```

瀵圭収 `ProjectDetailView.vue` 鐨勯€変腑涓?`createNode`銆?
- [ ] **Step 3: Evidence + AgentChatDrawer**

涓婁紶/鎻愪氦瀵归綈 `collab.ts` API锛涜亰澶╂娊灞夊榻?archive 缁勪欢琛屼负銆?
- [ ] **Step 4: 閿欒鎬?*

閿欒 project id锛歮essage.error锛屼笉鐧藉睆銆?
- [ ] **Step 5: 鍐掔儫 S5**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(frontend): project list/detail outline tree, evidence, agent chat"
```

---

