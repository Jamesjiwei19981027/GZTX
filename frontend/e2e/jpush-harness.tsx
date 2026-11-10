import React from 'react';
import { createRoot } from 'react-dom/client';
import { PushPreferenceSwitch } from '../src/components/PushPreferenceSwitch';
import { updateMe } from '../src/api/auth';

function Harness() {
  const [checked, setChecked] = React.useState(true);
  return <PushPreferenceSwitch checked={checked} onChange={value => {
    setChecked(value);
    void updateMe({ notify_pref: { channels: { push: { enabled: value } } } });
  }} />;
}
createRoot(document.getElementById('root')!).render(<Harness />);
