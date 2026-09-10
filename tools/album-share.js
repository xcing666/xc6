/* ============================================================
 *  翻页画册 - album-share.js
 *  作用：把做好的画册打包成「一个自包含的 HTML 文件」，然后
 *        ① 导出下载（发文件给客户 / 自己收着）
 *        ② 一键发布到 GitHub 仓库，拿到一个可转发的短链接
 *
 *  为什么需要它：本站是纯静态站，图片只存在浏览器内存里，
 *  换个设备就打不开。把图片 + 播放器打包进同一个文件后，
 *  这个文件放到任何地方（GitHub Pages / 本地 / 微信文件）
 *  都能独立打开翻页。
 *
 *  依赖：window.__album（由 album.js 暴露）
 * ============================================================ */
(function () {
  'use strict';

  /* ===== GitHub 仓库配置（发布目标） ===== */
  const GH_OWNER = 'xcing666';
  const GH_REPO = 'xc6';
  const GH_FILE_BASE = 'albums';           // 画册存在仓库的哪个目录
  const GH_PAGES = 'https://xcing666.github.io/xc6/';
  const TOKEN_KEY = 'xc_gh_token';         // 令牌只存在本机浏览器
  const REPO_CACHE_KEY = 'xc_gh_branch';   // 默认分支探测结果缓存

  /* ===== 图片压缩档位 ===== */
  const MAX_EDGE = 2000;   // 长边像素上限（2000 足够电脑手机看清，且体积可控）
  const QUALITY = 0.82;    // webp 质量

  /* ============================================================
   *  一、打包出去的播放器样式（内联进单文件 HTML）
   * ============================================================ */
  const PV_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  background:radial-gradient(circle at 50% 0%,#1e1a3a 0%,#0b0916 62%,#06040e 100%);
  color:#e8eaff;overflow:hidden;
  display:flex;flex-direction:column;
  height:100vh;height:100dvh;
  -webkit-tap-highlight-color:transparent;
}
.pv-top{
  flex:0 0 auto;display:flex;align-items:center;gap:10px;
  padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px;
  background:rgba(10,8,20,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border-bottom:1px solid rgba(255,255,255,.06);position:relative;z-index:20;
}
.pv-title{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0}
.pv-info{font-size:12px;color:rgba(255,255,255,.5);white-space:nowrap;flex:0 0 auto}
.pv-ctrl{display:flex;gap:6px;flex:0 0 auto}
.pv-btn{
  display:inline-flex;align-items:center;gap:4px;
  padding:6px 10px;border-radius:8px;font-size:12px;cursor:pointer;user-select:none;
  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);
  color:rgba(255,255,255,.75);transition:.15s;white-space:nowrap;
}
.pv-btn:hover{background:rgba(255,255,255,.14)}
.pv-btn.on{background:rgba(0,184,212,.2);border-color:rgba(0,184,212,.5);color:#7eb6ff}
.pv-stage{flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:14px 10px;min-height:0;perspective:2600px}
.pv-book{
  position:relative;
  filter:drop-shadow(0 16px 28px rgba(0,0,0,.55));
  user-select:none;-webkit-user-select:none;transition:opacity .18s ease;
}
.pv-book.flipping{filter:none}
.pv-book.fading{opacity:0}
.pv-book.solo .pv-side.left{display:none}
.pv-book.solo .pv-side.right{left:0;width:100%;border-radius:6px;box-shadow:0 10px 26px rgba(0,0,0,.45)}
.pv-book.solo::before{display:none}
.pv-book::before{
  content:'';position:absolute;left:50%;top:0;bottom:0;width:3px;transform:translateX(-1.5px);
  background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,.15) 12%,rgba(0,0,0,.12) 50%,rgba(0,0,0,.15) 88%,rgba(0,0,0,.5));
  z-index:5;pointer-events:none;box-shadow:0 0 10px rgba(0,0,0,.5);
}
.pv-side{position:absolute;top:0;height:100%;width:50%;overflow:hidden;background:#f6f5f1}
.pv-side.left{left:0;border-radius:4px 0 0 4px;box-shadow:inset -16px 0 24px -18px rgba(0,0,0,.55)}
.pv-side.right{left:50%;border-radius:0 4px 4px 0;box-shadow:inset 16px 0 24px -18px rgba(0,0,0,.55)}
.pv-side img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;-webkit-user-drag:none}
.pv-side.empty{background:linear-gradient(135deg,#fbfaf7,#efece6)}
.pv-side.empty::after{content:'\\2014';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(0,0,0,.14);font-size:26px;letter-spacing:2px}
.pv-book .turning{position:absolute;top:0;left:0;pointer-events:none;z-index:9998}
.pv-nav{
  flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:14px;
  padding:10px 14px calc(env(safe-area-inset-bottom,0px) + 12px);
  background:rgba(10,8,20,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border-top:1px solid rgba(255,255,255,.06);position:relative;z-index:20;
}
.pv-navbtn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;padding:9px 18px;border-radius:22px;cursor:pointer;font-size:13px;transition:.15s;min-width:84px}
.pv-navbtn:hover:not(:disabled){background:rgba(0,184,212,.18);border-color:rgba(0,184,212,.4)}
.pv-navbtn:disabled{opacity:.3;cursor:not-allowed}
.pv-pagenum{color:rgba(255,255,255,.7);font-size:12.5px;min-width:76px;text-align:center;font-variant-numeric:tabular-nums}
.pv-big{display:none;position:fixed;inset:0;z-index:2147483000;background:radial-gradient(circle at 50% 40%,#171430 0%,#08060f 100%);flex-direction:column;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 10px) 10px calc(env(safe-area-inset-bottom,0px) + 46px)}
.pv-big.show{display:flex}
.pv-big .pv-bigwrap{perspective:2600px;display:flex;align-items:center;justify-content:center;flex:1 1 auto;width:100%;min-height:0}
.pv-big .pv-bigclose{position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);right:12px;z-index:6;width:40px;height:40px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.14);color:#fff;font-size:20px;line-height:1;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.pv-big .pv-bigtip{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:6;transform:translateX(-50%);color:rgba(255,255,255,.5);font-size:12.5px;white-space:nowrap;background:rgba(0,0,0,.45);padding:6px 14px;border-radius:20px;pointer-events:none}
body.pv-imm{overflow:hidden;touch-action:none}
.pv-lb{position:fixed;inset:0;z-index:2147483600;background:rgba(6,4,16,.96);display:none;align-items:center;justify-content:center;padding:18px;cursor:zoom-out;overflow:auto;overscroll-behavior:contain}
.pv-lb.show{display:flex}
.pv-lb img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.75);background:#111;cursor:zoom-in}
.pv-lb.zoomed{display:block;padding:0}
.pv-lb.zoomed img{max-width:none;max-height:none;width:auto;height:auto;border-radius:0;box-shadow:none;cursor:zoom-out}
.pv-lb .pv-lbhint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);color:rgba(255,255,255,.55);font-size:12.5px;white-space:nowrap;background:rgba(0,0,0,.55);padding:6px 14px;border-radius:20px}
.pv-lb .pv-lbclose{position:fixed;top:14px;right:16px;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.16);color:#fff;font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
body.pv-lbopen{touch-action:auto;overflow:hidden}
.pv-load{position:fixed;inset:0;z-index:2147483640;background:#0b0916;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;transition:opacity .35s ease}
.pv-load.hide{opacity:0;pointer-events:none}
.pv-load .ring{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.15);border-top-color:#7eb6ff;animation:pvspin .9s linear infinite}
@keyframes pvspin{to{transform:rotate(360deg)}}
.pv-load .txt{font-size:13px;color:rgba(255,255,255,.55)}
@media (max-width:640px){
  .pv-info{display:none}
  .pv-title{font-size:13px}
  .pv-btn{padding:6px 8px;font-size:11.5px}
  .pv-navbtn{padding:8px 14px;font-size:12.5px;min-width:70px}
}
`;

  /* ============================================================
   *  二、打包出去的播放器脚本（内联进单文件 HTML）
   *  与站内翻页逻辑保持一致：封面/封底单张居中、中间两两跨页、
   *  canvas 圆柱卷曲、双击放大、放大模式（手机横屏=大图）
   *  ⚠️ 这段是字符串模板，内部一律用字符串拼接，不要出现反引号
   * ============================================================ */
  const PV_JS = `
(function(){
'use strict';
var D=JSON.parse(document.getElementById('albumData').textContent||'{}');
var SRC=D.images||[],NAMES=D.names||[],TITLE=D.title||'翻页画册';
if(TITLE)document.title=TITLE;
var $=function(id){return document.getElementById(id)};
var book=$('pvBook'),stageEl=$('pvStage');
var imgL=$('pvImgL'),imgR=$('pvImgR'),sideL=$('pvSideL'),sideR=$('pvSideR');
var infoEl=$('pvInfo'),pageEl=$('pvPageNum'),prevEl=$('pvPrev'),nextEl=$('pvNext');
var lb=$('pvLb'),lbImg=$('pvLbImg');
var bigView=$('pvBigView'),bvWrap=$('pvBigWrap');
var tSound=$('pvSound'),tAuto=$('pvAuto'),tBig=$('pvBig');

var images=[],screens=[],spread=0,totalSpreads=0,bookAR=1,bookOrient='landscape';
var soundOn=true,autoOn=false,autoTimer=null,audioCtx=null,flipping=false;
var immersive=false,homeParent=null,homeNext=null;
var turningLayer=null,rafTurn=null,turnCtx=null,turnW=0,turnH=0;
var turnBase=null,turnFront=null,turnBack=null;

var TURN_MS=900,PAGE_SEG=30,CAM_DIST=1400,DOUBLE_MS=320,TAP_MOVE=10;

/* ---------- 翻书声（Web Audio 合成，不依赖音频文件） ---------- */
function ensureAudio(){
  if(!audioCtx){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}
  if(audioCtx.state==='suspended')audioCtx.resume();
  return audioCtx;
}
function playFlipSound(){
  if(!soundOn)return;
  var ctx=ensureAudio(); if(!ctx)return;
  var dur=0.32;
  var buf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*dur),ctx.sampleRate);
  var data=buf.getChannelData(0);
  for(var i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*0.6;
  var noise=ctx.createBufferSource();noise.buffer=buf;
  var bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2500;bp.Q.value=0.8;
  var hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=800;
  var gain=ctx.createGain();
  gain.gain.setValueAtTime(0,ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.22,ctx.currentTime+0.02);
  gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
  noise.connect(bp);bp.connect(hp);hp.connect(gain);gain.connect(ctx.destination);
  noise.start();noise.stop(ctx.currentTime+dur);
  setTimeout(function(){
    if(!soundOn)return;
    var o=ctx.createOscillator();o.type='sine';
    o.frequency.setValueAtTime(120,ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60,ctx.currentTime+0.08);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.08,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.1);
    o.connect(g);g.connect(ctx.destination);
    o.start();o.stop(ctx.currentTime+0.1);
  },200);
}

/* ---------- 图片预加载（全部解码完再显示，避免翻页时闪白） ---------- */
function loadAll(){
  var txt=document.querySelector('#pvLoad .txt');
  var done=0;
  var tasks=SRC.map(function(src,i){
    return new Promise(function(res){
      var im=new Image();
      im.onload=function(){
        images[i]={src:src,name:NAMES[i]||('第'+(i+1)+'张'),el:im,w:im.naturalWidth,h:im.naturalHeight};
        done++; if(txt)txt.textContent='正在打开画册 '+done+'/'+SRC.length;
        res();
      };
      im.onerror=function(){done++;res();};
      im.src=src;
    });
  });
  return Promise.all(tasks).then(function(){ images=images.filter(function(x){return !!x;}); });
}

/* ---------- 方向识别：取图片宽高比中位数，收敛到 0.7~1.6 ---------- */
function detectAR(){
  if(!images.length)return 1;
  var ars=images.map(function(x){return x.w/Math.max(1,x.h);});
  ars.sort(function(a,b){return a-b;});
  var mid=ars[Math.floor(ars.length/2)];
  return Math.min(Math.max(mid,0.7),1.6);
}

/* ---------- 屏幕结构：封面 → 两两跨页 → 封底 ---------- */
function buildScreens(){
  var n=images.length; screens=[];
  if(!n){screens=[{l:-1,r:-1,solo:true}];return;}
  if(n===1){screens=[{l:0,r:-1,solo:true}];return;}
  screens.push({l:0,r:-1,solo:true});
  for(var i=1;i<=n-2;i+=2)screens.push({l:i,r:(i+1<=n-2)?i+1:-1,solo:false});
  screens.push({l:-1,r:n-1,solo:true});
}
var itm=function(i){return (i>=0&&i<images.length)?images[i]:null;};

function setSide(img,box,item){
  if(item){
    img.src=item.src; img.alt=item.name||''; img.style.display='';
    box.classList.remove('empty');
  }else{
    img.removeAttribute('src'); img.alt=''; img.style.display='none';
    box.classList.add('empty');
  }
}
function renderSpread(){
  var s=screens[spread]||{l:-1,r:-1,solo:true};
  book.classList.toggle('solo',!!s.solo);
  if(s.solo){
    setSide(imgR,sideR,itm(s.l>=0?s.l:s.r));
    setSide(imgL,sideL,null);
  }else{
    setSide(imgL,sideL,itm(s.l));
    setSide(imgR,sideR,itm(s.r));
  }
  fit();
}

/* ---------- 按视口算尺寸：封面/封底=1 页宽，跨页=2 页宽 ---------- */
function fit(){
  var solo=!!(screens[spread]&&screens[spread].solo);
  var asp=solo?bookAR:bookAR*2;
  var availW,availH;
  if(immersive){
    availW=Math.max(160,(bvWrap.clientWidth||window.innerWidth)-24);
    availH=Math.max(180,(bvWrap.clientHeight||window.innerHeight*0.8)-12);
  }else{
    availW=Math.max(160,(stageEl.clientWidth||window.innerWidth)-28);
    availH=Math.max(150,(stageEl.clientHeight||window.innerHeight*0.6)-4);
  }
  var w=availW,h=w/asp;
  if(h>availH){h=availH;w=h*asp;}
  if(w>availW){w=availW;h=w/asp;}
  book.style.width=Math.round(w)+'px';
  book.style.height=Math.round(h)+'px';
}

/* ---------- 圆柱卷曲翻页（canvas 逐条重绘） ---------- */
function easeInOut(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}

function buildTurning(){
  if(turningLayer){turningLayer.remove();turningLayer=null;}
  var rect=book.getBoundingClientRect();
  var w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
  var raw=window.devicePixelRatio||1;
  var dpr=Math.min(raw,w>=700?1.4:1.8);
  var c=document.createElement('canvas');
  c.className='turning';
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
  c.style.width=w+'px';c.style.height=h+'px';
  book.appendChild(c);
  turningLayer=c;turnCtx=c.getContext('2d');
  turnCtx.imageSmoothingQuality='low';
  turnCtx.setTransform(dpr,0,0,dpr,0,0);
  turnW=w;turnH=h;
}
function drawFit(cx,item,x0,y0,w,h){
  if(!item||!item.el)return;
  var iw=item.el.naturalWidth||item.w||0,ih=item.el.naturalHeight||item.h||0;
  if(!iw||!ih)return;
  var s=Math.max(w/iw,h/ih),dw=iw*s,dh=ih*s;
  cx.drawImage(item.el,x0+(w-dw)/2,y0+(h-dh)/2,dw,dh);
}
function buildTurnSlices(baseL,baseR,front,back){
  var pw=Math.max(1,Math.round(turnW/2)),ph=Math.max(1,Math.round(turnH));
  var mk=function(item){
    if(!item||!item.el)return null;
    var c=document.createElement('canvas');
    c.width=pw;c.height=ph;
    drawFit(c.getContext('2d'),item,0,0,pw,ph);
    return c;
  };
  turnFront=mk(front); turnBack=mk(back);
  var b=document.createElement('canvas');
  b.width=pw*2;b.height=ph;
  var bx=b.getContext('2d');
  drawFit(bx,baseL,0,0,pw,ph);
  if(baseR)drawFit(bx,baseR,pw,0,pw,ph);
  turnBase=b;
}
function renderCurl(p,baseDeg){
  var ctx=turnCtx,W=turnW,H=turnH;
  if(turnBase)ctx.drawImage(turnBase,0,0,W,H);
  else ctx.clearRect(0,0,W,H);
  var useBack=baseDeg<=-90;
  var page=useBack?turnBack:turnFront;
  if(!page)return;
  var pageW=W/2,bookCx=pageW,N=PAGE_SEG;
  var stripSrc=page.width/N,segW=pageW/N;
  var aMax=0.05+0.30*Math.sin(Math.PI*Math.min(1,Math.max(0,p)));
  var R=pageW/Math.max(aMax,0.02);
  var base=baseDeg*Math.PI/180,cosB=Math.cos(base),sinB=Math.sin(base);
  var dist=CAM_DIST,boxMin=W,boxMax=0;
  for(var i=0;i<N;i++){
    var s0=i*segW,s1=(i+1)*segW;
    var a0=s0/R,a1=s1/R;
    var x0=R*Math.sin(a0),z0=R*(1-Math.cos(a0));
    var x1=R*Math.sin(a1),z1=R*(1-Math.cos(a1));
    var xr0=x0*cosB-z0*sinB,zr0=x0*sinB+z0*cosB;
    var xr1=x1*cosB-z1*sinB,zr1=x1*sinB+z1*cosB;
    var sc0=dist/(dist-zr0),sc1=dist/(dist-zr1);
    var X0=bookCx+xr0*sc0,X1=bookCx+xr1*sc1;
    var dstX=Math.round(Math.min(X0,X1));
    var dstW=Math.max(1,Math.round(Math.abs(X1-X0))+1);
    var dstH=Math.min(H,H*(sc0+sc1)/2);
    var dstY=(H-dstH)/2;
    if(dstX<boxMin)boxMin=dstX;
    if(dstX+dstW>boxMax)boxMax=dstX+dstW;
    var si=useBack?(N-1-i):i;
    ctx.drawImage(page,si*stripSrc,0,stripSrc,page.height,dstX,dstY,dstW,dstH);
  }
  var sweep=Math.sin(Math.PI*Math.min(1,Math.max(0,p)));
  if(sweep>0.03&&boxMax>boxMin){
    var g=ctx.createLinearGradient(0,0,W,0);
    g.addColorStop(0,'rgba(255,255,255,0)');
    g.addColorStop(0.5,'rgba(255,255,255,'+(0.10*sweep).toFixed(2)+')');
    g.addColorStop(1,'rgba(0,0,0,'+(0.14*sweep).toFixed(2)+')');
    ctx.fillStyle=g;
    ctx.fillRect(boxMin,0,boxMax-boxMin,H);
  }
}

function startTurn(next){
  if(flipping)return;
  if(next&&spread>=totalSpreads-1)return;
  if(!next&&spread<=0)return;
  var cur=screens[spread],nxt=screens[next?spread+1:spread-1];
  if(!cur||!nxt)return;
  if(cur.solo||nxt.solo){fadeSwitch(next);return;}
  var frontImg,backImg,baseLeftImg,baseRightImg;
  if(next){
    frontImg=itm(cur.r);backImg=itm(nxt.l);
    baseLeftImg=itm(cur.l);baseRightImg=itm(nxt.r);
  }else{
    frontImg=itm(nxt.r);backImg=itm(cur.l);
    baseLeftImg=itm(nxt.l);baseRightImg=itm(cur.r);
  }
  if(!frontImg&&!backImg){fadeSwitch(next);return;}
  flipping=true;
  buildTurning();
  buildTurnSlices(baseLeftImg,baseRightImg,frontImg,backImg);
  book.classList.add('flipping');
  playFlipSound();
  var from=next?0:-180,to=next?-180:0;
  var start=performance.now();
  cancelAnimationFrame(rafTurn);
  function frame(now){
    var p=Math.min(1,(now-start)/TURN_MS);
    renderCurl(p,from+(to-from)*easeInOut(p));
    if(p<1){rafTurn=requestAnimationFrame(frame);}
    else{
      if(turningLayer){turningLayer.remove();turningLayer=null;}
      turnBase=turnFront=turnBack=null;
      book.classList.remove('flipping');
      spread=next?spread+1:spread-1;
      renderSpread();updateInfo();
      flipping=false;
    }
  }
  rafTurn=requestAnimationFrame(frame);
}
function fadeSwitch(next){
  flipping=true;playFlipSound();
  book.classList.add('fading');
  setTimeout(function(){
    spread=next?spread+1:spread-1;
    renderSpread();updateInfo();
    book.classList.remove('fading');
    flipping=false;
  },170);
}
function goNext(){startTurn(true);}
function goPrev(){startTurn(false);}
prevEl.addEventListener('click',goPrev);
nextEl.addEventListener('click',goNext);

function updateInfo(){
  var s=screens[spread]||{},n=images.length,label;
  if(s.solo&&spread===0)label='封面 · 共 '+n+' 张';
  else if(s.solo)label='封底 · 共 '+n+' 张';
  else if(n){
    var a=s.l+1,b=s.r>=0?s.r+1:a;
    label='第 '+a+(b>a?'-'+b:'')+' 张 · 共 '+n+' 张';
  }else label='—';
  infoEl.textContent=(bookOrient==='landscape'?'横版书':'竖版书')+' · '+label;
  var inner=totalSpreads-2;
  if(spread===0)pageEl.textContent='封面';
  else if(spread>=totalSpreads-1)pageEl.textContent='封底';
  else pageEl.textContent=spread+' / '+inner;
  prevEl.disabled=spread===0;
  nextEl.disabled=spread>=totalSpreads-1;
}

/* ---------- 开关 ---------- */
tSound.addEventListener('click',function(){
  soundOn=!soundOn;
  tSound.classList.toggle('on',soundOn);
  tSound.textContent=soundOn?'\\uD83D\\uDD0A':'\\uD83D\\uDD07';
  if(soundOn)ensureAudio();
});
tAuto.addEventListener('click',function(){
  autoOn=!autoOn;
  tAuto.classList.toggle('on',autoOn);
  if(autoOn)startAuto();else stopAuto();
});
function startAuto(){
  stopAuto();
  autoTimer=setInterval(function(){
    if(spread>=totalSpreads-1){
      (function back(){
        if(spread<=0||!autoOn)return;
        goPrev();
        setTimeout(back,TURN_MS+80);
      })();
    }else goNext();
  },3500);
}
function stopAuto(){if(autoTimer)clearInterval(autoTimer);autoTimer=null;}

/* ---------- 放大模式：把整本书搬进全屏层（同一本书，事件不丢） ---------- */
tBig.addEventListener('click',function(){immersive?exitBig():enterBig();});
function enterBig(){
  if(immersive)return;
  immersive=true;
  homeParent=book.parentNode;homeNext=book.nextSibling;
  bvWrap.appendChild(book);
  bigView.classList.add('show');
  document.body.classList.add('pv-imm');
  tBig.classList.add('on');
  tBig.textContent='\\u2715 退出';
  fit();
  tryFullscreen(true);
}
function exitBig(){
  if(!immersive)return;
  immersive=false;
  bigView.classList.remove('show');
  document.body.classList.remove('pv-imm');
  tBig.classList.remove('on');
  tBig.textContent='\\uD83D\\uDD0D 放大';
  if(homeParent){
    if(homeNext&&homeNext.parentNode===homeParent)homeParent.insertBefore(book,homeNext);
    else homeParent.appendChild(book);
  }
  homeParent=null;homeNext=null;
  tryFullscreen(false);
  fit();
}
function tryFullscreen(on){
  try{
    if(on){
      var el=document.documentElement;
      if(document.fullscreenEnabled&&!document.fullscreenElement&&el.requestFullscreen){
        var p=el.requestFullscreen({navigationUI:'hide'});
        if(p&&p.catch)p.catch(function(){});
      }
      setTimeout(function(){
        try{
          var so=screen.orientation;
          if(immersive&&so&&so.lock){var r=so.lock('landscape');if(r&&r.catch)r.catch(function(){});}
        }catch(e){}
      },280);
    }else{
      try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();}catch(e){}
      if(document.fullscreenElement&&document.exitFullscreen){
        var q=document.exitFullscreen();
        if(q&&q.catch)q.catch(function(){});
      }
    }
  }catch(e){}
}
document.addEventListener('fullscreenchange',function(){
  if(immersive&&!document.fullscreenElement)exitBig();
});

/* ---------- 滑动 / 单击 / 双击（统一用指针事件判定） ----------
   移动端双击的第二次 tap 不派发 click，所以必须在 pointerup 上判定 */
var swStartX=0,swStartY=0,swActive=false,swWasSwipe=false;
function onSwipeStart(x,y){if(flipping)return;swActive=true;swStartX=x;swStartY=y;swWasSwipe=false;}
function onSwipeMove(x,y){
  if(!swActive)return;
  if(Math.abs(x-swStartX)>TAP_MOVE||Math.abs(y-swStartY)>TAP_MOVE)swWasSwipe=true;
}
function onSwipeEnd(x,y){
  if(!swActive)return;
  swActive=false;
  if(flipping)return;
  var dx=x-swStartX,dy=y-swStartY;
  if(!swWasSwipe){handleTap(x,y);return;}
  if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy))return;
  if(dx<0)goNext();else goPrev();
}
book.addEventListener('touchstart',function(e){
  if(e.touches.length!==1)return;
  onSwipeStart(e.touches[0].clientX,e.touches[0].clientY);
},{passive:true});
book.addEventListener('touchmove',function(e){
  if(!swActive||!e.touches.length)return;
  onSwipeMove(e.touches[0].clientX,e.touches[0].clientY);
},{passive:true});
book.addEventListener('touchend',function(e){
  var t=(e.changedTouches&&e.changedTouches[0])||null;
  if(t)onSwipeEnd(t.clientX,t.clientY);
});
book.addEventListener('pointerdown',function(e){onSwipeStart(e.clientX,e.clientY);});
book.addEventListener('pointermove',function(e){onSwipeMove(e.clientX,e.clientY);});
book.addEventListener('pointerup',function(e){onSwipeEnd(e.clientX,e.clientY);});
book.addEventListener('pointercancel',function(){swActive=false;});

