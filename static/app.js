'use strict';
const $ = (selector) => document.querySelector(selector);
const paths = {
  layers:'m3 7 9-5 9 5-9 5Z|m3 12 9 5 9-5|m3 17 9 5 9-5',
  grid:'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z',
  history:'M3 11a9 9 0 1 1 2.6 7|M3 4v7h7|M12 7v5l3 2',
  cpu:'M7 7h10v10H7z|M10 10h4v4h-4z|M9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4',
  sliders:'M4 4v7m0 4v5M12 4v3m0 4v9M20 4v10m0 4v2|M1 11h6m2-4h6m2 7h6',
  radio:'M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7|M5 5a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14|M11 11h2v2h-2z',
  chevrons:'m9 9 3-3 3 3m-6 6 3 3 3-3',
  moon:'M20.9 13a9 9 0 1 1-9.9-9.9A7 7 0 0 0 20.9 13Z',
  download:'M12 3v12m-5-5 5 5 5-5|M4 15v5h16v-5',
  refresh:'M20 7v5h-5|M4 17v-5h5|M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2',
  thermometer:'M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z|M12 10v9|M15 7h3m-3 4h2',
  droplet:'M12 2c-2 4-7 8-7 13a7 7 0 0 0 14 0c0-5-5-9-7-13Z|M8 15a4 4 0 0 0 4 4',
  activity:'M2 12h4l3-8 6 16 3-8h4',
  database:'M3 6a9 4 0 1 0 18 0 9 4 0 1 0-18 0|M3 6v12a9 4 0 0 0 18 0V6|M3 12a9 4 0 0 0 18 0',
  info:'M12 8v.01M12 11v6|M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  link:'m10 13 4-4|M8 15l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2 1 1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0',
  arrow:'M4 12h15m-5-5 5 5-5 5', search:'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16|m16 16 6 6',close:'m6 6 12 12M6 18 18 6'
};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${(paths[name]||paths.info).split('|').map(d=>`<path d="${d}"/>`).join('')}</svg>`;}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
document.querySelectorAll('.nav-item').forEach(el=>el.setAttribute('aria-label',({overview:'Visão geral',history:'Histórico',device:'Dispositivo'})[el.dataset.view]||'Preferências'));
const defaults = {interval:10,tempMin:18,tempMax:30,humMin:30,humMax:70};
function readPrefs(){
  try{
    const p=JSON.parse(localStorage.getItem('iot-prefs'))||{};
    return {...defaults,...([10,30,60].includes(p.interval)?{interval:p.interval}:{}),
      ...(Number.isFinite(p.tempMin)&&Number.isFinite(p.tempMax)&&p.tempMin>=-100&&p.tempMax<=150&&p.tempMin<p.tempMax?{tempMin:p.tempMin,tempMax:p.tempMax}:{}),
      ...(Number.isFinite(p.humMin)&&Number.isFinite(p.humMax)&&p.humMin>=0&&p.humMax<=100&&p.humMin<p.humMax?{humMin:p.humMin,humMax:p.humMax}:{})};
  }catch{return {...defaults};}
}
const state={data:null,period:'all',view:'overview',prefs:readPrefs(),timer:null,busy:false,page:1,showTemp:true,showHum:true,requestError:null};
const fmt=(n,digits=1)=>n===null||n===undefined?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function date(value,options={}){return new Intl.DateTimeFormat('pt-BR',{timeZone:state.data?.sensor.timezone||'America/Sao_Paulo',...options}).format(new Date(value));}
function fullDate(value){return date(value,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function relative(seconds){if(seconds<60)return `${seconds}s`;if(seconds<3600)return `${Math.floor(seconds/60)} min`;if(seconds<86400)return `${Math.floor(seconds/3600)} h`;return `${Math.floor(seconds/86400)} dia(s)`;}
function setText(selector,text){$(selector).textContent=text;}
function outOfRange(row){return (row.temperature!==null&&(row.temperature<state.prefs.tempMin||row.temperature>state.prefs.tempMax))||(row.humidity!==null&&(row.humidity<state.prefs.humMin||row.humidity>state.prefs.humMax));}
function rowStatus(r){if(outOfRange(r))return {className:'warning',label:'Fora da faixa'};if(r.temperature===null||r.humidity===null)return {className:'missing',label:'Leitura parcial'};return {className:'',label:'Dentro da faixa'};}
function tableRows(records){return records.map(r=>{const s=rowStatus(r);return `<tr><td>${esc(date(r.timestamp,{day:'2-digit',month:'2-digit',year:'numeric'}))}<span>${esc(date(r.timestamp,{hour:'2-digit',minute:'2-digit',second:'2-digit'}))}</span></td><td><span class="table-metric temp-value">${icon('thermometer')}${fmt(r.temperature)} °C</span></td><td><span class="table-metric humidity-value">${icon('droplet')}${fmt(r.humidity)} %</span></td><td><span class="range-status ${s.className}"><span></span>${s.label}</span></td><td><span class="device-id">ESP32-01</span></td></tr>`;}).join('')||'<tr><td colspan="5" class="empty-cell">Nenhuma leitura encontrada.</td></tr>';}
function renderStatus(){
  const d=state.data;
  if(!d)return;
  const source=d.source;
  const age=Math.max(0,Math.floor((Date.now()-new Date(source.last_reading_at))/1000));
  const status=state.requestError?'source_error':source.status==='source_error'?'source_error':age>source.stale_after_seconds?'stale':'online';
  const names={online:'Sensor com dados recentes',stale:'Leituras desatualizadas',source_error:'Falha ao consultar a fonte'};
  setText('#connection-status',names[status]);
  $('#live-dot').className=`live-dot ${status}`;
  setText('#last-updated',`Última leitura há ${relative(age)} · ${date(source.last_reading_at,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`);
  setText('#device-badge',status==='online'?'Dados recentes':status==='stale'?'Desatualizado':'Falha na fonte');
  $('#device-badge').className=`status-badge ${status==='online'?'':'warning'}`;
  const notices=[];
  if(state.requestError)notices.push(state.requestError+' Exibindo a última consulta bem-sucedida.');
  else if(source.status==='source_error')notices.push('Não foi possível atualizar a planilha. Exibindo os últimos dados disponíveis no cache.');
  if(status==='stale')notices.push(`O sensor não envia uma leitura recente há ${relative(age)}. Verifique o ESP32 e a publicação da planilha.`);
  if(source.rejected_rows||source.partial_rows)notices.push(`Qualidade da fonte: ${source.rejected_rows} linha(s) descartada(s) e ${source.partial_rows} leitura(s) parcial(is). Valores ausentes aparecem como “—”.`);
  $('#notice').hidden=!notices.length;$('#notice').className=`notice ${state.requestError?'error':''}`;setText('#notice',notices.join(' '));
}
function render(){
  const d=state.data;if(!d)return;
  setText('#sensor-name',d.sensor.name);
  setText('#app-version',`v${d.version}`);
  setText('#device-view h2',d.sensor.name);
  for(const metric of ['temperature','humidity']){
    const stats=d.stats[metric],isTemp=metric==='temperature',unit=isTemp?'°C':'%';
    setText(`#${metric}-current`,fmt(stats.current));setText(`#${metric}-mean`,`Média ${fmt(stats.mean)}${unit}`);
    const min=isTemp?state.prefs.tempMin:state.prefs.humMin,max=isTemp?state.prefs.tempMax:state.prefs.humMax;
    const outside=stats.current!==null&&(stats.current<min||stats.current>max);
    setText(`#${metric}-state`,stats.current===null?'Sem leitura':outside?'Fora da faixa':'Dentro da faixa');
    $(`#${metric}-state`).classList.toggle('warning',outside);
  }
  const t=d.stats.temperature;
  setText('#temperature-range',fmt(t.max===null||t.min===null?null:t.max-t.min));
  setText('#temperature-min',`${fmt(t.min)}°`);setText('#temperature-max',`${fmt(t.max)}°`);
  setText('#reading-count',fmt(d.total,0));
  const captions={'all':'Todo o período','1h':'Última hora','6h':'Últimas 6 horas','24h':'Últimas 24 horas'};
  setText('#period-caption',captions[state.period]);
  const recent=d.records.slice(-5).reverse();
  setText('#recent-count',recent.length);$('#recent-body').innerHTML=tableRows(recent);
  $('#export').disabled=!d.total;
  renderStatus();renderHistory();renderDevice();renderChart();
}
function renderHistory(){
  const query=$('#search').value.trim().toLowerCase();
  const records=(state.data?.records||[]).slice().reverse().filter(r=>!query||`${fullDate(r.timestamp)} ${fmt(r.temperature)} ${fmt(r.humidity)} ${r.temperature} ${r.humidity}`.toLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(records.length/15));state.page=Math.min(state.page,pages);
  $('#history-body').innerHTML=tableRows(records.slice((state.page-1)*15,state.page*15));
  setText('#page-info',`${fmt(records.length,0)} registros · Página ${state.page} de ${pages}`);
  $('#previous').disabled=state.page===1;$('#next').disabled=state.page>=pages;
}
function renderDevice(){
  if(!state.data)return;
  const d=state.data;
  const items=[['Identificador',d.sensor.id],['Fonte','Google Sheets (CSV publicado)'],['Fuso horário',d.sensor.timezone],['Última medição',fullDate(d.source.last_reading_at)],['Última consulta bem-sucedida',fullDate(d.source.fetched_at)],['Registros na fonte',fmt(d.total_available,0)],['Linhas descartadas',d.source.rejected_rows],['Leituras parciais',d.source.partial_rows],['Consulta automática',`${state.prefs.interval} segundos`]];
  $('#device-full-details').innerHTML=items.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}
