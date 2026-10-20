'use strict';
/* KONTUR v9 — unified time-based diplomacy, persistent politics, staffed services and sustained military support. */
(function installKonturV9(){
  const Sim=window.RepublicSimulation, UI=window.RepublicDashboardUI, Scene=window.RepublicCityScene;
  if(!Sim||!UI||!Scene)return;
  if(window.GAME_CONFIG)window.GAME_CONFIG.version='9.0.0';
  const SP=Sim.prototype, UP=UI.prototype, P=Scene.prototype;
  const oldTick=SP.tick, oldReset=SP.reset, oldStartNegotiations=SP.startNegotiations, oldResolveNegotiation=SP.resolveNegotiation;
  const oldAction=SP.enactAction, oldArrive=SP.serviceArrive, oldHourly=SP._hourlyStep, oldMaybeResign=SP._maybeResign, oldPoliceDoctrine=SP._updatePoliceDoctrine;
  const oldSave=UP.saveGame, oldLoad=UP.loadGame, oldStats=UP.updateStats;
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nowOf=s=>(Math.max(1,Number(s.day)||1)-1)*1440+(Number(s.hour)||0)*60+(Number(s.minute)||0);
  const hourOf=s=>Number(s.hoursElapsed)||0;
  const groupTopic=g=>g?.demand||g?.name||'конкретные условия и сроки решения вопроса';
  const nextId=(s,prefix,key)=>`${prefix}-${String(s[key]=(Number(s[key])||0)+1).padStart(4,'0')}`;
  function ensureState(s,reset=false){
    const firstV9=!reset&&!s.v9Initialized;
    const legacyNegotiation=firstV9?{...(s.negotiationProcess||{})}:null;
    const legacyActive=firstV9&&s.activeNegotiation?{...s.activeNegotiation}:null;
    if(reset||!s.v9Initialized){
      s.v9Initialized=true;s.negotiationTracks=[];s.negotiationSequence=0;s.v9DecisionSequence=0;s.v9Decisions=[];s.v9EventSequence=0;s.v9EventLog=[];s.politicalDecisionLog=[];s.v9PoliticalSequence=0;s.v9NextPoliticalAt=nowOf(s)+240;s.v9PoliticalCursor=0;s.v9CurrentDecisionId=null;s.v9MigrationDone=false;
      s.militaryUnitsOnScene=0;s.militaryTaskState=s.militaryDeployed?'защита критической инфраструктуры и безопасных коридоров':'резерв';s.militaryMandateEndsAt=s.militaryDeployed?nowOf(s)+1440:null;s.militaryRenewalPending=false;s.v9ExplicitMilitaryWithdrawal=false;s.dualPowerEffectsAt=nowOf(s);
    }
    if(!Array.isArray(s.negotiationTracks))s.negotiationTracks=[];
    if(!Array.isArray(s.v9Decisions))s.v9Decisions=[];
    if(!Array.isArray(s.v9EventLog))s.v9EventLog=[];
    if(!Array.isArray(s.politicalDecisionLog))s.politicalDecisionLog=[];
    if(typeof s.v9DecisionSequence!=='number')s.v9DecisionSequence=0;
    if(typeof s.negotiationSequence!=='number')s.negotiationSequence=0;
    if(typeof s.v9EventSequence!=='number')s.v9EventSequence=0;
    if(typeof s.v9PoliticalSequence!=='number')s.v9PoliticalSequence=0;
    if(typeof s.v9NextPoliticalAt!=='number')s.v9NextPoliticalAt=nowOf(s)+240;
    if(typeof s.militaryUnitsOnScene!=='number')s.militaryUnitsOnScene=0;
    if(typeof s.dualPowerEffectsAt!=='number')s.dualPowerEffectsAt=nowOf(s);
    // The old instant negotiation objects are never allowed to progress independently.
    if(s.negotiationProcess){s.negotiationProcess.active=false;if(s.negotiationProcess.status==='переговоры идут')s.negotiationProcess.status='перенесены в единый реестр дипломатии';}
    s.activeNegotiation=null;
    if(!s.v9MigrationDone){
      // Set this first: createTrack calls ensureState recursively.
      s.v9MigrationDone=true;
      const legacy=legacyNegotiation?.active?legacyNegotiation:null;
      const old=legacyActive&&(legacyActive.active||legacyActive.status==='active'||legacyActive.stage)?legacyActive:null;
      if((legacy||old)&&window.gameSimulation){
        const source=legacy||old;
        createTrack(window.gameSimulation,{topic:source.topic||source.offer||source.demand||'Продолжение переговоров из сохранения',party:source.side||source.party||'Представители общественности',demand:source.offer||source.demand||'Проверить ранее согласованные требования и сроки исполнения',format:'direct',legacy:true});
      }
    }
  }
  function logEvent(sim,title,body,kind='info',trackId=null){
    const s=sim.state;ensureState(s);
    const item={id:++s.v9EventSequence,at:nowOf(s),day:s.day||1,hour:s.hour||0,title,body,kind,trackId};
    s.v9EventLog.unshift(item);s.v9EventLog=s.v9EventLog.slice(0,48);
    renderDiplomacy(s);banner(title,body,kind);return item;
  }
  function banner(title,body,kind='info'){
    if(!document.body)return;
    let stack=document.getElementById('v9-banner-stack');
    if(!stack){stack=document.createElement('div');stack.id='v9-banner-stack';stack.className='v9-banner-stack';stack.setAttribute('aria-live','polite');document.body.appendChild(stack);}
    const item=document.createElement('article');item.className=`v9-banner v9-banner-${['warning','critical','success'].includes(kind)?kind:'info'}`;
    const h=document.createElement('strong');h.textContent=title;const p=document.createElement('p');p.textContent=body;item.append(h,p);stack.prepend(item);
    while(stack.children.length>4)stack.lastElementChild.remove();window.setTimeout(()=>{item.classList.add('v9-banner-hide');window.setTimeout(()=>item.remove(),350);},8000);
  }
  function questionList(track){
    const topic=track.topic||'текущий общественный вопрос';
    const base=[
      `Какой конкретный результат стороны считают достаточным по теме «${topic}»?`,
      `Какие немедленные меры и какие поэтапные уступки приемлемы сторонам?`,
      `Какие гарантии, наблюдатели и механизм независимой проверки нужны?`,
      `К какому сроку должен появиться первый измеримый результат и кто отвечает?`,
      `Какие условия позволят подтвердить соглашение и перейти к его исполнению?`
    ];
    return base.map((q,i)=>track.format==='mediated'?`Посредник · вопрос ${i+1}/5: ${q}`:`Прямой раунд · вопрос ${i+1}/5: ${q}`);
  }
  function createTrack(sim,opts={}){
    const s=sim.state;ensureState(s);const now=nowOf(s);
    const id=nextId(s,'NEG','negotiationSequence');
    const all=typeof sim.getProtestGroups==='function'?sim.getProtestGroups():[];
    const group=all.find(g=>g.id===opts.groupId)||(!opts.groupId&&!opts.party?all.filter(g=>g.id!=='supporters').sort((a,b)=>(b.grievance||0)-(a.grievance||0))[0]:null)||null;
    const topic=String(opts.topic||group?.name||'Общественно-политическое урегулирование').trim().slice(0,180)||'Общественно-политическое урегулирование';
    const demand=String(opts.demand||groupTopic(group)).trim().slice(0,350);
    const track={id,topic,demand,party:String(opts.party||group?.name||'Представители общественности'),representative:group?.representative||String(opts.party||'Делегация'),groupId:opts.groupId||group?.id||null,grievance:Number(group?.grievance)||50,leverage:clamp((s.unions?.leverage||0)+(s.dualPower?.active?(s.dualPower.control||0)*.25:0)+(opts.party==='Полицейская служба'?12:0),0,100),format:opts.format==='mediated'?'mediated':'direct',mediator:opts.format==='mediated'?'Независимый посредник':null,status:'Ожидает мандата правительства',stage:'mandate',startedAt:null,endAt:null,duration:0,elapsed:0,progress:0,round:0,maxRounds:5,agenda:[],agendaIndex:0,nextAt:null,pendingDecisionId:null,pendingActorResponse:null,acceptedTopics:[],partialTopics:[],rejectedTopics:[],transcript:[],obligations:[],openingBias:0,result:null,createdAt:now,updatedAt:now,closed:false,legacy:!!opts.legacy};
    track.transcript.push({at:now,side:'system',speaker:'Секретариат переговоров',text:`Открыта отдельная линия по теме «${topic}». Сторона: ${track.party}. Формат: ${track.format==='mediated'?'при посреднике':'прямой диалог'}.`});
    s.negotiationTracks.unshift(track);s.negotiationTracks=s.negotiationTracks.slice(0,24);
    queueDecision(sim,{type:'mandate',trackId:id,kicker:'ПЕРЕГОВОРЫ · МАНДАТ',title:`Утвердить мандат: ${topic}`,speaker:`Сторона: ${track.party}. Формат предварительно выбран: ${track.format==='mediated'?'при посреднике':'прямой диалог'}.`,body:`Повестка будет состоять из пяти вопросов. После каждого ответа сторона получит время на рассмотрение, а ход, срок ответа, встречная позиция и результат будут записаны в протокол. Трек рассчитан на ${track.format==='mediated'?'18':'12'} игровых часов.`,timeout:150,defaultChoice:'formal',choices:[['direct','Провести прямой раунд','Начать без посредника; быстрее, но сложнее согласовать гарантии.'],['mediator','Назначить независимого посредника','Добавить правила процедуры и больше времени на ответы сторон.'],['concession','Дать ограниченный мандат на уступки','Повысить вероятность согласия, оставив бюджетные и правовые пределы.'],['decline','Отказаться от переговоров','Закрыть эту линию; напряжённость и мобилизация могут вырасти.'],['formal','Сначала закрепить повестку','Запросить точные требования, календарь ответов и ответственных лиц.']]});
    s.lastDiplomacyTrack=id;logEvent(sim,'Открыта новая линия переговоров',`Тема: ${topic}. Участники: ${track.party}. Ожидается решение по мандату.`, 'info',id);
    renderDiplomacy(s,true);return track;
  }
  function queueDecision(sim,d){
    const s=sim.state;ensureState(s);
    const item={id:nextId(s,'DEC','v9DecisionSequence'),type:d.type,trackId:d.trackId||null,kicker:d.kicker||'ТРЕБУЕТСЯ РЕШЕНИЕ',title:d.title||'Требуется решение',speaker:d.speaker||'',body:d.body||'',choices:d.choices||[],timeout:Math.max(30,Number(d.timeout)||90),defaultChoice:d.defaultChoice||d.choices?.[0]?.[0],createdAt:nowOf(s),shownAt:null,deadlineAt:null,status:'queued',payload:d.payload||null};
    s.v9Decisions.push(item);s.v9Decisions=s.v9Decisions.slice(-80);const tr=item.trackId?s.negotiationTracks.find(t=>t.id===item.trackId):null;if(tr){tr.pendingDecisionId=item.id;tr.status=`Ожидает решения: ${item.title}`;tr.updatedAt=nowOf(s);}
    if(d.notify!==false)banner(item.title,`${item.body} Окно решения будет открыто над сценой.`,d.type==='politics'?'warning':'info');
    renderDiplomacy(s);renderDecision(sim);return item;
  }
  function createPromise(sim,track,topic,decision){
    const s=sim.state;if(!Array.isArray(s.promises))s.promises=[];
    const t=(topic||track.topic||'Согласованный вопрос').replace(/^Прямой раунд · вопрос \d\/5: /,'').replace(/^Посредник · вопрос \d\/5: /,'');
    const text=`Принять и исполнить согласованные меры по теме «${track.topic}»: ${t}`;
    const lower=(track.topic+' '+track.demand+' '+t).toLowerCase();
    const targetKey=/здрав|медиц|лечен|больниц/.test(lower)?'healthcare':/дорог|транспорт|маршрут|инфраструкт|автобус/.test(lower)?'infrastructure':/эколог|воздух|выброс/.test(lower)?'environment':/налог|бюджет|расход|пошлин/.test(lower)?'tax':/свобод|пресс|медиа|прав|наблюдател/.test(lower)?'mediaFreedom':'welfare';
    s.promiseSequence=Number(s.promiseSequence)||0;const id=++s.promiseSequence;
    const cost=targetKey==='welfare'?.013:targetKey==='healthcare'?.016:targetKey==='infrastructure'?.018:.008;
    const createdAt=hourOf(s), deadlineAt=createdAt+(track.format==='mediated'?60:48);
    const p={id,title:`Соглашение ${track.id}: ${track.topic}`,groupId:track.groupId||'custom',groupName:track.party,demand:text,targetKey,deadlineAt,deadlineDay:(s.day||1)+Math.ceil((deadlineAt-createdAt)/24),status:'pending',createdAt,cost,negotiationId:track.id,agendaItem:t,acceptedBy:track.party,condition:decision==='compromise'?'поэтапное исполнение с публичным отчётом':'исполнение с контрольным сроком'};
    s.promises.unshift(p);s.promises=s.promises.slice(0,50);track.obligations.push(id);return p;
  }
  function record(sim,track,side,speaker,text,kind='info'){
    const t=typeof track==='string'?sim.state.negotiationTracks.find(x=>x.id===track):track;if(!t)return;
    const at=nowOf(sim.state);t.transcript.push({at,side,speaker,text,kind});t.updatedAt=at;
    logEvent(sim,`${t.topic}: ${side==='government'?'позиция правительства':side==='party'?'ответ стороны':'ход процесса'}`,text,kind,t.id);
  }
  function finishTrack(sim,t,forcedReason=null){
    const s=sim.state;if(t.closed)return;t.closed=true;t.stage='complete';t.pendingDecisionId=null;t.pendingActorResponse=null;t.progress=100;t.elapsed=t.duration;t.updatedAt=nowOf(s);
    const agreed=t.acceptedTopics.length,partial=(t.partialTopics||[]).length,disputed=t.rejectedTopics.length,asked=Math.max(1,t.round);
    let outcome=forcedReason==='declined'?'Без соглашения':agreed>=3?'Соглашение достигнуто':(agreed+partial)>0?'Частичное соглашение':'Переговоры без результата';
    if(forcedReason==='timeout')outcome=(agreed+partial)>0?'Частичный результат; сроки истекли':'Срок переговоров истёк без соглашения';
    t.result={outcome,agreedTopics:agreed,partialTopics:partial,rejectedTopics:disputed,topicsDiscussed:asked,obligations:t.obligations.length,finishedAt:nowOf(s),reason:forcedReason||'завершена повестка'};
    t.status=outcome+(t.obligations.length?` · ${t.obligations.length} обязательств на исполнении`:'');
    if(agreed>=3){s.crowdAnger=clamp((s.crowdAnger||0)-28,0,1000);s.publicAnger=clamp((s.publicAnger||0)-7,0,100);s.tension=clamp((s.tension||0)-5,0,100);s.trust=clamp((s.trust||50)+2.5,0,100);s.approval=clamp((s.approval||50)+1.5,0,100);}
    else if(agreed+partial>0){s.crowdAnger=clamp((s.crowdAnger||0)-9,0,1000);s.tension=clamp((s.tension||0)-1.5,0,100);s.trust=clamp((s.trust||50)+.6,0,100);}
    else{s.crowdAnger=clamp((s.crowdAnger||0)+18,0,1000);s.publicAnger=clamp((s.publicAnger||0)+4,0,100);s.tension=clamp((s.tension||0)+3.5,0,100);s.trust=clamp((s.trust||50)-2,0,100);}
    record(sim,t,'system','Секретариат переговоров',`Итог: ${outcome}. Обсуждено вопросов: ${t.round}; согласовано: ${agreed}; частично согласовано: ${partial}; отклонено: ${disputed}. Обязательства к исполнению: ${t.obligations.length}.`,(agreed+partial)>0?'success':'warning');
    if(typeof sim.addNews==='function')sim.addNews('politics',(agreed+partial)>0?'good':'warning',`Итоги переговоров: ${t.topic}`,`Результат: ${outcome}. Полностью согласовано ${agreed}, частично согласовано ${partial}; ${t.obligations.length} обязательств зарегистрированы в реестре и требуют исполнения.`);
    if(t.groupId==='workers'||/профсоюз|забастов/i.test(t.party)){if(agreed>=2){s.activeStrikes=Math.max(0,(s.activeStrikes||0)-1);if(s.unions)s.unions.phase='переговоры завершены частичной договорённостью';}}
    renderDiplomacy(s);banner(`Результат: ${outcome}`,`${t.topic}. Полностью согласовано: ${agreed}; частично: ${partial}; разногласий: ${disputed}. Обязательств на исполнении: ${t.obligations.length}.` ,(agreed+partial)>0?'success':'warning');sim._notify?.('update');
  }
  function applyMandate(sim,t,choice,automatic=false){
    const s=sim.state;const now=nowOf(s);t.pendingDecisionId=null;
    if(choice==='decline'){record(sim,t,'government','Правительство','Правительство отказалось от переговоров; вопрос возвращён в политическую повестку.','warning');t.duration=150;t.startedAt=now;t.endAt=now;t.stage='complete';finishTrack(sim,t,'declined');return;}
    t.format=choice==='mediator'?'mediated':choice==='direct'?'direct':t.format;
    t.mediator=t.format==='mediated'?'Независимый посредник':null;
    t.duration=t.format==='mediated'?1080:720;t.startedAt=now;t.endAt=now+t.duration;t.agenda=questionList(t);t.agendaIndex=0;t.round=0;t.stage='agenda';t.nextAt=now+(t.format==='mediated'?30:20);t.status='Повестка утверждена; ожидается первый вопрос';
    if(choice==='concession')t.openingBias=14;
    if(choice==='formal'){t.nextAt=now+(t.format==='mediated'?45:35);t.openingBias=3;}
    const extra=t.format==='mediated'?' Посредник фиксирует порядок выступлений и сроки ответов.':' Секретариат ведёт последовательный протокол прямого диалога.';
    record(sim,t,'government','Правительство',`Мандат утверждён; формат — ${t.format==='mediated'?'с посредником':'прямой'}.${choice==='concession'?' Кабинет допускает ограниченные уступки.':choice==='formal'?' До обсуждения уступок требуется сверить повестку.':''}${extra}`,'info');
    logEvent(sim,'Переговорный календарь обновлён',`${t.topic}: следующая стадия через ${Math.max(1,t.nextAt-now)} игровых минут; общий срок ${t.duration} игровых минут.`, 'info',t.id);renderDiplomacy(s);
  }
  function decideQuestion(sim,t,choice,automatic=false){
    const s=sim.state;const ix=t.agendaIndex;const q=t.agenda[ix];t.pendingDecisionId=null;t.round++;
    const names={accept:'принять требование с обязательством',compromise:'предложить поэтапный компромисс',inquiry:'назначить слушания и независимую проверку',delay:'запросить расчёты и перенести ответ',reject:'отклонить требование'};
    record(sim,t,'government','Правительство',`${q} Ответ кабинета: ${names[choice]||'ответ не дан'}${automatic?' (срок ответа истёк)':''}.`,choice==='reject'?'warning':'info');
    const bases={accept:55,compromise:35,inquiry:25,delay:10,reject:-20};
    const trust=clamp((s.trust||50)-50,-50,50)*.18;
    const approval=clamp((s.approval??50)-50,-50,50)*.16;
    const grievance=-clamp((t.grievance||50)-50,-50,50)*.18;
    const anger=-clamp((s.crowdAnger||0)/1000,0,1)*15;
    const leverage=clamp(t.leverage||0,0,100)*.10;
    const mediator=t.format==='mediated'?7:0;
    const autoPenalty=automatic?-12:0;
    const score=(bases[choice]??0)+trust+approval+grievance+anger+leverage+mediator+(t.openingBias||0)+autoPenalty+(Math.random()*6-3);
    t.pendingActorResponse={at:nowOf(s)+(t.format==='mediated'?45:30),choice,score,index:ix,question:q,automatic};t.stage='party_response';t.status=`Ожидается ответ стороны · срок ${(t.format==='mediated'?45:30)} игровых минут`;t.nextAt=t.pendingActorResponse.at;t.updatedAt=nowOf(s);
    renderDiplomacy(s);
  }
  function processActorResponse(sim,t,now){
    const r=t.pendingActorResponse;if(!r)return;const s=sim.state;t.pendingActorResponse=null;
    const accepted=r.score>=35;const partial=!accepted&&r.score>=20&&['compromise','inquiry','delay'].includes(r.choice);
    const q=t.agenda[r.index]||t.topic;
    let text;
    if(accepted){text=`Делегация принимает предложенный подход по пункту повестки при зафиксированном контроле исполнения: ${q}`;t.acceptedTopics.push(q);const pr=createPromise(sim,t,q,r.choice);text+=` Обязательство №${pr.id}: срок ${pr.deadlineAt} игровых часов от начала кампании, ответственный кабинет.`;}
    else if(partial){text=`Делегация не принимает предложение полностью, но согласна продолжить работу над пунктом «${q}» при уточнении условий.`;t.partialTopics=t.partialTopics||[];t.partialTopics.push(q);const pr=createPromise(sim,t,`процедурный следующий шаг: ${q}`,'compromise');text+=` Зарегистрировано промежуточное обязательство №${pr.id}: уточнить условия и представить публичный график до срока исполнения.`;t.openingBias=Math.max(0,(t.openingBias||0)-2);}
    else{text=`Делегация отклоняет текущую позицию по пункту «${q}» и фиксирует разногласие. Канал переговоров остаётся открытым.`;t.rejectedTopics.push(q);t.openingBias=Math.max(0,(t.openingBias||0)-3);}
    record(sim,t,'party',t.format==='mediated'?'Независимый посредник / делегация':t.representative,text,accepted?'success':partial?'info':'warning');
    if(!accepted&&!partial){s.crowdAnger=clamp((s.crowdAnger||0)+4,0,1000);s.tension=clamp((s.tension||0)+1,0,100);}
    t.agendaIndex++;t.stage='agenda';t.status=`Вопрос ${Math.min(t.agendaIndex,5)}/5 рассмотрен · ${accepted?'согласован':partial?'нужны уточнения':'разногласие'}`;t.nextAt=now+(t.format==='mediated'?25:15);t.updatedAt=now;
    if(t.agendaIndex>=t.agenda.length){t.nextAt=now;t.endAt=now;}
    renderDiplomacy(s);
  }
  function queueAgendaDecision(sim,t){
    const q=t.agenda[t.agendaIndex];if(!q){t.nextAt=t.endAt;return;}
    const timeout=t.format==='mediated'?100:70;
    queueDecision(sim,{type:'agenda',trackId:t.id,kicker:`ПЕРЕГОВОРЫ · ВОПРОС ${t.agendaIndex+1}/5`,title:q,speaker:`${t.party}${t.mediator?' · процедуру ведёт '+t.mediator:''}. Раунд ${t.round+1}.`,body:`Тема линии: ${t.topic}. Требование / предмет обсуждения: ${t.demand}. Выберите позицию кабинета. Сторона получит ${timeout} игровых минут на рассмотрение; при посреднике окно длиннее, а ответ включает процедурную проверку.`,timeout,defaultChoice:'delay',choices:[['accept','Принять требование и зарегистрировать обязательство','Высокая вероятность согласия; обязательство попадёт в реестр исполнения.'],['compromise','Предложить поэтапный компромисс','Средний компромисс с публичным сроком и контрольным пунктом.'],['inquiry','Назначить слушания и независимую проверку','Даёт процедурный ответ, но само по себе не решает материальную часть.'],['delay','Запросить расчёты и продлить ответ','Сохранить канал, но сторона может счесть это затягиванием.'],['reject','Отклонить требование','Высокий риск провала этого пункта и роста напряжённости.']]});
  }
  function queuePoliticalDecision(sim){
    const s=sim.state;const idx=(s.v9PoliticalCursor||0)%politicalEvents.length;const e=politicalEvents[idx];s.v9PoliticalCursor=(idx+1)%politicalEvents.length;
    const choices=e.choices.map(c=>[c[0],c[1],c[2]]);
    queueDecision(sim,{type:'politics',kicker:'ПОСТОЯННЫЙ ПОЛИТИЧЕСКИЙ КАЛЕНДАРЬ',title:e.title,speaker:e.speaker,body:e.body,timeout:150,defaultChoice:e.defaultChoice||choices[1]?.[0]||choices[0]?.[0],choices,payload:{eventKey:e.key}});
    s.v9PoliticalSequence=(s.v9PoliticalSequence||0)+1;s.v9NextPoliticalAt=nowOf(s)+480;
  }
  const politicalEvents=[
    {key:'confidence',title:'Парламентское доверие кабинету',speaker:'Председатель парламентского совета',body:'Фракции требуют подтвердить способность кабинета проводить решения. Выберите политическую линию; результат останется в реестре и повлияет на управляемость.',defaultChoice:'coalition',choices:[['coalition','Собрать коалицию большинства','Уступки партнёрам; выше устойчивость, часть программы замедлится.'],['reshuffle','Перестроить кабинет министров','Кадровый импульс, но переходный период и критика оппозиции.'],['inquiry','Открыть межфракционное расследование','Повысить прозрачность ценой риска для действующих руководителей.']]},
    {key:'budget',title:'Бюджетный пакет на ближайший период',speaker:'Министерство финансов и бюджетная комиссия',body:'Нужно выбрать приоритет расходов. Решение меняет реальные параметры политики, бюджет и поддержку правительства.',defaultChoice:'social',choices:[['social','Увеличить социальные расходы','Поддержка домохозяйств и работников растёт; резерв казны снижается.'],['infrastructure','Направить средства в транспорт и инфраструктуру','Улучшение городской логистики и занятости с задержкой результата.'],['austerity','Сдержать расходы и накопить резерв','Стабилизирует казну, но снижает поддержку и увеличивает социальные претензии.']]},
    {key:'media',title:'Закон о прозрачности и работе СМИ',speaker:'Комиссия по правам и публичному вещанию',body:'Обсуждается порядок доступа к информации, расследованию инцидентов и публикации государственных документов.',defaultChoice:'independent',choices:[['independent','Гарантировать независимый контроль','Повысить доверие и свободу СМИ; возможны неудобные расследования.'],['briefing','Создать ежедневный брифинг правительства','Увеличить прозрачность умеренно, сохранив координацию сообщений.'],['restrict','Расширить ограничения публикаций','Краткосрочный контроль сообщения, высокий риск утраты доверия.']]},
    {key:'regions',title:'Полномочия муниципалитетов и регионов',speaker:'Совет мэров и региональных делегаций',body:'Региональные администрации требуют ресурсов и права адаптировать меры к местной ситуации.',defaultChoice:'decentralize',choices:[['decentralize','Передать часть полномочий регионам','Повысить местную легитимность; центр теряет часть оперативного контроля.'],['fund','Выделить целевое финансирование','Помочь регионам без крупной реформы полномочий.'],['centralize','Сохранить централизованное управление','Единый курс, но вероятен рост регионального недовольства.']]},
    {key:'security',title:'Проверка чрезвычайных полномочий',speaker:'Парламентская комиссия по безопасности',body:'Чрезвычайные меры требуют срока, пропорциональности и публичного надзора. Выберите режим их дальнейшего применения.',defaultChoice:'review',choices:[['review','Оставить меры с надзором и конечным сроком','Сохранить готовность, ограничив произвольное продление.'],['end','Свернуть чрезвычайный режим','Восстановить обычные процедуры; потребуется усилить гражданские службы.'],['expand','Расширить полномочия силовых органов','Быстрый административный эффект, высокий политический риск.']]},
    {key:'transport',title:'Национальный план транспорта и стачек',speaker:'Совет транспорта и профсоюзных делегаций',body:'Срыв графиков и трудовой конфликт затрагивают экономику. Требуется выбрать способ урегулирования.',defaultChoice:'tripartite',choices:[['tripartite','Создать трёхстороннюю комиссию','Работодатели, профсоюзы и правительство согласуют календарь и гарантии.'],['subsidy','Ввести временную поддержку перевозчиков','Быстро снизить сбои, но увеличить расходы.'],['enforce','Усилить обязательность выполнения расписания','Краткосрочно повысить контроль, риск обострения труда.']]},
    {key:'accountability',title:'Публичный отчёт по действиям служб',speaker:'Уполномоченный по гражданским правам',body:'Нужно определить, кто и как отчитывается по происшествиям, задержаниям, медицинской помощи и приказам.',defaultChoice:'independent',choices:[['independent','Независимая проверка и публикация итогов','Доверие растёт, возможны дисциплинарные решения.'],['internal','Внутренняя проверка с внешним наблюдателем','Компромисс между скоростью и независимостью.'],['closed','Закрыть материалы до завершения внутренней работы','Сохраняет оперативность, но усиливает подозрения.']]},
    {key:'election',title:'Календарь парламентских консультаций',speaker:'Председатель избирательной комиссии',body:'Партии требуют определённости относительно будущего политического мандата и правил публичной кампании.',defaultChoice:'consult',choices:[['consult','Назначить межпартийные консультации','Снизить неопределённость, начать подготовку правил и календаря.'],['early','Подготовить досрочные выборы','Обновить мандат, но усилить краткосрочную поляризацию.'],['term','Сохранить текущий срок полномочий','Стабильность правил, оппозиция может усилить давление.']]}
  ];
  function applyPoliticalChoice(sim,d,choice,automatic=false){
    const s=sim.state,p=s.policies||(s.policies={});let desc='Решение внесено в политический календарь.';
    const add=(key,amount)=>{if(typeof p[key]==='number')p[key]=clamp(p[key]+amount,0,100);};
    switch(d.payload?.eventKey){
      case'confidence':if(choice==='coalition'){s.stability=clamp((s.stability||50)+5,0,100);s.trust=clamp((s.trust||50)+2,0,100);s.treasury=Math.max(0,(s.treasury||0)-.012);desc='Коалиция создана. Кабинет получил поддержку, но согласованные уступки потребуют бюджета.';}else if(choice==='reshuffle'){s.stability=clamp((s.stability||50)+2,0,100);s.approval=clamp((s.approval||50)+1,0,100);s.trust=clamp((s.trust||50)-1,0,100);desc='Состав кабинета перестроен; новый состав должен подтвердить способность проводить решения.';}else{s.investigationOpen=true;s.trust=clamp((s.trust||50)+3,0,100);s.approval=clamp((s.approval||50)-1,0,100);desc='Межфракционное расследование открыто; повестка комиссии опубликована.';}break;
      case'budget':if(choice==='social'){add('welfare',5);s.treasury=Math.max(0,(s.treasury||0)-.025);s.approval=clamp((s.approval||50)+3,0,100);s.publicAnger=clamp((s.publicAnger||0)-3,0,100);desc='Социальный пакет утверждён; казна уменьшилась, поддержка домохозяйств усилилась.';}else if(choice==='infrastructure'){add('infrastructure',6);s.treasury=Math.max(0,(s.treasury||0)-.022);s.gdpGrowth=(s.gdpGrowth||0)+.15;desc='Инфраструктурные инвестиции утверждены; эффект на транспорт и занятость проявится постепенно.';}else{s.treasury=(s.treasury||0)+.012;add('welfare',-2);s.approval=clamp((s.approval||50)-3,0,100);s.publicAnger=clamp((s.publicAnger||0)+3,0,100);desc='Принят режим бюджетной экономии; резерв увеличен, социальная поддержка снизилась.';}break;
      case'media':if(choice==='independent'){add('mediaFreedom',8);s.trust=clamp((s.trust||50)+4,0,100);desc='Независимый контроль за СМИ закреплён; доступ к публичной информации расширен.';}else if(choice==='briefing'){add('mediaFreedom',2);s.trust=clamp((s.trust||50)+1,0,100);desc='Ежедневный брифинг создан; пресс-служба обязана отвечать на вопросы.';}else{add('mediaFreedom',-9);s.trust=clamp((s.trust||50)-5,0,100);s.crowdAnger=clamp((s.crowdAnger||0)+25,0,1000);desc='Ограничения публикаций расширены; в ответ усилилась критика и недоверие.';}break;
      case'regions':if(choice==='decentralize'){add('infrastructure',2);s.stability=clamp((s.stability||50)+2,0,100);s.trust=clamp((s.trust||50)+2,0,100);desc='Часть полномочий передана местному уровню; центр сохраняет контроль за общими стандартами.';}else if(choice==='fund'){s.treasury=Math.max(0,(s.treasury||0)-.018);s.serviceQuality=clamp((s.serviceQuality||50)+4,0,100);desc='Региональное финансирование выделено на транспорт, обслуживание и гражданские службы.';}else{s.stability=clamp((s.stability||50)+1,0,100);s.publicAnger=clamp((s.publicAnger||0)+5,0,100);desc='Централизация сохранена; региональные претензии остаются в повестке.';}break;
      case'security':if(choice==='review'){s.trust=clamp((s.trust||50)+2,0,100);s.emergencyDays=Math.min(s.emergencyDays||0,1);desc='Чрезвычайные полномочия сохранены под надзором и с конечным сроком.';}else if(choice==='end'){s.emergencyDays=0;s.policeMorale=clamp((s.policeMorale||50)+2,0,100);s.trust=clamp((s.trust||50)+3,0,100);desc='Чрезвычайный режим прекращён; ведомства переводятся на обычные процедуры.';}else{s.emergencyDays=Math.max(s.emergencyDays||0,2);s.trust=clamp((s.trust||50)-5,0,100);s.crowdAnger=clamp((s.crowdAnger||0)+20,0,1000);desc='Чрезвычайные полномочия расширены; оперативный контроль усилен, политические издержки выросли.';}break;
      case'transport':if(choice==='tripartite'){s.trust=clamp((s.trust||50)+2,0,100);if(s.unions)s.unions.phase='трёхсторонняя комиссия по транспорту';s.roadBlockage=clamp((s.roadBlockage||0)-.08,0,.98);desc='Трёхсторонняя комиссия создана; профсоюзам направлены даты и правила обсуждения.';}else if(choice==='subsidy'){s.treasury=Math.max(0,(s.treasury||0)-.015);s.roadBlockage=clamp((s.roadBlockage||0)-.05,0,.98);desc='Перевозчики получили временную поддержку; графики маршрутов восстанавливаются.';}else{s.activeStrikes=(s.activeStrikes||0)+1;s.crowdAnger=clamp((s.crowdAnger||0)+16,0,1000);desc='Обязательность расписания усилена; профсоюзы готовят ответные меры.';}break;
      case'accountability':if(choice==='independent'){s.trust=clamp((s.trust||50)+4,0,100);s.investigationOpen=true;desc='Назначен независимый контроль и срок публикации отчёта.';}else if(choice==='internal'){s.trust=clamp((s.trust||50)+1,0,100);s.investigationOpen=true;desc='Внутренняя проверка началась под наблюдением внешнего уполномоченного.';}else{s.trust=clamp((s.trust||50)-4,0,100);s.crowdAnger=clamp((s.crowdAnger||0)+18,0,1000);desc='Материалы закрыты на время проверки; общественные группы требуют независимого доступа.';}break;
      case'election':if(choice==='consult'){s.stability=clamp((s.stability||50)+2,0,100);s.trust=clamp((s.trust||50)+1.5,0,100);desc='Межпартийные консультации назначены; обсуждаются правила и сроки.';}else if(choice==='early'){s.approval=clamp((s.approval||50)-2,0,100);s.tension=clamp((s.tension||0)+3,0,100);desc='Подготовка досрочных выборов началась; политическая конкуренция обострилась.';}else{s.stability=clamp((s.stability||50)+1,0,100);s.publicAnger=clamp((s.publicAnger||0)+3,0,100);desc='Текущий срок полномочий сохранён; оппозиция продолжит добиваться календаря.';}break;
    }
    const e={id:++s.v9PoliticalSequence,at:nowOf(s),day:s.day||1,event:d.payload?.eventKey||d.title,title:d.title,choice,choiceTitle:d.choices.find(c=>c[0]===choice)?.[1]||choice,description:desc,automatic};
    s.politicalDecisionLog.unshift(e);s.politicalDecisionLog=s.politicalDecisionLog.slice(0,40);s.lastPoliticalDecision=e.title;logEvent(sim,`Политическое решение: ${e.choiceTitle}`,desc,automatic?'warning':'success');sim.addNews?.('politics',automatic?'warning':'info',d.title,desc);sim._refreshDerived?.();sim._notify?.('update');
  }
  function applyCrisisAction(sim,d,choice,automatic=false){
    if(choice!=='execute') {logEvent(sim,'Решение отменено',`Действие «${d.payload?.action||'мера'}» не применено.`,'warning');return;}
    const action=d.payload?.action,ui=window.dashboardUI,s=sim.state;
    if(action==='apply-policies'){
      const draft=ui?.draft;if(!draft){logEvent(sim,'Пакет политики не применён','Панель параметров недоступна; текущие настройки сохранены.','warning');return;}
      sim.applyPolicies({...draft});ui.draft={...sim.state.policies};ui._syncPolicyInputs?.();ui._updateDraftStatus?.();ui.renderAll?.(true);logEvent(sim,'Пакет государственной политики утверждён','Все выбранные параметры применены и будут влиять на экономику, доверие и общественные группы.','success');return;
    }
    if(action==='promise'){const p=sim.makePromise?.();if(p)logEvent(sim,'Публичное обязательство зарегистрировано',`${p.title}. Срок исполнения — через 48 модельных часов.`,'info');return;}
    if(action==='referendum'){const ok=sim.startReferendum?.();logEvent(sim,ok?'Референдум назначен':'Референдум не запущен',ok?'Началось трёхдневное голосование; результат будет зафиксирован после завершения.':'Голосование уже идёт либо запуск недоступен.',ok?'info':'warning');return;}
    if(action==='revoke'){sim.revokeMeasure?.();logEvent(sim,'Мера отозвана','Общественная реакция и последующая мобилизация пересчитаны.','warning');return;}
    const commandMap={'police-reinforce':'reinforce','police-rotate':'rotate','police-corridor':'corridor','police-talk':'talk'};
    if(commandMap[action]){const ok=sim.commandPolice?.(commandMap[action]);logEvent(sim,ok?'Приказ полиции принят':'Приказ полиции не выполнен',s.policeOrder||`Команда: ${commandMap[action]}.`,ok?'info':'warning');return;}
    if(action?.startsWith('force-')){const method=action.slice(6),ok=sim.commandPolice?.(method);logEvent(sim,ok?'Приказ по тактическому средству принят':'Тактический приказ отклонён',s.policeOrder||`Средство: ${method}.`,['live','rubber'].includes(method)?'warning':'info');return;}
    logEvent(sim,'Неизвестное решение',`Команда «${action}» не распознана; состояние не изменено.`,'warning');
  }
  function applySystemAction(sim,d,choice,automatic=false){
    const s=sim.state,action=d.payload?.action;
    if(choice!=='execute') { logEvent(sim,'Действие отменено',`Команду «${action}» не применили.`, 'warning');return; }
    const result=oldAction?oldAction.call(sim,action):false;
    if(!result){logEvent(sim,'Действие не выполнено',`Команда «${action}» не была принята моделью.`, 'warning');return;}
    if(action==='military'){
      const now=nowOf(s);s.militaryDeployed=true;s.v9ExplicitMilitaryWithdrawal=false;s.militaryMandateEndsAt=now+1440;s.militaryRenewalPending=false;s.militaryTaskState='защита критической инфраструктуры, больниц и безопасных коридоров';s.militaryStreetRole=true;s.emergencyDays=Math.max(s.emergencyDays||0,1);
      const active=(s.incidents||[]).filter(i=>i.status!=='resolved'&&['building_assault','blockade','riot','clash','fire','arson'].includes(i.type)).sort((a,b)=>(b.severity||0)-(a.severity||0));
      // The core action already queues three military units. Assign them to real incidents instead of spawning duplicates.
      const queued=(s.vehicleOrders||[]).filter(o=>o.service==='military'&&!o.v9Assigned);
      queued.forEach((order,i)=>{const inc=active[i%Math.max(1,active.length)];order.v9Military=true;order.v9Assigned=true;order.purpose='долговременная поддержка критической инфраструктуры';if(inc){order.incidentId=inc.id;order.x=inc.x;order.y=inc.y;}});
      logEvent(sim,'Военная миссия развёрнута',`Назначен срок мандата до ${s.militaryMandateEndsAt}. Подразделения закрепляются за объектами и не исчезают после короткого выезда.`,'warning');
    }else logEvent(sim,`Решение исполнено: ${action}`,s.lastAction||'Команда передана ведомству.',action==='emergency'?'warning':'info');
    sim._notify?.('update');
  }
  function applyRallyChoice(sim,d,choice,automatic=false){
    const s=sim.state,now=nowOf(s),route=d.payload?.route||'центральный проспект',delay=d.payload?.delay||180;
    const permit=choice==='permit'?'разрешён':choice==='reroute'?'разрешён с изменением маршрута':'на консультации';
    s.rally={...(s.rally||{}),status:choice==='consult'?'consultation':'announced',noticeAt:now,plannedAt:choice==='consult'?null:now+delay,route:choice==='reroute'?'площадь и парламентский квартал':route,permit,attendance:0,consultDelay:Math.max(60,delay)};
    const text=`Статус: ${permit}. Маршрут: ${s.rally.route}. ${choice==='consult'?'Срок консультации — 60 игровых минут; затем будет опубликован календарь марша.':`Начало запланировано через ${delay} игровых минут.`}`;
    logEvent(sim,'Решение по заявке на марш зафиксировано',text,choice==='permit'?'success':'warning');sim.addNews?.('politics',automatic?'warning':'info','Решение по заявке на марш',text);sim._notify?.('update');
  }
  function applyBanChoice(sim,d,choice,automatic=false){
    const s=sim.state,now=nowOf(s);
    s.rally=s.rally||{};s.rally.permit=choice==='ban'?'запрещён':choice==='reroute'?'альтернативный маршрут предложен':'на срочном пересмотре';s.rally.status=choice==='review'?'consultation':choice==='ban'?'disputed':'announced';s.rally.noticeAt=now;s.rally.consultDelay=60;
    if(choice==='ban'){s.crowdAnger=clamp((s.crowdAnger||0)+16,0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+4,0,100);}else if(choice==='reroute'){s.rally.route='площадь и парламентский квартал';s.rally.plannedAt=now+180;}else{s.rally.noticeAt=now;s.rally.plannedAt=null;}
    const text=`Режим мероприятия: ${s.rally.permit}. Решение зарегистрировано и будет отражено в политическом журнале.`;logEvent(sim,'Ограничение маршрута рассмотрено',text,choice==='ban'?'warning':'info');sim.addNews?.('politics',automatic?'warning':'info','Решение по маршруту',text);sim._notify?.('update');
  }
  function applyStrikeChoice(sim,d,choice,automatic=false){
    const s=sim.state;
    if(choice==='talk'){
      const demands=(s.unions?.demands||[]).join(', ')||'зарплаты, гарантии занятости и график индексации';
      createTrack(sim,{groupId:'workers',party:'Профсоюзная коалиция',topic:'Трудовые требования и предотвращение забастовки',demand:demands,format:'mediated'});
      if(s.unions){s.unions.phase='переговоры до забастовки';s.unions.negotiationOpened=true;}
      logEvent(sim,'Забастовка отложена ради переговоров','Профсоюзная коалиция получила отдельную линию переговоров с посредником.','info');return;
    }
    s.unions=s.unions||{demands:['индексация зарплат','гарантии пенсий','сохранение рабочих мест'],strength:0,blockade:0};s.unions.active=true;s.unions.strength=Math.max(10,s.unions.strength||0);s.unions.blockade=choice==='strike'?.1:.04;s.strikeIntensity=clamp((s.strikeIntensity||0)+(choice==='strike'?10:4),0,100);
    if(choice==='offer'){s.crowdAnger=clamp((s.crowdAnger||0)-10,0,1000);createTrack(sim,{groupId:'workers',party:'Профсоюзная коалиция',topic:'Временный трудовой пакет',demand:'Согласовать временный пакет мер, обмен на паузу в забастовке и проверяемые сроки.',format:'mediated'});}
    const msg=choice==='strike'?'Забастовка активирована; сила и охват растут постепенно.':'Профсоюзы получили временное предложение, но потребовали письменного графика исполнения.';logEvent(sim,'Решение по трудовому конфликту',msg,choice==='strike'?'warning':'info');sim.addNews?.('politics',automatic?'warning':'info','Решение по трудовым требованиям',msg);sim._notify?.('update');
  }
  function applyDualPowerChoice(sim,d,choice,automatic=false){
    const s=sim.state,now=nowOf(s),dp=s.dualPower||(s.dualPower={active:false,committeeCount:0,control:0,administrationParalyzed:0});
    if(!dp.active){dp.active=true;dp.committeeCount=Math.max(1,dp.committeeCount||0);dp.control=Math.max(10,dp.control||0);dp.ultimatumDeadline=now+360;}
    if(choice==='talk'){
      dp.choice='talk';dp.administrationParalyzed=clamp((dp.administrationParalyzed||25)-8,0,100);s.crowdAnger=clamp((s.crowdAnger||0)-18,0,1000);
      createTrack(sim,{groupId:'temporary-council',party:'Временный совет',topic:'Полномочия и срок переходного управления',demand:'Согласовать юридические полномочия, гарантии безопасности, доступ городских служб и календарь возвращения к обычному управлению.',format:'mediated'});
      logEvent(sim,'Открыта линия с временным советом','Трек включает пять раундов, посредника, сроки ответа и проект соглашения.','info');
    }else if(choice==='legal'){dp.choice='legalize';dp.control=clamp((dp.control||0)+18,0,100);s.stateMode='Переходное соглашение';s.stateModeCode='transition';dp.administrationParalyzed=clamp((dp.administrationParalyzed||0)-4,0,100);logEvent(sim,'Временный совет получил ограниченный правовой статус','Создан переходный режим с совместным надзором и распределением компетенций.','warning');}
    else{dp.choice='restore';s.crowdAnger=clamp((s.crowdAnger||0)+30,0,1000);s.tension=clamp((s.tension||0)+10,0,100);dp.administrationParalyzed=clamp((dp.administrationParalyzed||25)+8,0,100);logEvent(sim,'Запущена правовая процедура восстановления контроля','Администрация продолжает работу; последствия для доверия, напряжённости и услуг отражены в модели.','warning');}
    sim._refreshDerived?.();sim._notify?.('update');
  }
  function applyPoliceLabourChoice(sim,d,choice,automatic=false){
    const s=sim.state,pp=s.policeProtest||(s.policeProtest={active:false,phase:'служба сохраняет строй',morale:s.policeMorale||50,publicCriticism:0});
    if(choice==='talk'){createTrack(sim,{party:'Полицейская служба',topic:'Условия службы и непрерывность гражданской безопасности',demand:'Согласовать отдых смен, правовую защиту сотрудников, протоколы взаимодействия и минимальный состав дежурных групп.',format:'mediated'});pp.phase='переговоры с правительством';}
    else if(choice==='support'){pp.active=false;pp.phase='гарантии смен и правовой защиты';s.policeMorale=clamp((s.policeMorale||50)+7,0,100);s.policeFatigue=clamp((s.policeFatigue||0)-12,0,100);}
    else{pp.active=true;pp.phase='частичный отказ от сверхурочных';pp.publicCriticism=clamp((pp.publicCriticism||0)+10,0,100);s.policeMorale=clamp((s.policeMorale||50)-6,0,100);s.policePresence=Math.max(5,(s.policePresence||35)-3);}
    logEvent(sim,'Решение по трудовому конфликту полиции',pp.phase,choice==='deny'?'warning':'info');sim._notify?.('update');
  }
  function resolveDecision(sim,id,choice,automatic=false){
    const s=sim.state;const d=s.v9Decisions.find(x=>x.id===id&&['queued','pending'].includes(x.status));if(!d)return;
    d.status=automatic?'timed-out':'resolved';d.choice=choice;d.resolvedAt=nowOf(s);d.automatic=automatic;
    if(s.v9CurrentDecisionId===d.id)s.v9CurrentDecisionId=null;
    if(d.type==='mandate'){const t=s.negotiationTracks.find(x=>x.id===d.trackId);if(t&&!t.closed)applyMandate(sim,t,choice,automatic);}
    else if(d.type==='agenda'){const t=s.negotiationTracks.find(x=>x.id===d.trackId);if(t&&!t.closed)decideQuestion(sim,t,choice,automatic);}
    else if(d.type==='politics')applyPoliticalChoice(sim,d,choice,automatic);
    else if(d.type==='military-renewal')applyMilitaryChoice(sim,choice,automatic);
    else if(d.type==='system-action')applySystemAction(sim,d,choice,automatic);
    else if(d.type==='crisis-action')applyCrisisAction(sim,d,choice,automatic);
    else if(d.type==='rally')applyRallyChoice(sim,d,choice,automatic);
    else if(d.type==='ban')applyBanChoice(sim,d,choice,automatic);
    else if(d.type==='strike')applyStrikeChoice(sim,d,choice,automatic);
    else if(d.type==='dual-power')applyDualPowerChoice(sim,d,choice,automatic);
    else if(d.type==='police-labour')applyPoliceLabourChoice(sim,d,choice,automatic);
    if(automatic)banner('Срок ответа истёк',`${d.title}. Применён вариант по умолчанию: ${d.choices.find(c=>c[0]===choice)?.[1]||choice}.`,'warning');
    const overlay=document.getElementById('v9-modal-overlay');if(overlay)overlay.remove();renderDecision(sim);renderDiplomacy(s,true);sim._notify?.('v9-decision',d);
  }
  function renderDecision(sim){
    if(!sim?.state||!document.body)return;const s=sim.state;ensureState(s);
    let d=s.v9Decisions.find(x=>x.status==='pending'&&x.id===s.v9CurrentDecisionId);
    if(!d){d=s.v9Decisions.find(x=>x.status==='queued');if(!d){const old=document.getElementById('v9-modal-overlay');if(old)old.remove();s.v9CurrentDecisionId=null;return;}d.status='pending';d.shownAt=nowOf(s);d.deadlineAt=d.shownAt+d.timeout;s.v9CurrentDecisionId=d.id;}
    let overlay=document.getElementById('v9-modal-overlay');if(overlay&&overlay.dataset.decisionId===d.id){updateDecisionClock(sim,d);return;}if(overlay)overlay.remove();
    overlay=document.createElement('div');overlay.id='v9-modal-overlay';overlay.className='v9-modal-overlay';overlay.dataset.decisionId=d.id;overlay.setAttribute('role','presentation');
    const dialog=document.createElement('section');dialog.className='v9-modal-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','v9-modal-title');
    const kicker=document.createElement('div');kicker.className='v9-modal-kicker';kicker.textContent=d.kicker;
    const title=document.createElement('h2');title.id='v9-modal-title';title.textContent=d.title;
    const speaker=document.createElement('p');speaker.className='v9-modal-speaker';speaker.textContent=d.speaker;
    const body=document.createElement('div');body.className='v9-modal-body';body.textContent=d.body;
    const timer=document.createElement('div');timer.className='v9-modal-timer';timer.id='v9-modal-timer';
    const timerLabel=document.createElement('span');timerLabel.textContent='СРОК ОТВЕТА';const timerValue=document.createElement('strong');timerValue.id='v9-modal-timeleft';timer.append(timerLabel,timerValue);
    const progress=document.createElement('div');progress.className='v9-modal-progress';const fill=document.createElement('i');fill.id='v9-modal-progress-fill';progress.append(fill);
    const choices=document.createElement('div');choices.className='v9-modal-choices';
    for(const [value,label,desc] of d.choices){const b=document.createElement('button');b.type='button';b.className='v9-modal-choice';const strong=document.createElement('strong');strong.textContent=label;const small=document.createElement('small');small.textContent=desc;b.append(strong,small);b.addEventListener('click',()=>resolveDecision(sim,d.id,value,false));choices.appendChild(b);}
    const foot=document.createElement('p');foot.className='v9-modal-foot';foot.textContent='Окно блокирует управление городом до выбора. Игровое время идёт; после дедлайна система применит видимый вариант по умолчанию и запишет это в протокол.';
    dialog.append(kicker,title,speaker,body,timer,progress,choices,foot);overlay.append(dialog);document.body.append(overlay);
    overlay.addEventListener('click',ev=>{if(ev.target===overlay){ev.preventDefault();ev.stopPropagation();}});
    overlay.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();return;}if(ev.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];if(!nodes.length){ev.preventDefault();return;}const first=nodes[0],last=nodes[nodes.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}}});
    updateDecisionClock(sim,d);choices.querySelector('button')?.focus();
  }
  function updateDecisionClock(sim,d){const now=nowOf(sim.state),left=Math.max(0,(d.deadlineAt||now)-now),span=document.getElementById('v9-modal-timeleft'),fill=document.getElementById('v9-modal-progress-fill');if(span)span.textContent=`${left} игровых минут · ${Math.ceil(left/60)} ч`;if(fill)fill.style.width=`${clamp((left/Math.max(1,d.timeout))*100,0,100)}%`;}
  function advanceRally(sim,now){const s=sim.state,r=s.rally;if(!r||r.status!=='consultation')return;const startAt=Number.isFinite(Number(r.noticeAt))?Number(r.noticeAt):now;const due=startAt+Math.max(60,Number(r.consultDelay)||60);if(now<due)return;r.status='announced';r.permit=r.permit==='на срочном пересмотре'?'пересмотр завершён; маршрут опубликован':'консультация завершена';r.plannedAt=now+Math.max(60,Number(r.followupDelay)||180);r.publishedAt=now;const msg=`Консультация завершена. Маршрут: ${r.route||'центральный проспект'}. Начало запланировано через ${r.plannedAt-now} игровых минут; экстренные коридоры остаются обязательными.`;logEvent(sim,'Консультация по маршруту завершена',msg,'info');sim.addNews?.('politics','info','Маршрут публичного мероприятия утверждён',msg);sim._notify?.('update');}
  function advanceTracks(sim,now){
    const s=sim.state;
    for(const t of s.negotiationTracks){if(t.closed)continue;t.elapsed=t.startedAt==null?0:Math.max(0,now-t.startedAt);t.progress=t.duration?clamp(t.elapsed/t.duration*100,0,100):0;t.updatedAt=now;
      if(t.stage==='party_response'&&t.pendingActorResponse&&now>=t.pendingActorResponse.at){processActorResponse(sim,t,now);continue;}
      if(t.stage!=='agenda'||t.pendingDecisionId||t.pendingActorResponse)continue;
      if(t.endAt&&now>=t.endAt&&t.agendaIndex<t.agenda.length){finishTrack(sim,t,'timeout');continue;}
      if(t.agendaIndex<t.agenda.length&&now>=(t.nextAt||now)){queueAgendaDecision(sim,t);continue;}
      if(t.agendaIndex>=t.agenda.length&&now>=(t.endAt||now)){finishTrack(sim,t);continue;}
    }
    if(now>=(s.v9NextPoliticalAt||now+480)){queuePoliticalDecision(sim);}
    advanceDualPower(sim,now);advanceMilitary(sim,now);
  }
  function advanceDualPower(sim,now){
    const s=sim.state,d=s.dualPower;if(!d?.active)return;
    const previous=Number(s.dualPowerEffectsAt)||now;const elapsed=Math.max(0,Math.min(now-previous,60));if(elapsed<60)return;s.dualPowerEffectsAt=now;
    const control=clamp(d.control||0,0,100),paralysis=clamp(d.administrationParalyzed||0,0,100);
    s.serviceQuality=clamp((s.serviceQuality||50)-paralysis*.0018,0,100);
    s.stability=clamp((s.stability||50)-paralysis*.00065,0,100);
    s.treasury=Math.max(0,(s.treasury||0)-control*.00002);
    if(d.choice==='legalize'){d.administrationParalyzed=clamp(paralysis-.045,0,100);d.control=clamp(control-.012,0,100);}
    else if(d.choice==='restore'){d.administrationParalyzed=clamp(paralysis-.03,0,100);d.control=clamp(control-.06,0,100);s.crowdAnger=clamp((s.crowdAnger||0)+.018,0,1000);}
  }
  function advanceMilitary(sim,now){
    const s=sim.state;if(!s.militaryDeployed||!s.militaryMandateEndsAt||now<s.militaryMandateEndsAt||s.militaryRenewalPending)return;
    s.militaryRenewalPending=true;
    queueDecision(sim,{type:'military-renewal',kicker:'ВОЕННОЕ СОДЕЙСТВИЕ · СРОК МАНДАТА',title:'Продлить, изменить или завершить военную миссию?',speaker:'Оперативный штаб и гражданский секретариат',body:`На месте: ${s.militaryUnitsOnScene||0} единиц. Текущая задача: ${s.militaryTaskState||'охрана коридоров и критической инфраструктуры'}. Самовольного снятия миссии не будет; требуется решение кабинета.`,timeout:180,defaultChoice:'extend',choices:[['extend','Продлить мандат на 24 часа','Оставить подразделения на местах для защиты инфраструктуры и коридоров.'],['relief','Перевести в режим гражданской поддержки','Сохранить инженерную и логистическую помощь, не усиливая уличное присутствие.'],['withdraw','Поэтапно вывести подразделения','Организовать возвращение колонны после передачи задач гражданским службам.']]});
  }
  function applyMilitaryChoice(sim,choice,automatic=false){
    const s=sim.state,now=nowOf(s);s.militaryRenewalPending=false;
    if(choice==='withdraw'){s.v9ExplicitMilitaryWithdrawal=true;s.militaryDeployed=false;s.militaryMandateEndsAt=null;s.militaryTaskState='поэтапный вывод; передача задач гражданским службам';}
    else if(choice==='relief'){s.militaryTaskState='инженерная и логистическая поддержка гражданских служб';s.militaryStreetRole=false;s.militaryMandateEndsAt=now+1440;}
    else{s.militaryTaskState='защита критической инфраструктуры, больниц и безопасных коридоров';s.militaryStreetRole=true;s.militaryMandateEndsAt=now+1440;}
    logEvent(sim,choice==='withdraw'?'Начат плановый вывод военных':'Военная миссия обновлена',s.militaryTaskState,choice==='withdraw'?'warning':'info');sim.addNews?.('politics','info','Решение по военной миссии',s.militaryTaskState);renderDiplomacy(s);
  }
  function hostileLoad(s){
    if(Number.isFinite(s?._v9HostileLoadOverride))return s._v9HostileLoadOverride;
    const crowd=Math.max(0,Number(s.crowdTarget)||0),rawAnger=Number.isFinite(s.crowdAnger)?s.crowdAnger:clamp(s.publicAnger||0,0,100)*10,anger=clamp(rawAnger/1000,0,1),morale=clamp((s.policeMorale??65)/100,0,1),strikes=clamp((s.activeStrikes||0)/5,0,1),radical=clamp((s.v6Radicalization??s.radicalization??s.radicalizedShare??0)/100,0,1);
    const explicitViolence=clamp((s.incidents||[]).filter(i=>i.status!=='resolved'&&['riot','clash','looting','building_assault','radical_attack'].includes(i.type)).length/Math.max(1,8),0,.2);
    const hostileShare=clamp(.12+anger*.18+(1-morale)*.06+strikes*.05+radical*.18+explicitViolence,.12,.52);
    return crowd*hostileShare;
  }
  function openCreateForm(sim,prefGroupId=null,preset={}){
    if(document.getElementById('v9-modal-overlay'))return;
    let overlay=document.getElementById('v9-create-overlay');if(overlay)overlay.remove();
    overlay=document.createElement('div');overlay.id='v9-create-overlay';overlay.className='v9-modal-overlay';
    const dialog=document.createElement('section');dialog.className='v9-modal-dialog v9-create-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    const title=document.createElement('h2');title.textContent='Открыть линию переговоров';
    const intro=document.createElement('p');intro.className='v9-modal-speaker';intro.textContent='Каждая линия независима: своя повестка, длительность, срок ответа, журнал и итог.';
    const form=document.createElement('form');form.className='v9-create-form';
    const parties=[['public','Представители площади'],['unions','Профсоюзная коалиция'],['police','Полицейская служба'],['council','Временный совет'],['opposition','Парламентская оппозиция'],['municipality','Муниципалитет'],['business','Деловые объединения'],['regions','Региональные делегации']];
    const groupOpts=typeof sim.getProtestGroups==='function'?sim.getProtestGroups().filter(g=>g.id!=='supporters').map(g=>[g.id,g.name]):[];
    const makeField=(labelText,control)=>{const lab=document.createElement('label');lab.className='v9-form-field';const span=document.createElement('span');span.textContent=labelText;lab.append(span,control);return lab;};
    const party=document.createElement('select');party.name='party';parties.forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;party.append(o);});
    if(prefGroupId){const g=groupOpts.find(x=>x[0]===prefGroupId);if(g){const o=document.createElement('option');o.value='group:'+g[0];o.textContent=g[1];party.append(o);party.value=o.value;}}
    const partyLabelMap={ 'Представители площади':'public','Профсоюзная коалиция':'unions','Полицейская служба':'police','Временный совет':'council','Парламентская оппозиция':'opposition','Муниципалитет':'municipality','Деловые объединения':'business','Региональные делегации':'regions' };if(preset.party&&partyLabelMap[preset.party])party.value=partyLabelMap[preset.party];
    const topic=document.createElement('input');topic.name='topic';topic.maxLength=180;topic.required=true;topic.value=preset.topic|| (prefGroupId?(groupOpts.find(g=>g[0]===prefGroupId)?.[1]||'Вопрос представителей площади'):'Общественно-политическое урегулирование');
    const demand=document.createElement('textarea');demand.name='demand';demand.rows=2;demand.maxLength=350;demand.value=preset.demand||'Согласовать конкретные меры, сроки, гарантии и порядок исполнения.';
    const format=document.createElement('select');format.name='format';[['direct','Прямые переговоры (12 игровых часов)'],['mediated','С независимым посредником (18 игровых часов)']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;format.append(o);});
    if(preset.format)format.value=preset.format;form.append(makeField('Участники',party),makeField('Тема переговоров',topic),makeField('Предмет / требование',demand),makeField('Формат',format));
    const actions=document.createElement('div');actions.className='v9-create-actions';const start=document.createElement('button');start.type='submit';start.className='v9-primary-button';start.textContent='Открыть линию и определить мандат';const cancel=document.createElement('button');cancel.type='button';cancel.className='v9-secondary-button';cancel.textContent='Отмена';cancel.addEventListener('click',()=>overlay.remove());actions.append(start,cancel);form.append(actions);
    form.addEventListener('submit',e=>{e.preventDefault();const selected=party.value;let groupId=null,partyName=parties.find(x=>x[0]===selected)?.[1]||selected;if(selected.startsWith('group:')){groupId=selected.slice(6);partyName=groupOpts.find(x=>x[0]===groupId)?.[1]||partyName;}
      createTrack(sim,{groupId,party:partyName,topic:topic.value,demand:demand.value,format:format.value});overlay.remove();renderDiplomacy(sim.state);});
    dialog.append(title,intro,form);overlay.append(dialog);document.body.append(overlay);topic.focus();
  }
  function injectDiplomacyPanel(){
    const frame=document.querySelector('.scene-frame');if(!frame)return;
    document.getElementById('v8-turn-panel')?.remove();
    let panel=document.getElementById('v9-diplomacy-panel');if(!panel){panel=document.createElement('section');panel.id='v9-diplomacy-panel';panel.className='v9-diplomacy-panel';panel.innerHTML='<div class="v9-diplomacy-head"><div><span class="v9-kicker">03А / ПЕРЕГОВОРЫ И УПРАВЛЕНИЕ</span><h2>Дипломатия и политический календарь</h2><p>Параллельные линии · игровые сроки · протоколы · исполнение</p></div><button type="button" id="v9-new-track" class="v9-primary-button">＋ Новая линия переговоров</button></div><section id="v9-live-turn" class="v9-live-turn" aria-live="polite"></section><div class="v9-diplomacy-stats" id="v9-diplomacy-stats"></div><div class="v9-track-grid" id="v9-track-grid"></div><div class="v9-bottom-grid"><section><h3>Последние ходы и ответы сторон</h3><div id="v9-event-log" class="v9-event-log"></div></section><section><h3>Решения правительства</h3><div id="v9-political-log" class="v9-political-log"></div><p id="v9-promise-summary" class="v9-promise-summary"></p></section></div>';
      frame.parentNode.insertBefore(panel,frame);}
    const newBtn=document.getElementById('v9-new-track');if(newBtn&&!newBtn.dataset.bound){newBtn.dataset.bound='1';newBtn.addEventListener('click',()=>{if(window.gameSimulation)openCreateForm(window.gameSimulation);});}
    panel.addEventListener('click',e=>{const b=e.target.closest('[data-v9-show-track]');if(!b)return;const s=window.gameSimulation?.state,t=s?.negotiationTracks.find(x=>x.id===b.dataset.v9ShowTrack);if(t)showTrackDetails(t);});
  }
  function showTrackDetails(t){
    if(!window.gameSimulation||document.getElementById('v9-modal-overlay'))return;const sim=window.gameSimulation;
    const rows=(t.transcript||[]).slice(-10).map(m=>[m.speaker,m.text]);let overlay=document.createElement('div');overlay.className='v9-modal-overlay';overlay.id='v9-track-detail-overlay';const d=document.createElement('section');d.className='v9-modal-dialog';const h=document.createElement('h2');h.textContent=t.topic;const meta=document.createElement('p');meta.className='v9-modal-speaker';meta.textContent=`${t.party} · ${t.format==='mediated'?'с посредником':'прямой формат'} · ${t.status}`;const body=document.createElement('div');body.className='v9-modal-body';body.textContent=`Ход ${Math.min(t.agendaIndex+1,5)}/5 · срок ${t.duration||'мандат не утверждён'} игровых минут · результат: ${t.result?.outcome||'процесс продолжается'} · обязательств: ${t.obligations?.length||0}.`;const log=document.createElement('div');log.className='v9-detail-transcript';rows.forEach(([speaker,text])=>{const item=document.createElement('div');const strong=document.createElement('strong');strong.textContent=speaker;const p=document.createElement('p');p.textContent=text;item.append(strong,p);log.append(item);});const btn=document.createElement('button');btn.type='button';btn.className='v9-secondary-button';btn.textContent='Закрыть протокол';btn.addEventListener('click',()=>overlay.remove());d.append(h,meta,body,log,btn);overlay.append(d);document.body.append(overlay);
  }
  function renderDiplomacy(s,force=false){
    const panel=document.getElementById('v9-diplomacy-panel');if(!panel)return;ensureState(s);const now=nowOf(s);if(!force&&Number.isFinite(s.v9LastRenderAt)&&now-s.v9LastRenderAt<3)return;s.v9LastRenderAt=now;const active=s.negotiationTracks.filter(t=>!t.closed);const recent=s.negotiationTracks.slice(0,12);
    const live=document.getElementById('v9-live-turn');if(live){const t=active.find(x=>x.stage==='party_response')||active.find(x=>x.pendingDecisionId)||active.find(x=>x.stage==='agenda')||active[0];live.replaceChildren();const kicker=document.createElement('span');kicker.className='v9-live-turn-kicker';kicker.textContent=t?'ТЕКУЩИЙ ХОД ПЕРЕГОВОРОВ':'ТЕКУЩИЙ ДИПЛОМАТИЧЕСКИЙ СТАТУС';const title=document.createElement('strong');const desc=document.createElement('p');const progress=document.createElement('div');progress.className='v9-track-progress';const fill=document.createElement('i');if(t){title.textContent=`${t.topic} · ${t.party}`;const dueDecision=s.v9Decisions.find(d=>d.id===t.pendingDecisionId&&['queued','pending'].includes(d.status));const remaining=t.pendingActorResponse?Math.max(0,t.pendingActorResponse.at-now):dueDecision?.deadlineAt?Math.max(0,dueDecision.deadlineAt-now):t.nextAt!=null?Math.max(0,t.nextAt-now):Math.max(0,(t.endAt||now)-now);const stateText=t.stage==='party_response'?`Ожидается ответ стороны через ${remaining} игровых минут.`:dueDecision?`Требуется решение по повестке; крайний срок ${dueDecision.deadlineAt??'назначается при открытии'} игровых минут.`:t.stage==='agenda'?`Следующий вопрос через ${remaining} игровых минут.`:`Статус: ${t.status}.`;const currentQ=t.agenda?.[t.agendaIndex]||'Мандат / повестка';desc.textContent=`Раунд ${Math.min(5,t.round+1)}/5 · ${currentQ} · ${stateText} Общий прогресс: ${Math.round(t.progress||0)}%.`;fill.style.width=`${t.closed?100:clamp(t.progress||0,0,100)}%`;progress.append(fill);}else{title.textContent='Переговорные линии ещё не открыты';desc.textContent='Откройте линию по любой теме: труд, бюджет, безопасность, транспорт, временный совет или отношения с полицией.';}live.append(kicker,title,desc,progress);} const stats=document.getElementById('v9-diplomacy-stats');if(stats){stats.replaceChildren();const arr=[['Активные линии',active.length],['Обязательства на исполнении',(s.promises||[]).filter(p=>p.status==='pending').length],['Ответы ждут решения',s.v9Decisions.filter(d=>d.status==='queued'||d.status==='pending').length],['Принятые обязательства',s.negotiationTracks.reduce((a,t)=>a+(t.obligations?.length||0),0)]];arr.forEach(([label,value])=>{const box=document.createElement('div');box.className='v9-stat';const small=document.createElement('span');small.textContent=label;const strong=document.createElement('strong');strong.textContent=String(value);box.append(small,strong);stats.append(box);});}
    const grid=document.getElementById('v9-track-grid');if(grid){grid.replaceChildren();if(!recent.length){const empty=document.createElement('p');empty.className='v9-empty';empty.textContent='Линий переговоров пока нет. Создай отдельную линию по любой теме и выбери прямой формат или посредника.';grid.append(empty);}recent.forEach(t=>{const card=document.createElement('article');card.className=`v9-track-card ${t.closed?'v9-track-closed':''}`;const head=document.createElement('div');head.className='v9-track-card-head';const h=document.createElement('h3');h.textContent=t.topic;const badge=document.createElement('span');badge.className='v9-track-badge';badge.textContent=t.closed?(t.result?.outcome||'Завершена'):(t.format==='mediated'?'Посредник':'Прямой диалог');head.append(h,badge);const party=document.createElement('p');party.className='v9-track-party';party.textContent=`Сторона: ${t.party} · ${t.status}`;const progress=document.createElement('div');progress.className='v9-track-progress';const fill=document.createElement('i');fill.style.width=`${t.closed?100:clamp(t.progress||0,0,100)}%`;progress.append(fill);const meta=document.createElement('div');meta.className='v9-track-meta';const count=document.createElement('span');count.textContent=t.duration?`Ход ${Math.min(t.agendaIndex+(t.pendingDecisionId?1:0),5)}/5 · ${Math.round(t.progress||0)}%`:'Мандат не утверждён';const duration=document.createElement('span');const decision=s.v9Decisions.find(d=>d.id===t.pendingDecisionId&&['queued','pending'].includes(d.status));const due=decision?.deadlineAt||t.pendingActorResponse?.at||t.nextAt;const left=due==null?null:Math.max(0,due-now);duration.textContent=t.closed?'завершена':left!=null?`следующий ответ через ${left} мин`:(t.duration?`${Math.max(0,t.endAt-now)} мин до завершения`:'ожидается решение');meta.append(count,duration);const last=(t.transcript||[]).slice(-1)[0];const quote=document.createElement('p');quote.className='v9-track-last';quote.textContent=last?`${last.speaker}: ${last.text}`:'Протокол пока пуст.';const foot=document.createElement('div');foot.className='v9-track-foot';const obligation=document.createElement('span');obligation.textContent=`Обязательств: ${t.obligations?.length||0}`;const detail=document.createElement('button');detail.type='button';detail.className='v9-small-button';detail.textContent='Открыть протокол';detail.dataset.v9ShowTrack=t.id;foot.append(obligation,detail);card.append(head,party,progress,meta,quote,foot);grid.append(card);});}
    const ev=document.getElementById('v9-event-log');if(ev){ev.replaceChildren();const entries=s.v9EventLog.slice(0,8);if(!entries.length){const p=document.createElement('p');p.className='v9-empty';p.textContent='Здесь будут показываться вопросы, позиции, ответы, сроки и итоги.';ev.append(p);}entries.forEach(e=>{const row=document.createElement('article');row.className=`v9-log-row v9-log-${e.kind}`;const time=document.createElement('small');time.textContent=`Д${String(e.day).padStart(2,'0')} ${String(e.hour).padStart(2,'0')}:00 · ${e.trackId||'ПОЛИТИКА'}`;const h=document.createElement('strong');h.textContent=e.title;const p=document.createElement('p');p.textContent=e.body;row.append(time,h,p);ev.append(row);});}
    const pol=document.getElementById('v9-political-log');if(pol){pol.replaceChildren();const entries=s.politicalDecisionLog.slice(0,5);if(!entries.length){const p=document.createElement('p');p.className='v9-empty';p.textContent='Первое решение по постоянному политическому календарю будет вынесено в ближайшие игровые часы.';pol.append(p);}entries.forEach(e=>{const row=document.createElement('article');row.className='v9-policy-row';const h=document.createElement('strong');h.textContent=e.title;const p=document.createElement('p');p.textContent=`${e.choiceTitle}: ${e.description}`;row.append(h,p);pol.append(row);});}
    const ps=document.getElementById('v9-promise-summary');if(ps){const pending=(s.promises||[]).filter(p=>p.status==='pending').length,overdue=(s.promises||[]).filter(p=>p.status==='overdue').length,fulfilled=(s.promises||[]).filter(p=>p.status==='fulfilled').length;ps.textContent=`Реестр обязательств: ${pending} на исполнении · ${fulfilled} исполнено · ${overdue} просрочено. Исполнение доступно в панели публичных обязательств.`;}
    const oldStatus=document.getElementById('v8-negotiation-status');if(oldStatus)oldStatus.textContent=`Единая система: ${active.length} активных линий; результаты и обязательства отображаются выше.`;
  }
  function handleClick(e){
    if(e.defaultPrevented)return;const target=e.target.closest?.('button,a');if(!target)return;
    const act=target.dataset.action||target.dataset.v8;
    const groupBtn=target.closest('[data-negotiate-group]');
    const sim=window.gameSimulation;if(!sim)return;
    if(target.id==='v9-new-track')return;
    const stop=()=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();};
    if(target.id==='open-negotiations'||act==='negotiate'||act==='talks'||groupBtn){
      stop();const pref=groupBtn?.dataset.negotiateGroup||null;
      const s=sim.state;let preset={};
      if(act==='talks'&&s.unions?.active)preset={party:'Профсоюзная коалиция',topic:'Трудовые требования и предотвращение забастовки',demand:(s.unions.demands||[]).join(', '),format:'mediated'};
      openCreateForm(sim,pref,preset);return;
    }
    if(['police','emergency','military','ignore'].includes(act)){
      stop();const opts={police:{title:'Запрос подкрепления полиции',body:'Подтвердить распоряжение командованию? Оно выберет построение самостоятельно с учётом толпы и текущих инцидентов.',kind:'warning'},emergency:{title:'Ввести особый режим координации',body:'Решение усилит управление службами и повлияет на доверие, усталость и уровень чрезвычайных полномочий.',kind:'warning'},military:{title:'Развернуть военную миссию',body:'Подразделения получат задачу по защите критической инфраструктуры и безопасных коридоров. Миссия действует до отдельного решения по мандату.',kind:'critical'},ignore:{title:'Оставить ситуацию под наблюдением',body:'Новые правительственные меры не вводятся; оперативное командование продолжит действовать по текущей доктрине.',kind:'info'}}[act];
      queueDecision(sim,{type:'system-action',kicker:'ПРАВИТЕЛЬСТВЕННОЕ РЕШЕНИЕ',title:opts.title,speaker:'Секретариат кабинета',body:opts.body,timeout:120,defaultChoice:'execute',payload:{action:act},choices:[['execute','Подтвердить решение',`Передать приказ: ${act}.`],['cancel','Отказаться','Не применять выбранную меру сейчас.']]});return;
    }
    if(target.hasAttribute('data-crisis-action')||target.id==='apply-policies'){
      stop();const action=target.dataset.crisisAction||(target.id==='apply-policies'?'apply-policies':'');
      queueDecision(sim,{type:'crisis-action',kicker:'ГОСУДАРСТВЕННОЕ РЕШЕНИЕ',title:action==='apply-policies'?'Утвердить пакет государственной политики':`Подтверждение действия: ${action}`,speaker:'Решение будет записано в политический журнал и применено только после выбора.',body:'Подтвердите применение меры. Отказ оставит текущие параметры и обязанности ведомств без изменений.',timeout:120,defaultChoice:'execute',payload:{action},choices:[['execute','Подтвердить и исполнить','Передать выбранное распоряжение и обновить показатели.'],['cancel','Отменить','Не менять текущие настройки и распоряжения.']]});return;
    }
    if(!target.hasAttribute('data-v8'))return;
    const s=sim.state,now=nowOf(s);
    if(['rally','ban','strike','dual-talk','dual-legal','dual-restore','offer','reject','police-protest'].includes(act)){
      stop();
      if(act==='rally'){
        const delay=clamp(document.getElementById('v8-rally-delay')?.value||180,30,1440),route=document.getElementById('v8-rally-route')?.value||'центральный проспект';
        queueDecision(sim,{type:'rally',kicker:'МУНИЦИПАЛЬНОЕ РЕШЕНИЕ',title:'Заявка на публичный марш',speaker:`Предложенный маршрут: ${route}. Начало через ${delay} игровых минут.`,body:'Определите правовой режим мероприятия, условия движения и аварийные коридоры.',timeout:120,defaultChoice:'consult',payload:{route,delay},choices:[['permit','Разрешить маршрут','Согласовать движение, наблюдателей и аварийные коридоры.'],['reroute','Разрешить с изменением маршрута','Снизить транспортные риски и сохранить право на собрание.'],['consult','Запросить консультацию организаторов','В течение часа уточнить логистику, затем автоматически опубликовать календарь.']]});
      }else if(act==='ban'){
        queueDecision(sim,{type:'ban',kicker:'МУНИЦИПАЛЬНОЕ РЕШЕНИЕ',title:'Ограничение маршрута',speaker:'Организаторы заявили о готовности оспорить запрет.',body:'Полный запрет может повысить риск спонтанного собрания; альтернативный маршрут и срочный пересмотр имеют отдельные последствия.',timeout:120,defaultChoice:'review',choices:[['reroute','Предложить альтернативный маршрут','Сохранить мероприятие и изменить транспортную схему.'],['ban','Запретить мероприятие','Юридические и политические издержки будут учтены моделью.'],['review','Отправить решение на срочный пересмотр','Выиграть время для консультации с организаторами.']]});
      }else if(act==='strike'){
        queueDecision(sim,{type:'strike',kicker:'ТРУДОВЫЕ ОТНОШЕНИЯ',title:'Реакция на профсоюзные требования',speaker:'Коалиция профсоюзов готова к забастовке.',body:(s.unions?.demands||[]).join(' · '),timeout:120,defaultChoice:'talk',choices:[['talk','Открыть переговоры до забастовки','Отдельная линия с посредником и письменной повесткой.'],['strike','Признать начало забастовки','Стачка развивается по мере присоединения предприятий.'],['offer','Предложить временный пакет мер','Частичные уступки в обмен на паузу и проверяемый график.']]});
      }else if(act.startsWith('dual-')){
        queueDecision(sim,{type:'dual-power',kicker:'КРИЗИС ГОСУПРАВЛЕНИЯ',title:'Решение по временному совету',speaker:'Публичная позиция правительства будет внесена в журнал.',body:'Выберите между переговорным урегулированием, переходным правовым статусом и процедурой восстановления государственного контроля.',timeout:120,defaultChoice:'talk',choices:[['talk','Начать переговоры','Открыть отдельную дипломатическую линию по полномочиям, гарантиям и срокам.'],['legal','Признать переходный совет','Временно разделить компетенции и ввести совместный надзор.'],['restore','Запустить правовую процедуру восстановления контроля','Сохранить действующие институты; риск эскалации выше.']]});
      }else if(act==='police-protest'){
        queueDecision(sim,{type:'police-labour',kicker:'ТРУДОВЫЕ ОТНОШЕНИЯ · ПОЛИЦИЯ',title:'Ответ на публичную критику полиции',speaker:'Представители сотрудников требуют пересмотра графиков и гарантий правовой защиты.',body:'Решение влияет на усталость, мораль и доступный состав дежурных смен.',timeout:120,defaultChoice:'talk',choices:[['support','Закрепить отдых и правовую защиту','Снизить усталость и восстановить мораль.'],['talk','Открыть переговоры с представителями службы','Создать отдельный трек с посредником и сроками ответа.'],['deny','Отклонить требования','Повысить риск частичного отказа от сверхурочной службы.']]});
      }else if(act==='offer'||act==='reject'){
        const t=s.negotiationTracks.find(x=>!x.closed&&x.stage==='agenda'&&!x.pendingDecisionId&&x.agendaIndex<x.agenda.length);
        if(!t){openCreateForm(sim,null,act==='offer'?{topic:'Встречное предложение правительства'}:{topic:'Официальная позиция правительства'});return;}
        queueDecision(sim,{type:'agenda',trackId:t.id,kicker:'ПЕРЕГОВОРЫ · ДОПОЛНИТЕЛЬНЫЙ ХОД',title:act==='offer'?'Содержание встречного предложения':'Позиция по текущим требованиям',speaker:`Линия: ${t.topic}`,body:'Выберите официальную позицию. Она будет внесена в тот же протокол, а ответ стороны придёт после установленного срока.',timeout:t.format==='mediated'?100:70,defaultChoice:'delay',choices:act==='offer'?[['accept','Принять существенные требования','Признать содержание требований и зарегистрировать исполнение.'],['compromise','Предложить компромисс','Согласовать этапы и срок контрольной проверки.'],['inquiry','Открыть слушания','Перевести вопрос в публичную процедуру.'],['delay','Запросить время','Оставить канал открытым, но увеличить риск затягивания.']]:[['reject','Отказать полностью','Зафиксировать разногласие и риск эскалации.'],['compromise','Отказать частично','Отклонить часть требований и сохранить канал.'],['delay','Отложить решение','Назначить новый срок ответа.'],['inquiry','Открыть слушания','Сохранить процесс через независимую процедуру.']]});
      }
      return;
    }
  }
  // The unified manager replaces both legacy entry points; old UI can no longer start an instantaneous second system.
  SP.startNegotiations=function(preferredGroupId=null){const sim=this;const g=sim.getProtestGroups?.().find(x=>x.id===preferredGroupId);return createTrack(sim,{groupId:preferredGroupId,topic:g?.name,party:g?.name||'Представители площади',demand:g?.demand,format:'direct'});};
  SP.resolveNegotiation=function(choice){const t=this.state.negotiationTracks?.find(x=>!x.closed&&x.stage==='agenda'&&!x.pendingDecisionId);if(!t)return this.startNegotiations?.()||false;const map={accept:'accept',counter:'compromise',hearing:'inquiry',reject:'reject',counter_accept:'accept',counter_improve:'compromise',counter_end:'reject'};const pick=map[choice]||'delay';if(!t.agenda?.length){t.agenda=questionList(t);t.agendaIndex=0;t.stage='agenda';t.startedAt=nowOf(this.state);t.duration=t.format==='mediated'?1080:720;t.endAt=t.startedAt+t.duration;}decideQuestion(this,t,pick);renderDiplomacy(this.state);return true;};
  const oldOpen=UP.openNegotiations;UP.openNegotiations=function(groupId=null){openCreateForm(this.sim,groupId);};
  UP.chooseNegotiationResponse=function(choice){return this.sim.resolveNegotiation(choice);};
  SP._updatePoliceDoctrine=function(eventDriven=false){
    if(!oldPoliceDoctrine)return;
    const s=this.state,actualCrowd=Number(s.crowdTarget)||0,hostile=hostileLoad(s);
    // All previous AI layers see the estimated hostile core, not peaceful attendees; restore the city-wide count afterwards.
    s._v9HostileLoadOverride=hostile;s.crowdTarget=hostile;
    try{return oldPoliceDoctrine.call(this,eventDriven);}finally{s.crowdTarget=actualCrowd;delete s._v9HostileLoadOverride;}
  };
  SP.reset=function(...args){const r=oldReset.apply(this,args);ensureState(this.state,true);renderDiplomacy(this.state);return r;};
  SP.tick=function(speed=1){const s0=this.state;ensureState(s0);if(s0.negotiationProcess)s0.negotiationProcess.active=false;s0.activeNegotiation=null;const before=nowOf(s0);const r=oldTick.call(this,speed);const s=this.state;if(!s.paused){ensureState(s);if(s.negotiationProcess)s.negotiationProcess.active=false;s.activeNegotiation=null;const now=nowOf(s);advanceTracks(this,now);advanceRally(this,now);const cur=s.v9Decisions.find(d=>d.id===s.v9CurrentDecisionId&&d.status==='pending');if(cur&&now>=cur.deadlineAt)resolveDecision(this,cur.id,cur.defaultChoice||cur.choices[0]?.[0],true);renderDecision(this);renderDiplomacy(s);updateDecisionClock(this,cur||{});if(now!==before&&s.v9EventLog?.length){} }return r;};
  SP.enactAction=function(action,...args){const before=this.state.militaryDeployed;const r=oldAction.call(this,action,...args);const s=this.state;if(r&&action==='military'){const now=nowOf(s);s.militaryDeployed=true;s.v9ExplicitMilitaryWithdrawal=false;s.militaryMandateEndsAt=now+1440;s.militaryRenewalPending=false;s.militaryTaskState='защита критической инфраструктуры, больниц и безопасных коридоров';s.militaryStreetRole=true;s.emergencyDays=Math.max(s.emergencyDays||0,1);logEvent(this,'Военная миссия развёрнута',`Задача: ${s.militaryTaskState}. Подразделения остаются на месте до решения кабинета или истечения мандата.`,'warning');}return r;};
  SP.serviceArrive=function(service,incidentId,vehicleId,...args){const r=oldArrive.call(this,service,incidentId,vehicleId,...args);const s=this.state;if(service==='military'&&s.militaryDeployed){s.militaryUnitsOnScene=(s.militaryUnitsOnScene||0)+1;s.militaryTaskState=s.militaryStreetRole===false?'инженерная и логистическая поддержка гражданских служб':'защита критической инфраструктуры, больниц и безопасных коридоров';const scene=window.worldScene,vehicle=scene?.vehicles?.find(v=>v.id===vehicleId);let inc=incidentId?(s.incidents||[]).find(i=>i.id===incidentId):null;if(vehicle)vehicle.v9MilitaryCounted=true;if(!inc){const candidates=(s.incidents||[]).filter(i=>i.status!=='resolved'&&['building_assault','blockade','riot','clash','fire','arson','medical','accident'].includes(i.type)).sort((a,b)=>(b.severity||0)-(a.severity||0));inc=candidates[(Math.max(0,s.militaryUnitsOnScene-1))%Math.max(1,candidates.length)]||null;if(vehicle&&inc)vehicle.incidentId=inc.id;}if(inc){inc.serviceProgress=inc.serviceProgress||{};inc.serviceProgress.military=true;inc.militarySupport=true;inc.militarySupportCount=(inc.militarySupportCount||0)+1;}logEvent(this,'Военное подразделение прибыло и получило задачу',`${s.militaryTaskState}${inc?` · объект: ${inc.label}`:''}. Подразделение остаётся на месте, а не уезжает по короткому таймеру.`,'info');}return r;};
  SP._hourlyStep=function(...args){const s=this.state,wasMilitary=!!s.militaryDeployed;const r=oldHourly.apply(this,args);if(wasMilitary&&!s.militaryDeployed&&!s.v9ExplicitMilitaryWithdrawal){s.militaryDeployed=true;s.militaryTaskState=s.militaryTaskState||'защита критической инфраструктуры и коридоров';if(!s.militaryMandateEndsAt)s.militaryMandateEndsAt=nowOf(s)+60;}
    if(s.militaryDeployed&&(s.militaryUnitsOnScene||0)>0){s.policeMorale=clamp((s.policeMorale||50)+.25,0,100);s.roadBlockage=clamp((s.roadBlockage||0)-.006,0,.98);for(const inc of s.incidents||[]){if(inc.status==='resolved'||!inc.militarySupport)continue;if(['building_assault','blockade','riot','clash'].includes(inc.type))inc.severity=clamp((inc.severity||0)-2,0,100);}}
    return r;};
  SP._maybeResign=function(...args){const was=!!this.state.militaryDeployed;const r=oldMaybeResign?.apply(this,args);if(was&&!this.state.militaryDeployed&&!this.state.v9ExplicitMilitaryWithdrawal){this.state.militaryDeployed=true;this.state.v9LastMilitaryPMChange=nowOf(this.state);logEvent(this,'Военная миссия сохраняется при смене премьера','Мандат остаётся действующим до отдельного решения по его продлению или выводу.','warning');}return r;};
  UP.saveGame=function(...args){ensureState(this.sim.state);return oldSave.apply(this,args);};
  UP.loadGame=function(...args){const r=oldLoad.apply(this,args);ensureState(this.sim.state);renderDiplomacy(this.sim.state);renderDecision(this.sim);return r;};
  UP.updateStats=function(...args){const r=oldStats.apply(this,args);const foot=document.querySelector('.app-footer span');if(foot)foot.textContent='КОНТУР // ВЕРСИЯ 9.0.0';renderDiplomacy(this.sim.state);return r;};
  function boot(){injectDiplomacyPanel();const s=window.gameSimulation?.state;if(s){ensureState(s);renderDiplomacy(s);renderDecision(window.gameSimulation);}document.addEventListener('click',handleClick,true);
    // V8's old single-line overlay is retired; v9 panel owns every negotiation entry point.
    const legacy=document.getElementById('negotiation-overlay');if(legacy)legacy.hidden=true;
    const foot=document.querySelector('.app-footer span');if(foot)foot.textContent='КОНТУР // ВЕРСИЯ 9.0.0';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.KonturV9={ensureState,createTrack,queueDecision,resolveDecision,renderDiplomacy,renderDecision,hostileLoad,finishTrack,applyPoliticalChoice,advanceTracks,questionList,createPromise,applyMandate,decideQuestion,processActorResponse,advanceRally,applySystemAction,applyRallyChoice,applyBanChoice,applyStrikeChoice,applyDualPowerChoice};
})();