var tapTimer=null,lastTap=0,lastTapX=0,lastTapY=0;
function handleTap(x,y){
  var rect=book.getBoundingClientRect();
  var isRight=x>rect.left+rect.width/2;
  var now=Date.now();
  var isDouble=(now-lastTap<DOUBLE_MS)&&Math.abs(x-lastTapX)<48&&Math.abs(y-lastTapY)<48;
  if(isDouble){
    clearTimeout(tapTimer);tapTimer=null;lastTap=0;
    var s=screens[spread]||{};
    if(s.solo)openLightbox(itm(s.l>=0?s.l:s.r));
    else openLightbox(isRight?itm(s.r):itm(s.l));
    return;
  }
  lastTap=now;lastTapX=x;lastTapY=y;
  clearTimeout(tapTimer);
  tapTimer=setTimeout(function(){
    tapTimer=null;
    if(isRight)goNext();else goPrev();
  },DOUBLE_MS);
}

/* ---------- 双击放大查看（点图片切原始尺寸，可在全屏里拖动） ---------- */
var lbZoomed=false;
function setLbZoom(on){
  lbZoomed=!!on;
  lb.classList.toggle('zoomed',lbZoomed);
  var hint=lb.querySelector('.pv-lbhint');
  if(hint)hint.textContent=lbZoomed?'点图片还原 · 点右上角关闭':'点图片可放大细看 · 点空白处关闭';
}
function openLightbox(item){
  if(!item||!item.src)return;
  if(autoOn){autoOn=false;tAuto.classList.remove('on');stopAuto();}
  setLbZoom(false);
  lbImg.src=item.src;lbImg.alt=item.name||'';
  lb.classList.add('show');
  document.body.classList.add('pv-lbopen');
  lb.scrollTop=0;lb.scrollLeft=0;
}
function closeLightbox(){
  lb.classList.remove('show');
  setLbZoom(false);
  lbImg.removeAttribute('src');
  document.body.classList.remove('pv-lbopen');
}
lb.addEventListener('click',function(e){
  if(e.target===lbImg){setLbZoom(!lbZoomed);return;}
  closeLightbox();
});
var lbCloseBtn=lb.querySelector('.pv-lbclose');
if(lbCloseBtn)lbCloseBtn.addEventListener('click',closeLightbox);
var bigCloseBtn=$('pvBigClose');
if(bigCloseBtn)bigCloseBtn.addEventListener('click',exitBig);