function showView(view){
  state.view=view;
  for(const name of ['overview','history','device'])$(`#${name}-view`).hidden=view!==name;
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-current',button.dataset.view===view?'page':'false');});
  const titles={overview:['Visão geral','Seu ambiente, em tempo real.','Acompanhe cada mudança. Tome decisões com mais clareza.'],history:['Histórico','Cada leitura conta.','Explore os registros do seu ambiente e exporte os dados para análise.'],device:['Dispositivo','Conectado ao seu ambiente.','Conheça a origem dos dados e acompanhe a integração.']};
  setText('#breadcrumb',titles[view][0]);setText('#page-title',titles[view][1]);setText('#page-subtitle',titles[view][2]);
  if(view==='overview')requestAnimationFrame(renderChart);
  if(view==='history'&&state.period!=='all'){state.period='all';syncPeriods();loadData();}
}
function syncPeriods(){document.querySelectorAll('[data-period]').forEach(b=>{b.classList.toggle('selected',b.dataset.period===state.period);b.setAttribute('aria-pressed',String(b.dataset.period===state.period));});}
async function loadData(){
  if(state.busy)return;
  state.busy=true;$('#refresh').classList.add('spinning');$('#refresh').disabled=true;
  document.querySelectorAll('[data-period]').forEach(b=>b.disabled=true);
  const requestedPeriod=state.period;
  try{
    const response=await fetch(`/api/readings?period=${encodeURIComponent(requestedPeriod)}`,{signal:AbortSignal.timeout(20000),cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'A fonte está temporariamente indisponível.');
    state.data=data;state.requestError=null;render();
  }catch(error){
    state.requestError=error.name==='TimeoutError'?'O tempo limite de consulta foi atingido.':error.message==='Failed to fetch'?'Não foi possível conectar à API.':error.message;
    if(state.data)renderStatus();
    else{setText('#connection-status','Fonte indisponível');$('#notice').hidden=false;$('#notice').className='notice error';setText('#notice',`${state.requestError} Uma nova consulta será feita automaticamente.`);$('#chart-container').innerHTML='<div class="chart-empty">Sem dados disponíveis. Use o botão de atualizar para tentar novamente.</div>';$('#recent-body').innerHTML='<tr><td colspan="5" class="empty-cell">Aguardando conexão com a fonte.</td></tr>';}
  }finally{
    state.busy=false;$('#refresh').classList.remove('spinning');$('#refresh').disabled=false;
    document.querySelectorAll('[data-period]').forEach(b=>b.disabled=false);
    if(state.period!==requestedPeriod){loadData();}else{schedule();}
  }
}
function schedule(){clearTimeout(state.timer);if(!document.hidden)state.timer=setTimeout(loadData,state.prefs.interval*1000);}

// SVG com dois eixos independentes. Mantém lacunas para medições ausentes.
function renderChart(){
  const container=$('#chart-container');if(!state.data||state.view!=='overview')return;
  const records=state.data.records;
  if(!records.length){container.innerHTML='<div class="chart-empty">Nenhum registro neste período.</div>';return;}
  const width=Math.max(300,container.clientWidth-24),height=Math.max(190,container.clientHeight-12);
  const left=37,right=width-37,top=21,bottom=height-32;
  const times=records.map(r=>new Date(r.timestamp).getTime());
  const first=times[0],last=times.at(-1),duration=last-first||1;
  const x=i=>records.length===1?(left+right)/2:left+(times[i]-first)/duration*(right-left);
  function domain(metric){const values=records.map(r=>r[metric]).filter(v=>v!==null);if(!values.length)return [0,100];const min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.3,metric==='temperature'?1:3);return [Math.floor(min-pad),Math.ceil(max+pad)];}
  const td=domain('temperature'),hd=domain('humidity');
  const y=(v,d)=>bottom-(v-d[0])/(d[1]-d[0])*(bottom-top);
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico temporal de temperatura e umidade. Valores exatos disponíveis no histórico."><defs><linearGradient id="temp-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dca25f" stop-opacity=".13"/><stop offset="1" stop-color="#dca25f" stop-opacity="0"/></linearGradient></defs>`;
  for(let i=0;i<=4;i++){
    const yy=top+(bottom-top)*i/4;
    svg+=`<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="var(--border)" stroke-dasharray="3 4"/><text x="${left-10}" y="${yy+3}" text-anchor="end" fill="${state.showTemp?'#bb965f':'var(--muted)'}" font-size="9">${state.showTemp?fmt(td[1]-(td[1]-td[0])*i/4,1):''}</text><text x="${right+10}" y="${yy+3}" fill="${state.showHum?'#75a298':'var(--muted)'}" font-size="9">${state.showHum?fmt(hd[1]-(hd[1]-hd[0])*i/4,0):''}</text>`;
  }
  const ticks=width<420?3:5;
  for(let i=0;i<ticks;i++){
    const xx=left+(right-left)*i/(ticks-1),at=first+(last-first)*i/(ticks-1);
    svg+=`<text x="${xx}" y="${height-9}" fill="var(--muted)" text-anchor="middle" font-size="9">${esc(date(at,last-first>86400000?{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}:{hour:'2-digit',minute:'2-digit'}))}</text>`;
  }
  function series(metric,d,color,visible){
    if(!visible)return '';
    let segments=[],segment=[];
    records.forEach((r,i)=>{if(r[metric]===null){if(segment.length)segments.push(segment);segment=[];}else segment.push([x(i),y(r[metric],d)]);});if(segment.length)segments.push(segment);
    return segments.map(points=>{
      // É seguro simplificar a visualização; exportação e estatísticas usam todas as linhas.
      const step=Math.max(1,Math.ceil(points.length/800));
      const sampled=points.filter((_,i)=>i%step===0||i===points.length-1);
      if(sampled.length===1)return `<circle cx="${sampled[0][0]}" cy="${sampled[0][1]}" r="3" fill="${color}"/>`;
      const path=sampled.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
      const fill=metric==='temperature'?`<path d="${path} L${sampled.at(-1)[0]},${bottom} L${sampled[0][0]},${bottom}Z" fill="url(#temp-fill)"/>`:'';
      return `${fill}<path d="${path}" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" fill="none"/>`;
    }).join('');
  }
  svg+=series('temperature',td,'#d6a15e',state.showTemp)+series('humidity',hd,'#53978c',state.showHum);
  svg+=`<line id="chart-crosshair" x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/></svg><div class="chart-tooltip" hidden></div>`;
  container.innerHTML=svg;setText('#chart-date',date(records.at(-1).timestamp,{day:'2-digit',month:'short',year:'numeric'}));
  const element=container.querySelector('svg'),tooltip=container.querySelector('.chart-tooltip'),crosshair=$('#chart-crosshair');
  element.addEventListener('pointermove',event=>{
    const box=element.getBoundingClientRect(),position=(event.clientX-box.left)/box.width*width;
    const target=first+Math.max(0,Math.min(1,(position-left)/(right-left)))*duration;
    let lo=0,hi=times.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(times[mid]<target)lo=mid+1;else hi=mid;}
    const index=lo>0&&Math.abs(times[lo-1]-target)<Math.abs(times[lo]-target)?lo-1:lo,r=records[index];
    tooltip.innerHTML=`<strong>${esc(fullDate(r.timestamp))}</strong><div class="tooltip-temp">Temperatura <span>${fmt(r.temperature)} °C</span></div><div class="tooltip-hum">Umidade <span>${fmt(r.humidity)} %</span></div>`;
    tooltip.hidden=false;tooltip.style.left=`${Math.max(5,Math.min(container.clientWidth-tooltip.offsetWidth-6,event.clientX-container.getBoundingClientRect().left+12))}px`;tooltip.style.top='18px';
    crosshair.setAttribute('x1',x(index));crosshair.setAttribute('x2',x(index));crosshair.setAttribute('visibility','visible');
  });
  element.addEventListener('pointerleave',()=>{tooltip.hidden=true;crosshair.setAttribute('visibility','hidden');});
}
function toast(message){setText('#toast',message);$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,3200);}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('#all-readings').addEventListener('click',()=>showView('history'));
$('#device-details-button').addEventListener('click',()=>showView('device'));
$('#refresh').addEventListener('click',loadData);
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{state.period=b.dataset.period;state.page=1;syncPeriods();loadData();}));
$('#toggle-temperature').addEventListener('click',()=>{state.showTemp=!state.showTemp;$('#toggle-temperature').setAttribute('aria-pressed',String(state.showTemp));renderChart();});
$('#toggle-humidity').addEventListener('click',()=>{state.showHum=!state.showHum;$('#toggle-humidity').setAttribute('aria-pressed',String(state.showHum));renderChart();});
$('#search').addEventListener('input',()=>{state.page=1;renderHistory();});
$('#previous').addEventListener('click',()=>{state.page--;renderHistory();});$('#next').addEventListener('click',()=>{state.page++;renderHistory();});
$('#export').addEventListener('click',()=>{
  if(!state.data)return;
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const rows=[['Data e hora (ISO 8601 UTC)','Temperatura (°C)','Umidade (%)'],...state.data.records.map(r=>[r.timestamp,r.temperature===null?'':fmt(r.temperature,2),r.humidity===null?'':fmt(r.humidity,2)])];
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`iot-esp32-${state.period}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${fmt(state.data.total,0)} leituras exportadas.`);
});
$('#settings-nav').addEventListener('click',()=>{
  const p=state.prefs;
  $('#setting-interval').value=p.interval;$('#setting-temp-min').value=p.tempMin;$('#setting-temp-max').value=p.tempMax;$('#setting-hum-min').value=p.humMin;$('#setting-hum-max').value=p.humMax;setText('#settings-error','');$('#settings').showModal();
});
$('#close-settings').addEventListener('click',()=>$('#settings').close());
$('#settings-form').addEventListener('submit',event=>{
  event.preventDefault();
  const prefs={interval:Number($('#setting-interval').value),tempMin:Number($('#setting-temp-min').value),tempMax:Number($('#setting-temp-max').value),humMin:Number($('#setting-hum-min').value),humMax:Number($('#setting-hum-max').value)};
  if(prefs.tempMin>=prefs.tempMax||prefs.humMin>=prefs.humMax){setText('#settings-error','A mínima deve ser menor que a máxima em ambas as faixas.');return;}
  state.prefs=prefs;let saved=true;try{localStorage.setItem('iot-prefs',JSON.stringify(prefs));}catch{saved=false;}
  setText('#interval-label',`A cada ${prefs.interval} segundos`);$('#settings').close();render();schedule();toast(saved?'Preferências salvas neste navegador.':'Preferências aplicadas nesta sessão. O navegador bloqueou o armazenamento.');
});
try{document.body.classList.toggle('dark',localStorage.getItem('iot-theme')==='dark');}catch{}
$('#theme').addEventListener('click',()=>{document.body.classList.toggle('dark');try{localStorage.setItem('iot-theme',document.body.classList.contains('dark')?'dark':'light');}catch{}});
setText('#today',date(Date.now(),{day:'2-digit',month:'long',year:'numeric'}));setText('#interval-label',`A cada ${state.prefs.interval} segundos`);
new ResizeObserver(()=>requestAnimationFrame(renderChart)).observe($('#chart-container'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(state.timer);else loadData();});
setInterval(renderStatus,15000);
syncPeriods();loadData();
