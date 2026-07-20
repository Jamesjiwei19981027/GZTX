## Task 8: P6 鈥?React Flow 鍙岃鍥?
**Files:**
- Create: `components/project/ProjectFlowView.tsx`
- Create: `utils/treeLayout.ts`
- Modify: `pages/ProjectDetailPage.tsx` 鈥?Tabs锛歚澶х翰` | `鍏崇郴鍥綻锛堥粯璁?**澶х翰**锛?- Depend: `npm install @xyflow/react @dagrejs/dagre` 涓?`@types` 鑻ラ渶瑕?
**Interfaces:**
- `treeToFlow(nodes: TreeNodeDTO[]): { nodes: Node[]; edges: Edge[] }`
- 鐐归€?Flow 鑺傜偣 鈫?涓庡ぇ绾插悓涓€ `selectedId` / `selectNode`

- [ ] **Step 1: 甯冨眬宸ュ叿**

```typescript
// frontend/src/utils/treeLayout.ts
import dagre from '@dagrejs/dagre'
import type { TreeNodeDTO } from '@/types/collab'

export type FlowNodeData = { title: string; status?: string; raw: TreeNodeDTO }

function walk(
  nodes: TreeNodeDTO[],
  parentId: string | null,
  acc: { id: string; parentId: string | null; label: string; status?: string; raw: TreeNodeDTO }[],
) {
  for (const n of nodes) {
    const id = String(n.id)
    acc.push({
      id,
      parentId,
      label: n.title,
      status: n.progress_json?.status,
      raw: n,
    })
    if (n.children?.length) walk(n.children, id, acc)
  }
  return acc
}

export function layoutTree(nested: TreeNodeDTO[]) {
  const flat = walk(nested, null, [])
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  flat.forEach((n) => g.setNode(n.id, { width: 180, height: 48 }))
  flat.forEach((n) => {
    if (n.parentId) g.setEdge(n.parentId, n.id)
  })
  dagre.layout(g)
  const nodes = flat.map((n) => {
    const p = g.node(n.id)
    return {
      id: n.id,
      position: { x: p.x - 90, y: p.y - 24 },
      data: { title: n.label, status: n.status, raw: n.raw } satisfies FlowNodeData,
      style: { width: 180 },
    }
  })
  const edges = flat
    .filter((n) => n.parentId)
    .map((n) => ({ id: `${n.parentId}-${n.id}`, source: n.parentId!, target: n.id }))
  return { nodes, edges }
}
```

- [ ] **Step 2: ProjectFlowView**

浣跨敤 `@xyflow/react` 鐨?`ReactFlow`, `Controls`, `Background`锛沗fitView`锛沗onNodeClick` 鍥炶皟 `onSelect(raw)`銆?
绌烘爲 / 鍔犺浇澶辫触锛欵mpty / Alert锛屼笉鐧藉睆銆?
- [ ] **Step 3: 鍙岃鍥捐仈鍔?*

鍚屼竴 `selected` state锛涘ぇ绾蹭笌 Flow 鍒囨崲鍚庨€変腑淇濇寔銆?
- [ ] **Step 4: 鍐掔儫 S6**锛堚墺2 灞傚瓙鏍戝彲璇伙級

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(frontend): React Flow project tree dual view with dagre layout"
```

---

