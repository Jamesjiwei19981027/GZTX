import React, {useEffect, useRef, useState} from 'react';
import {apiRequest} from '../api/client';

export function MaterialTextInput({value,onChange,companyId,projectId,scopeKey,disabled=false,onBusyChange,compact=false}: {
  value:string;onChange:(value:string)=>void;companyId:number;projectId:number;scopeKey:string;disabled?:boolean;onBusyChange?:(busy:boolean)=>void;compact?:boolean;
}) {
  return <MaterialTextEditor key={scopeKey} {...{value,onChange,companyId,projectId,disabled,onBusyChange,compact}} />;
}

const MaterialTextEditor:React.FC<Omit<Parameters<typeof MaterialTextInput>[0],'scopeKey'>> = ({value,onChange,companyId,projectId,disabled,onBusyChange,compact=false}) => {
  const [phase,setPhase]=useState<'idle'|'asking'|'recording'|'transcribing'>('idle');
  const [error,setError]=useState('');
  const [audio,setAudio]=useState<Blob|null>(null);
  const [seconds,setSeconds]=useState(0);
  const recorder=useRef<MediaRecorder|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const active=useRef(true);
  const generation=useRef(0);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null);
  const controller=useRef<AbortController|null>(null);
  const latest=useRef({value,onChange,onBusyChange});
  latest.current={value,onChange,onBusyChange};
  const upload=useRef<HTMLInputElement>(null);
  const stopTracks=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(timer.current)clearInterval(timer.current);timer.current=null;};
  useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;controller.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();stopTracks();latest.current.onBusyChange?.(false);};},[]);
  useEffect(()=>{latest.current.onBusyChange?.(phase!=='idle');},[phase]);

  const transcribe=async(blob:Blob)=>{
    const request=++generation.current;
    setAudio(blob);setError('');setPhase('transcribing');
    const abort=new AbortController();controller.current=abort;
    try {
      const form=new FormData();
      form.set('company_id',String(companyId));form.set('project_id',String(projectId));
      const ext=blob.type.includes('mp4')?'m4a':blob.type.includes('mpeg')?'mp3':blob.type.includes('ogg')?'ogg':blob.type.includes('wav')?'wav':'webm';
      form.set('file',blob,`material-voice.${ext}`);
      const result=await apiRequest<{text:string}>('/asr/transcribe',{method:'POST',body:form,signal:abort.signal});
      if(!active.current||request!==generation.current)return;
      const text=result.text?.trim();
      if(!text||text.startsWith('[builtin-asr]'))throw new Error('未识别到有效文字，请重新录音或直接输入。');
      latest.current.onChange([latest.current.value.trimEnd(),text].filter(Boolean).join('\n'));
      setAudio(null);
    }catch(e){if(active.current&&request===generation.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:'语音转写失败，请重试或直接输入。');}
    finally{if(active.current&&request===generation.current)setPhase('idle');}
  };
  const cancel=()=>{generation.current++;controller.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();stopTracks();setPhase('idle');setError('');setAudio(null);};
  useEffect(()=>{
    const hide=()=>{if(document.visibilityState==='hidden')cancel();};
    document.addEventListener('visibilitychange',hide);
    window.addEventListener('pagehide',cancel);
    return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',cancel);};
  },[]);
  const start=async()=>{
    if(phase!=='idle'||disabled)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      setError('当前环境无法直接录音，可使用下方音频文件入口或键盘语音输入。');return;
    }
    const request=++generation.current;setPhase('asking');setError('');setAudio(null);setSeconds(0);
    try {
      const media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!active.current||request!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      const recording=new MediaRecorder(media,mime?{mimeType:mime}:undefined);
      recorder.current=recording;const chunks:Blob[]=[];let elapsed=0;
      recording.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recording.onstop=()=>{stopTracks();if(!active.current||request!==generation.current)return;const blob=new Blob(chunks,{type:recording.mimeType||'audio/webm'});if(blob.size)void transcribe(blob);else{setError('没有录到声音，请重试。');setPhase('idle');}};
      recording.onerror=()=>{generation.current++;stopTracks();if(active.current){setError('录音中断，请检查麦克风后重试。');setPhase('idle');}};
      recording.start();setPhase('recording');
      timer.current=setInterval(()=>{elapsed++;if(active.current)setSeconds(elapsed);if(elapsed>=120&&recording.state==='recording')recording.stop();},1000);
    }catch(e){stopTracks();if(active.current&&request===generation.current){const name=e instanceof Error?e.name:'';setError(name==='NotAllowedError'||name==='PermissionDeniedError'?'麦克风权限未开启，请在系统设置中授权，或直接输入文字。':'无法启动录音，请检查麦克风，或选择音频文件。');setPhase('idle');}}
  };
  return <section aria-label="文字与语音材料" className="space-y-2 text-sm text-on-surface dark:text-on-surface">
    {!compact && <label className="block font-medium tabular-nums" htmlFor="material-text-input">文字材料</label>}
    {!compact && <textarea id="material-text-input" aria-label="文字材料" rows={5} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}
      placeholder="直接输入工作进展、完成情况或问题；也可以用语音输入，无需先上传文件。"
      className="w-full rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container-lowest px-3 py-3 outline-none focus:ring-2 focus:ring-primary text-sm select-text" />}
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" disabled={disabled||phase==='asking'||phase==='transcribing'} onClick={()=>{if(phase==='recording')recorder.current?.stop();else void start();}}
        className="min-h-11 px-3 rounded-lg border border-primary bg-surface-container text-primary dark:bg-surface-container dark:text-primary disabled:opacity-40">
        {phase==='recording'?`结束录音并转文字 (${seconds}s)`:phase==='asking'?'正在申请麦克风…':phase==='transcribing'?'正在转为文字…':'语音输入'}
      </button>
      {phase!=='idle'&&<button type="button" onClick={cancel} className="min-h-11 px-3 text-on-surface-variant">取消语音</button>}
      {phase==='idle'&&<button type="button" disabled={disabled} className="min-h-11 px-3 text-primary dark:text-primary" onClick={()=>upload.current?.click()}>选择音频转文字</button>}
      {phase==='idle'&&audio&&<button type="button" disabled={disabled} onClick={()=>void transcribe(audio)} className="min-h-11 px-3 text-primary">重试转写</button>}
    </div>
    <input ref={upload} aria-label="音频文件" className="hidden" type="file" accept="audio/*,.m4a,.mp4,.webm" disabled={disabled||phase!=='idle'} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void transcribe(file);}} />
    <p className="text-xs text-on-surface-variant">语音会追加为可编辑文字，检查后再提交。附件可选；单次录音最多 2 分钟。</p>
    {phase==='recording'&&<p role="status" className="text-error">正在录音，结束后开始转写。</p>}
    {phase==='transcribing'&&<p role="status">正在识别录音，请稍候…</p>}
    {error&&<p role="alert" className="text-error">{error}</p>}
  </section>;
};
