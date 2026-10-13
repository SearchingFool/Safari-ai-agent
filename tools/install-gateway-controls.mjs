/** Install/remove a per-user controller at login; no administrator access. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {controlPassword,ROOT} from '../gateway/control.mjs';
const run=promisify(execFile),label='com.searchingfool.safari-gateway-control';
const file=join(homedir(),'Library/LaunchAgents',label+'.plist');
const script=join(ROOT,'gateway/control.mjs'),domain=`gui/${process.getuid()}`,service=`${domain}/${label}`;
const xml=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const args=new Set(process.argv.slice(2));
if(process.platform!=='darwin')throw Error('The gateway UI launcher requires macOS');
if(existsSync(file)&&!readFileSync(file,'utf8').includes(xml(script)))throw Error('A controller for another checkout is installed. Remove it from that checkout first.');
async function installed(){try{await run('/bin/launchctl',['print',service]);return true;}catch{return false;}}
if(args.has('--remove')){
  if(await installed())await run('/bin/launchctl',['bootout',service]);
  if(existsSync(file))unlinkSync(file);
  console.log('Login controller removed. The gateway and iPad controls it owned have stopped. Local settings and passwords are preserved.');
}else{
  controlPassword();mkdirSync(dirname(file),{recursive:true});mkdirSync(join(ROOT,'logs'),{recursive:true});
  const path=[dirname(process.execPath),join(homedir(),'.local/bin'),'/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin'].join(':');
  const plist=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(script)}</string></array>
<key>WorkingDirectory</key><string>${xml(ROOT)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string></dict>
<key>StandardOutPath</key><string>${xml(join(ROOT,'logs/control-service.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(ROOT,'logs/control-service.log'))}</string>
</dict></plist>\n`;
  writeFileSync(file,plist,{mode:0o600});
  if(!(await installed()))await run('/bin/launchctl',['bootstrap',domain,file]);
  // The command is also the ordinary reopen/recover entrypoint.
  await run('/bin/launchctl',['kickstart',service]);
  console.log('Gateway controls installed at login. Mac: http://127.0.0.1:8788');
  if(args.has('--open')){
    const clip=execFile('/usr/bin/pbcopy');clip.stdin.end(controlPassword());
    await new Promise((resolve,reject)=>{clip.once('error',reject);clip.once('exit',code=>code===0?resolve():reject(Error('Could not copy control password')));});
    // Wait for the launch agent to listen before opening the browser.
    let ready=false;
    for(let attempt=0;attempt<30;attempt++){
      try{const r=await fetch('http://127.0.0.1:8788/',{signal:AbortSignal.timeout(500)});if(r.status===401){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!ready)throw Error('Controller did not start. Check logs/control-service.log.');
    console.log('Control password copied. Sign in as safari-control and paste the password.');
    await run('/usr/bin/open',['http://127.0.0.1:8788']);
  }
}
