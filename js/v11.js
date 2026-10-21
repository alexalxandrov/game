'use strict';
/* KONTUR v11 — resilient decision UI, consistent saves, political choices and protest organization. */
(function installKonturV11(){
  const Sim=window.RepublicSimulation, UI=window.RepublicDashboardUI, api=window.KonturV9;
  if(!Sim||!UI||!api)return;
  const SP=Sim.prototype, UP=UI.prototype;
  const oldTick=SP.tick, oldQueue=api.queueDecision, oldResolve=api.resolveDecision, oldRender=api.renderDecision;
  const oldSave=UP.saveGame, oldLoad=UP.loadGame, oldUpdateStats=UP.updateStats, oldRenderAll=UP.renderAll;
  const KEY='kontur-republic-save-v11';
  const LEGACY_KEYS=['kontur-republic-save-v10','kontur-republic-save-v9','kontur-republic-save-v9_0','kontur-republic-save-v8_1','kontur-republic-save-v8-1','kontur-republic-save-v8','kontur-republic-save-v7_2','kontur-republic-save-v7_1','kontur-republic-save-v7','kontur-republic-save-v6','kontur-republic-save-v5','kontur-republic-save-v4','kontur-republic-save-v3','kontur-republic-save-v2'];
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
  const nowOf=s=>Math.max(1,Number(s?.day)||1)*1440-1440+(Number(s?.hour)||0)*60+(Number(s?.minute)||0);
  const getDecision=(s)=>{
    if(!s)return null;
    let d=(s.v9Decisions||[]).find(x=>x.status==='pending'&&x.id===s.v9CurrentDecisionId);
    if(!d)d=(s.v9Decisions||[]).find(x=>x.status==='queued');
    return d||null;
  };
  const fallbackChoices=d=>{
    const key=d.defaultChoice||'confirm';
    const label=d.defaultChoice?'Подтвердить выбранный вариант':'Подтвердить решение';
    const desc=`В системе не сохранился список вариантов. Применить зарегистрированный вариант (${key}) и записать событие в протокол.`;
    return [[key,label,desc],['cancel','Отказаться / отложить','Не применять новое обязательство; сохранить возможность повторного рассмотрения.']];
  };
  function repairDecisionData(sim,d){
    if(!sim?.state||!d)return null;
    const s=sim.state;
    if(d.type==='agenda'&&d.trackId){
      window.KonturV10?.syncTracks(s);
      const t=(s.negotiationTracks||[]).find(x=>x.id===d.trackId);
      const ix=Math.max(0,Math.min((t?.agendaIndex||0),Math.max(0,(t?.agenda?.length||1)-1)));
      const question=t?.agenda?.[ix]||t?.v10AgendaData?.[ix]?.question;
      let options=t?.agendaOptions?.[ix];
      if(!Array.isArray(options)||!options.length)options=t?.v10AgendaData?.[ix]?.options;
      // The old v10 schema could persist a generic body, an empty option list or an outdated
      // agenda version. The issue-specific track data is authoritative for every pending round.
      if(t&&question&&Array.isArray(options)&&options.length){
        d.title=question;
        d.body=`ТЕМА: ${t.topic}. СТОРОНА: ${t.party}. Предмет обсуждения: ${question} Общие требования стороны: ${t.demand}. Это конкретный пункт ${ix+1}/${t.agenda.length}. После позиции кабинета делегация ответит в установленный срок; при отказе может выставить встречное предложение или ультиматум.`;
        d.choices=options;
        d.v10AgendaSignature=`${t.id}:${ix}:${question}`;
      }
    }
    if(!d.title||!String(d.title).trim()){
      const t=d.trackId?(s.negotiationTracks||[]).find(x=>x.id===d.trackId):null;
      d.title=t?.agenda?.[t.agendaIndex]||t?.topic||'Требуется политическое решение';
    }
    if(!d.kicker)d.kicker=d.type==='agenda'?'ПЕРЕГОВОРЫ · ТЕКУЩИЙ ВОПРОС':'ТРЕБУЕТСЯ РЕШЕНИЕ';
    if(!d.speaker)d.speaker=d.trackId?`Линия ${d.trackId}`:'Секретариат кабинета';
    if(!d.body)d.body='Выберите один из доступных вариантов. Выбор будет зафиксирован в журнале политических решений.';
    let raw=Array.isArray(d.choices)?d.choices:[];
    raw=raw.map((c,i)=>{
      if(Array.isArray(c))return [String(c[0]??`option-${i}`),String(c[1]??`Вариант ${i+1}`),String(c[2]??'Применить позицию и зарегистрировать её последствия.')];
      if(c&&typeof c==='object')return [String(c.value??c.id??`option-${i}`),String(c.label??c.title??`Вариант ${i+1}`),String(c.description??c.desc??'Применить позицию и зарегистрировать её последствия.')];
      return null;
    }).filter(Boolean);
    if(!raw.length)raw=fallbackChoices(d);
    d.choices=raw;
    if(!d.defaultChoice||!raw.some(c=>c[0]===d.defaultChoice))d.defaultChoice=raw[0][0];
    if(!Number.isFinite(Number(d.timeout))||Number(d.timeout)<1)d.timeout=120;
    return d;
  }
  function appendText(parent,tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=String(text??'');parent.appendChild(el);return el;}
  function setBodyLock(active){if(!document.body)return;document.body.classList.toggle('v11-decision-open',!!active);}
  function repairModal(sim){
    if(!sim?.state||!document.body)return;
    const s=sim.state;
    if(s.v9Decisions&&typeof window.KonturV10?.syncTracks==='function')window.KonturV10.syncTracks(s);
    let d=getDecision(s);
    if(!d){const stale=document.getElementById('v9-modal-overlay');if(stale)stale.remove();setBodyLock(false);return;}
    repairDecisionData(sim,d);
    // Let the original queue promote a queued decision and set its deadline first.
    if(d.status==='queued'&&!document.getElementById('v9-modal-overlay')){
      try{oldRender.call(api,sim);}catch{}
      d=getDecision(s)||d;repairDecisionData(sim,d);
    }
    if(!d.deadlineAt)d.deadlineAt=nowOf(s)+Math.max(1,Number(d.timeout)||120);
    if(!d.shownAt)d.shownAt=nowOf(s);
    let overlay=document.getElementById('v9-modal-overlay');
    if(!overlay){
      try{oldRender.call(api,sim);}catch{}
      overlay=document.getElementById('v9-modal-overlay');
    }
    if(!overlay){
      overlay=document.createElement('div');overlay.id='v9-modal-overlay';overlay.className='v9-modal-overlay v11-modal-overlay';overlay.setAttribute('role','presentation');document.body.appendChild(overlay);
    }
    overlay.dataset.decisionId=d.id;overlay.setAttribute('aria-label','Окно обязательного политического решения');
    let dialog=overlay.querySelector('.v9-modal-dialog');
    const expected=JSON.stringify({id:d.id,kicker:d.kicker,title:d.title,speaker:d.speaker,body:d.body,choices:d.choices,defaultChoice:d.defaultChoice});
    const existingTitle=dialog?.querySelector('#v9-modal-title');
    const existingChoices=dialog?.querySelector('.v11-modal-options,.v9-modal-choices');
    const expectedCount=d.choices.length;
    const buttonsOk=existingChoices&&existingChoices.querySelectorAll('button.v11-modal-option').length===expectedCount;
    const titleOk=existingTitle&&existingTitle.textContent===d.title;
    if(!dialog||dialog.dataset.v11Signature!==expected||!buttonsOk||!titleOk){
      overlay.replaceChildren();
      dialog=document.createElement('section');dialog.className='v9-modal-dialog v11-modal-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','v9-modal-title');dialog.tabIndex=-1;
      appendText(dialog,'div','v9-modal-kicker v11-modal-kicker',d.kicker);
      appendText(dialog,'h2','v11-modal-title',d.title).id='v9-modal-title';
      appendText(dialog,'p','v9-modal-speaker',d.speaker);
      appendText(dialog,'div','v9-modal-body v11-modal-body',d.body);
      const timer=document.createElement('div');timer.className='v9-modal-timer v11-modal-timer';timer.id='v9-modal-timer';appendText(timer,'span','', 'СРОК ОТВЕТА');const time=appendText(timer,'strong','','');time.id='v9-modal-timeleft';dialog.appendChild(timer);
      const progress=document.createElement('div');progress.className='v9-modal-progress v11-modal-progress';const fill=document.createElement('i');fill.id='v9-modal-progress-fill';progress.appendChild(fill);dialog.appendChild(progress);
      const options=document.createElement('div');options.className='v9-modal-choices v11-modal-options';options.setAttribute('role','group');options.setAttribute('aria-label','Варианты решения');
      for(const [value,label,desc] of d.choices){
        const b=document.createElement('button');b.type='button';b.className='v9-modal-choice v11-modal-option';b.dataset.choice=value;
        const strong=appendText(b,'strong','',label);const small=appendText(b,'small','',desc);
        if(value===d.defaultChoice){b.classList.add('v11-default-option');small.textContent=`${desc} По умолчанию по истечении срока.`;b.setAttribute('aria-describedby',`v11-default-${String(d.id).replace(/[^a-zA-Z0-9_-]/g,'')}`);const badge=appendText(b,'span','v11-default-tag','ВАРИАНТ ПО УМОЛЧАНИЮ');badge.id=`v11-default-${String(d.id).replace(/[^a-zA-Z0-9_-]/g,'')}`;}
        b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(!b.isConnected)return;api.resolveDecision(sim,d.id,value,false);});options.appendChild(b);
      }
      dialog.appendChild(options);
      const defaultLabel=d.choices.find(c=>c[0]===d.defaultChoice)?.[1]||d.defaultChoice;
      appendText(dialog,'p','v9-modal-foot v11-modal-foot',`Выберите вариант. Окно блокирует управление до решения. Если срок истечёт, автоматически сработает отмеченный вариант по умолчанию: «${defaultLabel}». Решение и его последствия будут записаны в протокол.`);
      dialog.dataset.v11Signature=expected;overlay.appendChild(dialog);
    }
    // Keep timers live without reconstructing focused buttons every second.
    const left=Math.max(0,(Number(d.deadlineAt)||nowOf(s))-nowOf(s));
    const clock=overlay.querySelector('#v9-modal-timeleft');if(clock)clock.textContent=`${left} игровых минут · ${Math.ceil(left/60)} ч`;
    const bar=overlay.querySelector('#v9-modal-progress-fill');if(bar)bar.style.width=`${clamp(left/Math.max(1,Number(d.timeout)||120)*100,0,100)}%`;
    overlay.style.display='grid';overlay.style.visibility='visible';overlay.style.pointerEvents='all';setBodyLock(true);
  }
  const lastCivicAction=window.KonturV10?.executeCivicAction;
  const civicCooldown={press:120,stream:90,viral:180,chorus:90,chain:180,stewards:120,observers:180};
  if(typeof lastCivicAction==='function')window.KonturV10.executeCivicAction=function(sim,action){
    const s=sim?.state;if(!s)return false;const now=nowOf(s);s.v11ActionLastAt=s.v11ActionLastAt||{};const cd=civicCooldown[action]||0;const lastAt=Number(s.v11ActionLastAt[action]);const remaining=(Number.isFinite(lastAt)?lastAt:-Infinity)+cd-now;
    if(remaining>0){logCivic(sim,'Действие пока на перезарядке',action,`Повторное действие доступно через ${Math.ceil(remaining)} игровых минут. Это предотвращает накопление бесконечных эффектов от одной и той же команды.`,'warning');return false;}
    const result=lastCivicAction.call(window.KonturV10,sim,action);if(result)s.v11ActionLastAt[action]=now;return result;
  };
  function queuePolicy(sim,kind){
    const s=sim.state,now=nowOf(s);if(!Array.isArray(s.v11CivicActions))s.v11CivicActions=[];
    const configs={
      'police-review':{kicker:'ПОДОТЧЁТНОСТЬ · ПОЛИЦЕЙСКАЯ СЛУЖБА',title:'Как расследовать жалобы на применение силы?',speaker:'Решение кабинета · независимость проверки влияет на доверие и риск повторных инцидентов.',body:'Выберите модель контроля. Само объявление расследования не предрешает выводы; важны доступ к исходным материалам, защита свидетелей и публичный срок отчёта.',timeout:180,defaultChoice:'independent',choices:[['independent','Независимая гражданская комиссия','Доступ к записям и приказам, защита свидетелей, промежуточный отчёт через 7 игровых дней.'],['ombudsman','Судебный уполномоченный и внешний наблюдатель','Более узкий мандат, независимый доступ к жалобам и обязательные ответы ведомств.'],['internal','Внутренняя проверка с публикацией итогов','Быстрее и дешевле, но общественное доверие к независимости ниже.'],['reject','Не открывать расследование','Сохранить ведомственную процедуру; вероятны протест и дальнейшее падение доверия.']]},
      'living-cost':{kicker:'СОЦИАЛЬНАЯ ПОЛИТИКА · СТОИМОСТЬ ЖИЗНИ',title:'Как ответить на рост расходов домохозяйств?',speaker:'Финансовое решение кабинета · эффект зависит от стоимости, адресности и доверия.',body:'Расходы финансируются из казны. Широкая компенсация заметнее снижает недовольство, но создаёт больший бюджетный риск; отсрочка экономит средства, но повышает риск стачек.',timeout:180,defaultChoice:'targeted',choices:[['targeted','Адресная помощь уязвимым домохозяйствам','Умеренные затраты, быстрый эффект для наиболее затронутых групп и пересмотр через 30 дней.'],['index','Временная индексация пособий','Более широкая поддержка с заметными затратами и аудитом инфляционного эффекта.'],['broad','Общая компенсация тарифов на 60 дней','Сильнее снижает напряжённость, но существенно расходует резерв и требует контрольной даты окончания.'],['defer','Отложить решение до бюджетной комиссии','Сохранить резервы; риск недоверия и трудовой мобилизации повышается.']]},
      'transparency':{kicker:'ПУБЛИЧНАЯ ОТЧЁТНОСТЬ · СВОБОДА СМИ',title:'Как опубликовать материалы кризиса?',speaker:'Решение кабинета · безопасность свидетелей должна сочетаться с проверяемостью фактов.',body:'Публичность помогает проверять действия власти, но публикация персональных данных может навредить свидетелям. Выберите баланс прозрачности и защиты материалов.',timeout:150,defaultChoice:'redacted',choices:[['full','Публиковать приказы и журналы с минимальной задержкой','Максимальная прозрачность; персональные данные свидетелей предварительно защищаются.'],['redacted','Независимая публикация с редакцией персональных данных','Материалы передаются внешнему хранителю, версии документов сверяются с оригиналами.'],['briefing','Ежедневный брифинг без публикации исходников','Регулярные ответы, но меньше возможности для независимой проверки.'],['restrict','Временно ограничить публикации','Сохраняет оперативную закрытость, но резко повышает недоверие и риск слухов.']]},
      'police-liaison':{kicker:'ДЕЭСКАЛАЦИЯ · КАНАЛ СВЯЗИ',title:'Открыть постоянный канал связи с организаторами?',speaker:'Муниципальный посредник, полиция и распорядители площади.',body:'Канал связи фиксирует маршруты, предупреждения, пропавших людей и экстренные коридоры. Он не означает согласия с требованиями и не отменяет расследования.',timeout:120,defaultChoice:'liaison',choices:[['liaison','Назначить двух связных и общий канал','Оперативный обмен информацией на 6 часов; меньше риск ошибки и внезапного столкновения.'],['mediator','Поручить связь независимому посреднику','Медленнее, но повышает доверие сторон, которые не готовы напрямую координироваться.'],['refuse','Не открывать канал связи','Сохранить раздельные цепочки командования; возрастает риск неверной оценки намерений.']]},
      'legal-medical':{kicker:'ГРАЖДАНСКАЯ ЗАЩИТА · МЕДИКИ И ЮРИСТЫ',title:'Какие группы поддержки направить на площадь?',speaker:'Организаторы, медики и юридические наблюдатели.',body:'Ни одна из этих групп не заменяет экстренные службы. Медики снижают тяжесть последствий инцидентов, юристы документируют задержания, а независимые наблюдатели помогают восстановить ход событий.',timeout:120,defaultChoice:'both',choices:[['medical','Медицинские пункты и эвакуационные маршруты','Два пункта первой помощи и временный план передачи пострадавших скорой.'],['legal','Юридическая помощь и наблюдение за задержаниями','Дежурные юристы, горячая линия и фиксация времени/места задержаний.'],['both','Медицинская и юридическая сети','Обе сети на 6 часов, безопасный коридор и сменный график добровольцев.'],['cancel','Пока не развертывать сети','Не менять текущую конфигурацию служб.']]},
      'assembly-vote':{kicker:'ПРОТЕСТНОЕ ДВИЖЕНИЕ · МАНДАТ УЧАСТНИКОВ',title:'Какое решение вынести на собрание участников?',speaker:'Организаторы должны учитывать разные фракции и усталость участников.',body:'Участники могут поддержать мирное шествие, сидячую акцию, трудовую солидарность или временную паузу. Решение формирует публичный мандат; оно не заставляет всех участников действовать одинаково.',timeout:150,defaultChoice:'peaceful',choices:[['peaceful','Мирное шествие с распорядителями','Сохраняет широкую коалицию и снижает риск случайных столкновений, но требует дисциплины и смен.'],['sit-in','Сидячая акция с коридорами для служб','Усиливает видимость протеста и транспортные издержки; растут усталость и давление на переговоры.'],['strike','Призыв к трудовой солидарности','Расширяет давление на работодателей и транспорт, но не гарантирует поддержку всех профсоюзов.'],['pause','Пауза на срок переговоров','Снижает уличную напряжённость, но радикальная часть может обвинить лидеров в уступках.']]}
    };
    const c=configs[kind];if(!c)return false;
    const d=oldQueue.call(api,sim,{...c,type:`v11-${kind}`,payload:{kind,createdAt:now},notify:true});setTimeout(()=>repairModal(sim),0);return d;
  }
  function logCivic(sim,title,choice,body,kind='info'){
    const s=sim.state;const now=nowOf(s);s.v11CivicActions=Array.isArray(s.v11CivicActions)?s.v11CivicActions:[];
    const row={id:`V11-${now}-${s.v11CivicActions.length+1}`,at:now,title,choice,body,kind};s.v11CivicActions.unshift(row);s.v11CivicActions=s.v11CivicActions.slice(0,50);
    s.politicalDecisionLog=Array.isArray(s.politicalDecisionLog)?s.politicalDecisionLog:[];s.politicalDecisionLog.unshift({id:row.id,at:now,day:s.day||1,event:'v11',title,choice,choiceTitle:choice,description:body,automatic:false});s.politicalDecisionLog=s.politicalDecisionLog.slice(0,60);
    s.v9EventLog=Array.isArray(s.v9EventLog)?s.v9EventLog:[];s.v9EventLog.unshift({id:row.id,at:now,day:s.day||1,hour:s.hour||0,title,body,kind});s.v9EventLog=s.v9EventLog.slice(0,60);
    sim.addNews?.('politics',kind==='warning'?'warning':kind==='success'?'good':'info',title,body);
  }
  function resolveV11Decision(sim,d,choice,automatic){
    const s=sim.state,now=nowOf(s),kind=d.payload?.kind||d.type.replace(/^v11-/,'');
    d.status=automatic?'timed-out':'resolved';d.choice=choice;d.resolvedAt=now;d.automatic=!!automatic;
    if(s.v9CurrentDecisionId===d.id)s.v9CurrentDecisionId=null;
    const overlay=document.getElementById('v9-modal-overlay');if(overlay?.dataset.decisionId===d.id)overlay.remove();
    let title=d.title,detail='',tone='info';
    if(kind==='police-review'){
      s.v11PoliceOversight=s.v11PoliceOversight||{};s.v11PoliceOversight.until=now+720;s.v11PoliceOversight.level=choice==='independent'?3:choice==='ombudsman'?2:choice==='internal'?1:0;s.v11PoliceOversight.mode=choice;
      if(choice==='independent'){s.investigationOpen=true;s.treasury=Math.max(0,(s.treasury||0)-.008);s.trust=clamp((s.trust||50)+4);s.crowdAnger=clamp((s.crowdAnger||0)-18,0,1000);s.v6Radicalization=clamp((s.v6Radicalization||0)-3.5);detail='Независимая комиссия получила мандат, бюджет, доступ к материалам и семидневный срок промежуточного отчёта. Доверие растёт; проверка действует до публикации отчёта.';tone='success';}
      else if(choice==='ombudsman'){s.investigationOpen=true;s.trust=clamp((s.trust||50)+2);s.crowdAnger=clamp((s.crowdAnger||0)-9,0,1000);detail='Судебный уполномоченный получил доступ к жалобам и может требовать письменных ответов; эффект контроля умеренный.';tone='success';}
      else if(choice==='internal'){s.investigationOpen=true;s.trust=clamp((s.trust||50)+.5);detail='Внутренняя проверка открыта, но общественные наблюдатели сохраняют сомнения в независимости.';}
      else{s.trust=clamp((s.trust||50)-5);s.crowdAnger=clamp((s.crowdAnger||0)+22,0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+100,0,s.cityPopulation||5000);s.v6Radicalization=clamp((s.v6Radicalization||0)+4);detail='Отказ вызвал кризис доверия и усилил мобилизацию; риск нового инцидента повышен.';tone='warning';}
    }else if(kind==='living-cost'){
      if(choice==='targeted'){s.treasury=Math.max(0,(s.treasury||0)-.012);s.policies=s.policies||{};s.policies.welfare=clamp((s.policies.welfare||50)+3);s.crowdAnger=clamp((s.crowdAnger||0)-13,0,1000);s.approval=clamp((s.approval||50)+2);detail='Запущена адресная программа с пересмотром через 30 дней. Бюджетная нагрузка ограничена; эффект в первую очередь касается уязвимых домохозяйств.';tone='success';}
      else if(choice==='index'){s.treasury=Math.max(0,(s.treasury||0)-.02);s.policies=s.policies||{};s.policies.welfare=clamp((s.policies.welfare||50)+7);s.crowdAnger=clamp((s.crowdAnger||0)-19,0,1000);s.approval=clamp((s.approval||50)+2);detail='Введена временная индексация пособий; через 90 игровых дней казначейство должно проверить инфляционный и бюджетный эффект.';tone='success';}
      else if(choice==='broad'){s.treasury=Math.max(0,(s.treasury||0)-.035);s.policies=s.policies||{};s.policies.welfare=clamp((s.policies.welfare||50)+10);s.crowdAnger=clamp((s.crowdAnger||0)-28,0,1000);s.approval=clamp((s.approval||50)+3);detail='Общая компенсация снижает немедленное недовольство, но резерв казны сокращён заметнее; программа заканчивается через 60 дней без нового решения.';tone='success';}
      else{s.crowdAnger=clamp((s.crowdAnger||0)+12,0,1000);s.activeStrikes=(s.activeStrikes||0)+1;detail='Решение отложено. Профсоюзы получили аргумент для дальнейшего давления и могут объявить голосование о стачке.';tone='warning';}
    }else if(kind==='transparency'){
      s.policies=s.policies||{};
      if(choice==='full'){s.policies.mediaFreedom=clamp((s.policies.mediaFreedom??50)+5);s.trust=clamp((s.trust||50)+3);s.investigationOpen=true;detail='Журналы приказов публикуются с задержкой только на удаление персональных данных. Репортёры могут сверить документы с исходниками.';tone='success';}
      else if(choice==='redacted'){s.policies.mediaFreedom=clamp((s.policies.mediaFreedom??50)+3);s.trust=clamp((s.trust||50)+2);s.investigationOpen=true;detail='Назначен независимый хранитель исходников; публикация исключает данные свидетелей и пострадавших.';tone='success';}
      else if(choice==='briefing'){s.trust=clamp((s.trust||50)+.5);detail='Ежедневные брифинги введены, но независимые редакции продолжают требовать доступ к исходникам.';}
      else{s.policies.mediaFreedom=clamp((s.policies.mediaFreedom??50)-10);s.trust=clamp((s.trust||50)-4);s.crowdAnger=clamp((s.crowdAnger||0)+16,0,1000);s.media=s.media||{};s.media.viralLevel=clamp((s.media.viralLevel||0)+14);detail='Ограничение публикаций вызвало недоверие и ускорило распространение неподтверждённых сообщений.';tone='warning';}
    }else if(kind==='police-liaison'){
      if(choice==='liaison'){s.v11PoliceLiaisonUntil=now+360;s.v11PoliceLiaisonMode='joint';s.tension=clamp((s.tension||0)-2);s.crowdAnger=clamp((s.crowdAnger||0)-5,0,1000);detail='Два связных получили общий канал на шесть часов; координаты маршрутов и предупреждения об инцидентах передаются обеим сторонам.';tone='success';}
      else if(choice==='mediator'){s.v11PoliceLiaisonUntil=now+480;s.v11PoliceLiaisonMode='mediated';s.tension=clamp((s.tension||0)-1.5);s.trust=clamp((s.trust||50)+1);detail='Связь ведёт независимый посредник; обмен медленнее, но менее уязвим для прямого давления.';tone='success';}
      else{s.v11PoliceLiaisonUntil=0;s.crowdAnger=clamp((s.crowdAnger||0)+6,0,1000);detail='Стороны остаются без общего канала; любые изменения маршрута требуют публичного объявления.';tone='warning';}
    }else if(kind==='legal-medical'){
      if(choice==='cancel'){detail='Развёртывание медицинской и юридической поддержки отложено.';}
      else{s.v11SupportUntil=now+360;s.v11SupportMode=choice;s.v10Crowd=s.v10Crowd||{};s.v10Crowd.observers=Math.max(s.v10Crowd.observers||0,choice==='both'?4:2);s.v10Crowd.observersExpireAt=Math.max(s.v10Crowd.observersExpireAt||0,now+360);s.emergencyCorridor=true;s.v11MedicalAidActive=(choice==='medical'||choice==='both');if(choice==='legal'||choice==='both'){s.investigationOpen=true;s.trust=clamp((s.trust||50)+1.5);}detail=`Развёрнута поддержка: ${choice==='both'?'медики и юристы':choice==='medical'?'медики':'юридические наблюдатели'}. Смена действует шесть игровых часов; коридор и фиксация инцидентов включены.`;tone='success';}
    }else if(kind==='assembly-vote'){
      s.v10Crowd=s.v10Crowd||{};s.v10Crowd.assemblyCount=(s.v10Crowd.assemblyCount||0)+1;s.v10Crowd.mandate=choice;s.v10Crowd.mandateAt=now;
      if(choice==='peaceful'){s.v6Organization=clamp((s.v6Organization||0)+7);s.v6Radicalization=clamp((s.v6Radicalization||0)-4);s.crowdAnger=clamp((s.crowdAnger||0)-4,0,1000);s.mobilizationSurge=Math.max(0,(s.mobilizationSurge||0)-35);if(s.rally)s.rally.status='announced';detail='Собрание поддержало мирное шествие с распорядителями. Координация растёт, риск случайных столкновений снижается при соблюдении коридоров.';tone='success';}
      else if(choice==='sit-in'){s.v6Organization=clamp((s.v6Organization||0)+5);s.crowdFatigue=clamp((s.crowdFatigue||0)+5);s.v11SitInUntil=now+300;s.tension=clamp((s.tension||0)+1.5);if(s.rally)s.rally.status='sit-in';detail='Принята сидячая акция на пять игровых часов. Видимость требований растёт, но движение замедляется, участники быстрее устают, а переговоры с перевозчиками становятся важнее.';tone='warning';}
      else if(choice==='strike'){s.v12SolidarityBallot={status:'open',startedAt:now,deadlineAt:now+180,resolvedAt:null};s.v6Organization=clamp((s.v6Organization||0)+4);detail='Профсоюзам направлен запрос о солидарной стачке. Она не считается начавшейся автоматически: в течение трёх игровых часов профсоюзы проводят голосование с учётом поддержки, усталости и цены остановки работы.';tone='warning';}
      else{s.tension=clamp((s.tension||0)-2);s.mobilizationSurge=Math.max(0,(s.mobilizationSurge||0)-100);s.v10Crowd.negotiationPauseUntil=now+180;detail='Участники одобрили паузу на три игровых часа ради переговоров. При отсутствии видимого ответа поддержка жёсткой линии может восстановиться.';tone='success';}
    }
    logCivic(sim,title,d.choices.find(c=>c[0]===choice)?.[1]||choice,detail,tone);
    s.v9CurrentDecisionId=null;api.renderDiplomacy?.(s,true);renderPolicyStatus(s);sim._refreshDerived?.();sim._notify?.('update');
    // Queue another decision only after the chosen one has fully resolved.
    setTimeout(()=>repairModal(sim),0);return true;
  }
  function renderPolicyStatus(s){
    const el=document.getElementById('v11-policy-status');if(!el)return;const now=nowOf(s);
    const bits=[];if((s.v11PoliceOversight?.until||0)>now)bits.push(`Контроль полиции: ${s.v11PoliceOversight.mode}, ещё ${s.v11PoliceOversight.until-now} мин.`);if((s.v11PoliceLiaisonUntil||0)>now)bits.push(`Канал связи: ${s.v11PoliceLiaisonMode}, ещё ${s.v11PoliceLiaisonUntil-now} мин.`);if((s.v11SupportUntil||0)>now)bits.push(`Медико-правовая поддержка: ${s.v11SupportMode}, ещё ${s.v11SupportUntil-now} мин.`);el.textContent=bits.join(' · ')||'Нет временных мер с активным сроком. Решения кабинета и общественных организаторов получают срок, статус и записанный результат.';
  }
  function ensureCivicPanel(){
    const root=document.getElementById('v10-civic-panel');if(!root)return;
    let section=document.getElementById('v11-policy-actions');
    if(!section){section=document.createElement('section');section.id='v11-policy-actions';section.className='v11-policy-actions';
      appendText(section,'div','v9-kicker','03В / ДОПОЛНИТЕЛЬНЫЕ ПОЛИТИЧЕСКИЕ ИНСТРУМЕНТЫ');appendText(section,'h3','','Подотчётность, социальная политика и деэскалация');
      appendText(section,'p','v11-policy-intro','Каждая мера создаёт запись в журнале и изменяет параметры, а не только текст новости. Срок временных эффектов отображается ниже.');
      const actions=document.createElement('div');actions.className='v10-actions v11-policy-buttons';
      const choices=[['police-review','Открыть расследование жалоб на полицию'],['living-cost','Ответить на рост стоимости жизни'],['transparency','Выбрать режим публикации материалов'],['police-liaison','Открыть канал связи с организаторами']];
      for(const [kind,label] of choices){const b=document.createElement('button');b.type='button';b.dataset.v11Action=kind;b.textContent=label;actions.appendChild(b);}section.appendChild(actions);appendText(section,'p','v11-policy-status','Нет временных мер с активным сроком.').id='v11-policy-status';root.appendChild(section);
    }
    const crowdSection=[...root.querySelectorAll('.v10-civic-grid>section')].find(x=>/Самоорганизация толпы/.test(x.querySelector('h3')?.textContent||''));
    if(crowdSection&&!crowdSection.querySelector('[data-v11-action="assembly-vote"]')){const b=document.createElement('button');b.type='button';b.dataset.v11Action='assembly-vote';b.textContent='Созвать голосование участников';crowdSection.querySelector('.v10-actions')?.appendChild(b);}
    if(crowdSection&&!crowdSection.querySelector('[data-v11-action="legal-medical"]')){const b=document.createElement('button');b.type='button';b.dataset.v11Action='legal-medical';b.textContent='Медики и юридическая поддержка';crowdSection.querySelector('.v10-actions')?.appendChild(b);}
    renderPolicyStatus(window.gameSimulation?.state||{});
  }
  function postProcess(sim){if(!sim?.state)return;ensureCivicPanel();repairModal(sim);renderPolicyStatus(sim.state);}
  api.queueDecision=function(sim,d){const r=oldQueue.call(api,sim,d);postProcess(sim);return r;};
  api.renderDecision=function(sim,...args){const r=oldRender.call(api,sim,...args);postProcess(sim);return r;};
  api.resolveDecision=function(sim,id,choice,automatic=false){const d=sim?.state?.v9Decisions?.find(x=>x.id===id);if(d?.type?.startsWith('v11-'))return resolveV11Decision(sim,d,choice,automatic);const r=oldResolve.call(api,sim,id,choice,automatic);postProcess(sim);return r;};
  SP.tick=function(...args){const r=oldTick.apply(this,args);postProcess(this);return r;};
  UP.renderAll=function(...args){const r=oldRenderAll?.apply(this,args);postProcess(this.sim);return r;};
  UP.saveGame=function(automatic=false){
    try{localStorage.setItem(KEY,JSON.stringify(this.sim.snapshot()));this._lastSaveAt=new Date();const label=document.getElementById('last-save-label');if(label)label.textContent=`СОХРАНЕНО ${this._lastSaveAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;if(!automatic)this.toast('Игра сохранена','Состояние v11 записано в текущий слот. Старые слоты сохранены отдельно.','success');return true;}
    catch(err){if(!automatic)this.toast('Не удалось сохранить',`Браузер не разрешил запись в localStorage: ${err.message}`,'error');return false;}
  };
  UP.loadGame=function(){
    try{
      let raw=localStorage.getItem(KEY),source=KEY;
      if(!raw){for(const key of LEGACY_KEYS){const candidate=localStorage.getItem(key);if(candidate){raw=candidate;source=key;break;}}}
      if(!raw){this.toast('Сохранение не найдено','Нет сохранений v11 или совместимых старых версий в этом браузере.','warning');return false;}
      const parsed=JSON.parse(raw);if(!parsed||!parsed.state)throw new Error('В файле отсутствует состояние симуляции.');
      this.sim.loadSnapshot(parsed);this.sim.state= this.sim.state||parsed.state;
      window.KonturV10?.ensureState(this.sim.state);window.KonturV10?.syncTracks(this.sim.state);window.KonturV10?.archiveClosed(this.sim.state);
      this.draft={...(this.sim.state.policies||{})};this._syncPolicyInputs?.();postProcess(this.sim);this.renderAll?.(true);postProcess(this.sim);
      if(source!==KEY)localStorage.setItem(KEY,JSON.stringify(this.sim.snapshot()));
      const label=document.getElementById('last-save-label');if(label)label.textContent=source===KEY?'ЗАГРУЖЕНО ИЗ v11':`ИМПОРТИРОВАНО ИЗ ${source.replace('kontur-republic-save-','v')}`;
      this.toast('Сохранение загружено',source===KEY?'Состояние v11 восстановлено.':'Старое сохранение импортировано; исходный слот оставлен без изменений.','success');return true;
    }catch(err){this.toast('Ошибка загрузки',`Сохранение не удалось прочитать: ${err.message}`,'error');return false;}
  };
  if(typeof oldUpdateStats==='function')UP.updateStats=function(...args){const r=oldUpdateStats.apply(this,args);const foot=document.querySelector('.app-footer span');if(foot)foot.textContent='КОНТУР // ВЕРСИЯ 11.0.0';return r;};
  function boot(){ensureCivicPanel();const sim=window.gameSimulation;if(sim?.state)postProcess(sim);}
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-v11-action]');if(!b)return;const sim=window.gameSimulation;if(!sim?.state)return;e.preventDefault();e.stopPropagation();queuePolicy(sim,b.dataset.v11Action);
  },true);
  if(window.GAME_CONFIG)window.GAME_CONFIG.version='11.0.0';
  window.KonturV11={version:'11.0.0',repairDecisionData,repairModal,queuePolicy,resolveV11Decision,ensureCivicPanel};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
