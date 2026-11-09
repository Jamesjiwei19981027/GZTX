import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MobileAxisScreens } from '../../src/mobile/features/people-axis/MobileAxisScreens'
import { PeopleAxisView } from '../../src/components/views/PeopleAxisView'
import type { Project, UserProfile } from '../../src/types'
import '../../src/index.css'

localStorage.setItem('access_token', 'test-token')
localStorage.setItem('axis_canvas_hint_seen', 'true')
localStorage.setItem('people_axis_order_mode', 'tree')
const project = { id: '1', name: '人轴测试', color: '#0058BE' } as Project
const user = { id: '9', name: '王宁', role: 'pm' } as UserProfile
const mobile = new URLSearchParams(location.search).get('mobile') === 'true'
function Harness() {
  const [selected, setSelected] = useState(project)
  useEffect(() => {
    const switchProject = (event: Event) => setSelected((event as CustomEvent<string>).detail === '2' ? { ...project, id: '2', name: '第二项目' } : project)
    window.addEventListener('axis-harness-project', switchProject)
    return () => window.removeEventListener('axis-harness-project', switchProject)
  }, [])
  return mobile
    ? <MobileAxisScreens projectId={selected.id} projects={[project, { ...project, id: '2', name: '第二项目' }]} currentProject={selected} currentUser={user} companyId={1} onSelectProject={setSelected} />
    : <PeopleAxisView lang="zh" projectId={selected.id} projects={[project]} />
}
createRoot(document.getElementById('root')!).render(<Harness />)