/* ---------- 启动 ---------- */
loadAll().then(function(){
  buildScreens();
  totalSpreads=screens.length;
  spread=0;
  bookAR=detectAR();
  bookOrient=bookAR>=1?'landscape':'portrait';
  renderSpread();
  updateInfo();
  var l=$('pvLoad');
  if(l){l.classList.add('hide');setTimeout(function(){if(l.parentNode)l.parentNode.removeChild(l);},420);}
});
function onResize(){
  if(screens.length)fit();
}
window.addEventListener('resize',onResize);
window.addEventListener('orientationchange',function(){setTimeout(onResize,250);});
window.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    if(lb.classList.contains('show')){closeLightbox();return;}
    if(immersive){exitBig();return;}
  }
  if(lb.classList.contains('show'))return;
  if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();goNext();}
  else if(e.key==='ArrowLeft'){e.preventDefault();goPrev();}
});
})();
`;

  /* ============================================================
   *  三、打包 / 导出 / 发布
   * ============================================================ */
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    if (window.__album && window.__album.showToast) window.__album.showToast(msg);
    else console.log('[album-share]', msg);
  }
  function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  }
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function safeFileName(s) {
    return (String(s || '画册').replace(/[\\/:*?"<>|\r\n\t]/g, '_').slice(0, 40) || '画册');
  }
  /* 随机短码：去掉易混字符 0OoIl1，31 个字符取 6 位 ≈ 8.9 亿种组合，别人猜不到 */
  function randomSlug(len) {
    const CH = '23456789abcdefghjkmnpqrstuvwxyz';
    let s = '';
    const buf = new Uint32Array(len || 6);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = Math.random() * 4294967296));
    for (let i = 0; i < buf.length; i++) s += CH[buf[i] % CH.length];
    return s;
  }
  /* UTF-8 字符串 → base64（GitHub Contents API 要求） */
  function b64utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  function getTitle() {
    const el = $('spTitle');
    const v = el && el.value ? el.value.trim() : '';
    return v || '我的画册';
  }

  /* ---------- 单张图片压缩：长边 ≤ MAX_EDGE，优先 webp ---------- */
  function compressItem(item) {
    return new Promise((resolve) => {
      const el = item.el;
      const iw = (el && el.naturalWidth) || item.w || 0;
      const ih = (el && el.naturalHeight) || item.h || 0;
      if (!iw || !ih) { resolve(null); return; }
      const scale = Math.min(1, MAX_EDGE / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(el, 0, 0, w, h);
      let url = '';
      try { url = c.toDataURL('image/webp', QUALITY); } catch (e) { url = ''; }
      // 不支持 webp 编码的旧浏览器会静默返回 png（体积反而更大）→ 退回 jpeg
      if (!url || url.indexOf('data:image/webp') !== 0) {
        try { url = c.toDataURL('image/jpeg', QUALITY); } catch (e2) { url = ''; }
      }
      resolve(url || item.src);
    });
  }

  /* ---------- 把当前画册打包成一个自包含 HTML 字符串 ---------- */
  async function buildPackage(onProgress) {
    const list = (window.__album && window.__album.getImages()) || [];
    if (!list.length) throw new Error('请先上传图片');
    const out = [], names = [];
    for (let i = 0; i < list.length; i++) {
      if (onProgress) onProgress(i / list.length, '正在压缩第 ' + (i + 1) + ' / ' + list.length + ' 张…');
      const d = await compressItem(list[i]);
      if (d) { out.push(d); names.push(list[i].name || ('第' + (i + 1) + '张')); }
      await nextFrame();   // 让进度条能刷新出来
    }
    if (!out.length) throw new Error('图片处理失败，请重新上传');
    return { images: out, names: names };
  }

  function buildHtml(title, images, names) {
    // 数据放进 JSON block：转义 < 防止提前闭合 </script>
    const data = JSON.stringify({ title: title, images: images, names: names })
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    const t = escHtml(title);
    return [
      '<!DOCTYPE html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
      '<meta name="theme-color" content="#1a1730">',
      '<meta name="robots" content="noindex,nofollow,noarchive">',
      '<meta name="referrer" content="no-referrer">',
      '<title>' + t + '</title>',
      '<style>' + PV_CSS + '</style>',
      '</head>',
      '<body>',
      '<div class="pv-top">',
      '<span class="pv-title">' + t + '</span>',
      '<span class="pv-info" id="pvInfo">—</span>',
      '<span class="pv-ctrl">',
      '<span class="pv-btn on" id="pvSound" title="翻书声">🔊</span>',
      '<span class="pv-btn" id="pvAuto" title="自动翻页">🔁</span>',
      '<span class="pv-btn" id="pvBig" title="全屏放大">🔍 放大</span>',
      '</span>',
      '</div>',
      '<div class="pv-stage" id="pvStage">',
      '<div class="pv-book" id="pvBook">',
      '<div class="pv-side left" id="pvSideL"><img id="pvImgL" alt=""></div>',
      '<div class="pv-side right" id="pvSideR"><img id="pvImgR" alt=""></div>',
      '</div>',
      '</div>',
      '<div class="pv-nav">',
      '<button class="pv-navbtn" id="pvPrev">← 上一页</button>',
      '<span class="pv-pagenum" id="pvPageNum">封面</span>',
      '<button class="pv-navbtn" id="pvNext">下一页 →</button>',
      '</div>',
      '<div class="pv-big" id="pvBigView">',
      '<button class="pv-bigclose" id="pvBigClose" aria-label="退出放大">✕</button>',
      '<div class="pv-bigwrap" id="pvBigWrap"></div>',
      '<div class="pv-bigtip">左右滑动 / 点击右半边翻页 · 按 Esc 退出</div>',
      '</div>',
      '<div class="pv-lb" id="pvLb">',
      '<span class="pv-lbclose">✕</span>',
      '<img id="pvLbImg" alt="">',
      '<span class="pv-lbhint">点图片可放大细看 · 点空白处关闭</span>',
      '</div>',
      '<div class="pv-load" id="pvLoad"><div class="ring"></div><div class="txt">正在打开画册…</div></div>',
      '<script id="albumData" type="application/json">' + data + '<\/script>',
      '<script>' + PV_JS + '<\/script>',
      '</body>',
      '</html>'
    ].join('\n');
  }

  /* ---------- 导出：下载成 .html 文件 ---------- */
  async function doExport(titleOverride) {
    const title = titleOverride || getTitle();
    setBusy(true);
    try {
      setProgress(0, '准备中…');
      const pkg = await buildPackage(setProgress);
      const html = buildHtml(title, pkg.images, pkg.names);
      const bytes = new Blob([html]).size;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeFileName(title) + '.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      setProgress(1, '已导出（' + fmtSize(bytes) + '）');
      toast('✅ 已导出画册文件 ' + fmtSize(bytes));
      return { ok: true, size: bytes };
    } catch (err) {
      setProgress(0, '失败：' + err.message);
      toast('❌ ' + err.message);
      return { ok: false, error: err.message };
    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
   *  四、发布到 GitHub（一键生成可转发链接）
   * ============================================================ */
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function ghHeaders(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function ghErrorText(res, data) {
    if (res.status === 401) return '令牌无效或已失效（401），请重新生成';
    if (res.status === 403) return '权限不足（403）：令牌需要该仓库的 Contents 读写权限';
    if (res.status === 404) return '找不到仓库 ' + GH_OWNER + '/' + GH_REPO + '（404）：请确认令牌勾选了这个仓库';
    if (res.status === 422) return '提交被拒绝（422）：多半是文件过大，减少张数再试';
    return (data && data.message) || ('HTTP ' + res.status);
  }
  async function ghJson(path, token, opts) {
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({}, ghHeaders(token), (opts && opts.headers) || {});
    const res = await fetch('https://api.github.com' + path, o);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(ghErrorText(res, data));
    return data;
  }
  async function verifyToken(token) {
    const me = await ghJson('/user', token);
    const repo = await ghJson('/repos/' + GH_OWNER + '/' + GH_REPO, token);
    return { login: me.login, branch: repo.default_branch || 'main' };
  }
  function publishFile(token, path, contentB64, message, branch) {
    return ghJson('/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + path, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, content: contentB64, branch: branch })
    });
  }

  async function doPublish() {
    const token = getToken();
    if (!token) { showTokenBox(true); toast('请先填入 GitHub 令牌'); return; }
    const title = getTitle();
    const fileEl = $('spTitle');
    const autoName = !fileEl || !fileEl.value.trim();

    setBusy(true);
    showResult(null);
    try {
      setProgress(0, '正在校验令牌…');
      await nextFrame();
      const info = await verifyToken(token);
      setConnected(info.login);

      setProgress(0, '准备中…');
      const pkg = await buildPackage(setProgress);
      const html = buildHtml(title, pkg.images, pkg.names);
      const bytes = new Blob([html]).size;
      if (bytes > 20 * 1024 * 1024) {
        throw new Error('画册文件太大（' + fmtSize(bytes) + '），请减少张数再试');
      }

      setProgress(0.65, '正在上传（' + fmtSize(bytes) + '）…');
      await nextFrame();
      const slug = randomSlug(6);
      const path = GH_FILE_BASE + '/' + slug + '.html';
      await publishFile(token, path, b64utf8(html), '发布画册：' + title, info.branch);

      setProgress(1, '发布成功（' + fmtSize(bytes) + '）');
      showResult(GH_PAGES + path, bytes, autoName);
      toast('✅ 发布成功，约 1 分钟后可访问');
    } catch (err) {
      setProgress(0, '失败');
      showResult(null, 0, false, err.message);
      toast('❌ ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
   *  五、面板交互
   * ============================================================ */
  let busy = false;

  function setBusy(on) {
    busy = !!on;
    const g = $('spGo'), e = $('spExport');
    if (g) { g.disabled = busy; g.textContent = busy ? '处理中…' : '🚀 开始发布'; }
    if (e) e.disabled = busy;
  }
  function setProgress(pct, text) {
    const wrap = $('spProgress'), bar = $('spBar'), t = $('spProgText');
    if (wrap) wrap.classList.add('show');
    if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, pct)) * 100) + '%';
    if (t && text) t.textContent = text;
  }
  function setConnected(login) {
    const box = $('spTokenBox'), st = $('spTokenState');
    if (!box || !st) return;
    if (login) {
      box.classList.add('ok');
      st.innerHTML = '✅ 已连接 GitHub 账号 <b>' + escHtml(login) + '</b>';
    } else {
      box.classList.remove('ok');
      st.textContent = '';
    }
  }
  function showTokenBox(show) {
    const box = $('spTokenBox');
    if (box) box.classList.toggle('open', !!show);
  }
  function showResult(link, bytes, autoNameOrExtra, errMsg) {
    const box = $('spResult'), inp = $('spLink'), note = $('spNote'), open = $('spOpen');
    if (!box) return;
    box.classList.add('show');
    box.classList.toggle('err', !!errMsg);
    if (errMsg) {
      if (inp) { inp.value = ''; inp.style.display = 'none'; }
      const cb = $('spCopy'); if (cb) cb.style.display = 'none';
      if (open) open.style.display = 'none';
      if (note) note.innerHTML = '<b>发布失败：</b>' + escHtml(errMsg);
      return;
    }
    if (!link) { box.classList.remove('show'); return; }
    if (inp) { inp.value = link; inp.style.display = ''; }
    const cb = $('spCopy'); if (cb) cb.style.display = '';
    if (open) { open.style.display = ''; open.href = link; }
    if (note) {
      note.innerHTML = '链接已生成（' + fmtSize(bytes) + '）。GitHub 需要约 1 分钟构建，稍等一会儿再点开。' +
        (autoNameOrExtra
          ? '<br>文件名用了默认的「我的画册」，在面板顶部填个标题再发一版会更好看。'
          : '') +
        '<br><span class="sp-warn">这个页面在你公开的 GitHub 站点上，拿到链接的人都能看，不要放敏感内容。</span>';
    }
  }
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const inp = $('spLink');
      inp.removeAttribute('readonly');
      inp.select();
      inp.setSelectionRange(0, 99999);
      const ok = document.execCommand('copy');
      inp.setAttribute('readonly', 'readonly');
      return ok;
    } catch (e2) { return false; }
  }

  function openPanel() {
    const p = $('sharePanel');
    if (!p) return;
    p.classList.add('show');
    const m = $('spMask');
    if (m) m.classList.add('show');
    document.body.classList.add('pa-panel-open');
    const has = !!getToken();
    showTokenBox(!has);
    const res = $('spResult');
    if (res) res.classList.remove('show');
    const pr = $('spProgress');
    if (pr) pr.classList.remove('show');
    const st = $('spTokenState');
    if (!has) { setConnected(''); if (st) st.textContent = '未配置：发布前需要填一次 GitHub 令牌'; return; }
    if (st) st.textContent = '正在校验令牌…';
    verifyToken(getToken()).then((info) => {
      showTokenBox(false);
      setConnected(info.login);
    }).catch((err) => {
      setConnected('');
      if (st) st.textContent = '⚠️ ' + err.message;
      showTokenBox(true);
    });
  }
  function closePanel() {
    const p = $('sharePanel');
    if (!p) return;
    p.classList.remove('show');
    const m = $('spMask');
    if (m) m.classList.remove('show');
    document.body.classList.remove('pa-panel-open');
  }

  /* ---------- 绑定 ---------- */
  const btnExport = $('btnExport');
  const btnPublish = $('btnPublish');
  if (btnExport) btnExport.addEventListener('click', () => doExport());
  if (btnPublish) btnPublish.addEventListener('click', openPanel);

  const spClose = $('spClose');
  if (spClose) spClose.addEventListener('click', closePanel);
  const spMask = $('spMask');
  if (spMask) spMask.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const p = $('sharePanel');
      if (p && p.classList.contains('show')) closePanel();
    }
  });

  const spGo = $('spGo');
  if (spGo) spGo.addEventListener('click', doPublish);
  const spExport = $('spExport');
  if (spExport) spExport.addEventListener('click', () => doExport());

  const spTokenSave = $('spTokenSave');
  if (spTokenSave) spTokenSave.addEventListener('click', async () => {
    const inp = $('spTokenInput');
    const v = inp ? inp.value.trim() : '';
    if (!v) { toast('请先粘贴令牌'); return; }
    spTokenSave.disabled = true;
    spTokenSave.textContent = '验证中…';
    try {
      const info = await verifyToken(v);
      setToken(v);
      setConnected(info.login);
      showTokenBox(false);
      if (inp) inp.value = '';
      toast('✅ 已连接：' + info.login);
    } catch (err) {
      toast('❌ ' + err.message);
    } finally {
      spTokenSave.disabled = false;
      spTokenSave.textContent = '保存并验证';
    }
  });
  const spTokenToggle = $('spTokenToggle');
  if (spTokenToggle) spTokenToggle.addEventListener('click', () => {
    const inp = $('spTokenInput');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    spTokenToggle.textContent = show ? '隐藏' : '显示';
  });
  const spTokenChange = $('spTokenChange');
  if (spTokenChange) spTokenChange.addEventListener('click', () => {
    setToken('');
    setConnected('');
    showTokenBox(true);
    const st = $('spTokenState');
    if (st) st.textContent = '已清除，请填入新的令牌';
  });
  const spCopy = $('spCopy');  if (spCopy) spCopy.addEventListener('click', async () => {
    const inp = $('spLink');
    if (!inp || !inp.value) return;
    const ok = await copyText(inp.value);
    toast(ok ? '✅ 链接已复制' : '复制失败，请手动选中复制');
  });

  /* 暴露给验证脚本 / 其它模块 */
  window.__albumShare = {
    buildPackage: buildPackage,
    buildHtml: buildHtml,
    doExport: doExport,
    doPublish: doPublish,
    verifyToken: verifyToken,
    getToken: getToken,
    setToken: setToken,
    openPanel: openPanel,
    closePanel: closePanel,
    randomSlug: randomSlug,
    b64utf8: b64utf8
  };


})();
