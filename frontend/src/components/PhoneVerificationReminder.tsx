import React, {useCallback, useEffect, useRef, useState} from 'react';
import {getVerificationStatus} from '../api/auth';
import {phoneReminderDue} from '../utils/phoneReminder';
import {MobileConfirm} from '../mobile/ui/MobileConfirm';

export function PhoneVerificationReminder({userId, verified, onVerify, onVerified}: {
  userId: string; verified: boolean; onVerify: () => void; onVerified: () => void;
}) {
  const [open,setOpen] = useState(false);
  const launchChecked = useRef(false);
  const requestId = useRef(0);
  const check = useCallback(async () => {
    const native = window.__NATIVE_RUNTIME__ as {surface?:string} | undefined;
    if (native?.surface !== 'app' && !window.__isFlutterApp && !window.FlutterBridge) return;
    const request = ++requestId.current;
    try {
      const status = await getVerificationStatus();
      if (request !== requestId.current) return;
      if (status.phone_verified) { setOpen(false); onVerified(); return; }
      setOpen(phoneReminderDue(localStorage, userId, false));
    } catch { /* Verification must be confirmed by the server before showing a reminder. */ }
  },[userId,onVerified]);
  useEffect(() => {
    launchChecked.current = false;
    return () => { requestId.current++; };
  },[userId]);
  useEffect(() => {
    if (verified) {setOpen(false); return;}
    const onRuntime = () => {
      if (!launchChecked.current) {launchChecked.current=true; void check();}
    };
    // The runtime bridge can arrive after React has mounted.
    const native = window.__NATIVE_RUNTIME__ as {surface?:string} | undefined;
    if (native?.surface === 'app' || window.__isFlutterApp || window.FlutterBridge) onRuntime();
    const onResume = () => { if (!verified) void check(); };
    window.addEventListener('nativeRuntimeChange',onRuntime);
    window.addEventListener('nativeAppResumed',onResume);
    return () => {
      window.removeEventListener('nativeRuntimeChange',onRuntime);
      window.removeEventListener('nativeAppResumed',onResume);
    };
  },[check,verified]);
  return <MobileConfirm isOpen={open} title="手机号码尚未验证" message="绑定手机可保障账号与项目协作安全。首次提醒后的一周内，每次开启 APP 会提醒，验证成功后立即停止。"
    confirmLabel="去绑定手机" cancelLabel="稍后提醒" onConfirm={()=>{setOpen(false);onVerify();}} onCancel={()=>setOpen(false)} />;
}
