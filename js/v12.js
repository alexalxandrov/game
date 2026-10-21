'use strict';
/* KONTUR v12 — durable political programs, ballot dynamics and repaired agenda migration. */
(function installKonturV12(){
  const Sim=window.RepublicSimulation, UI=window.RepublicDashboardUI, api=window.KonturV9;
  if(!Sim||!UI||!api||!window.KonturV11||!window.KonturV10)return;
  const SP=Sim.prototype, UP=UI.prototype;
  const oldTick=SP.tick, oldResolve=api.resolveDecision, oldQueue=api.queueDecision, oldUpdate=UP.updateStats;
  const KEY='kontur-republic-save-v12';
  const LEGACY_KEYS=['kontur-republic-save-v11','kontur-republic-save-v10','kontur-republic-save-v9','kontur-republic-save-v9_0','kontur-republic-save-v8_1','kontur-republic-save-v8-1','kontur-republic-save-v8','kontur-republic-save-v7_2','kontur-republic-save-v7_1','kontur-republic-save-v7','kontur-republic-save-v6','kontur-republic-save-v5','kontur-republic-save-v4','kontur-republic-save-v3','kontur-republic-save-v2'];
  const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
  const nowOf=s=>Math.max(1,Number(s?.day)||1)*1440-1440+(Number(s?.hour)||0)*60+(Number(s?.minute)||0);
  const ensurePrograms=s=>{if(!Array.isArray(s.v12Programs))s.v12Programs=[];return s.v12Programs;};
  function addProgram(s,program){const list=ensurePrograms(s);list.push({id:`V12-${nowOf(s)}-${list.length+1}`,status:'active',startedAt:nowOf(s),...program});if(list.length>60)list.splice(0,list.length-60);return list[list.length-1];}
  function log(sim,title,body,kind='info'){
    const s=sim.state,at=nowOf(s),id=`V12-E${at}-${(s.v12EventSeq=(s.v12EventSeq||0)+1)}`;
    const row={id,at,day:s.day||1,hour:s.hour||0,title,body,kind};
    s.v9EventLog=Array.isArray(s.v9EventLog)?s.v9EventLog:[];s.v9EventLog.unshift(row);s.v9EventLog=s.v9EventLog.slice(0,80);
    s.politicalDecisionLog=Array.isArray(s.politicalDecisionLog)?s.politicalDecisionLog:[];s.politicalDecisionLog.unshift({id,at,day:s.day||1,event:'v12',title,choiceTitle:title,description:body,automatic:false});s.politicalDecisionLog=s.politicalDecisionLog.slice(0,80);
    sim.addNews?.('politics',kind==='warning'?'warning':kind==='success'?'good':'info',title,body);sim._notify?.('update');
  }
  function civicConfigs(kind){
    const configs={
      'civil-service':{kicker:'НЕПРЕРЫВНОСТЬ ГОРОДА · ТРУДОВОЙ КОНФЛИКТ',title:'Как сохранить основные городские услуги при стачке?',speaker:'Кабинет, перевозчики и профсоюзная коалиция должны учитывать и право на трудовой протест, и доступ жителей к базовым услугам.',body:'Выберите временную схему. Она не отменяет трудовых требований и должна иметь срок пересмотра.',timeout:180,defaultChoice:'minimum',choices:[['minimum','Согласовать минимальный график жизненно важных маршрутов','Профсоюзы сохраняют право на стачку, но гарантируют ограниченный график к больницам и узлам пересадки.'],['fund','Временно профинансировать перевозки и доплаты сменам','Снижает сбои быстрее, но расходует резерв казны и требует публичного аудита.'],['compel','Ввести обязательный график без соглашения профсоюзов','Сохраняет часть расписания, но повышает конфликтность и риск отказа от сверхурочных.'],['mediate','Передать вопрос трёхсторонней комиссии','Немедленного полного восстановления не обещает, зато фиксирует переговорный календарь.']]},
      'election-integrity':{kicker:'ИЗБИРАТЕЛЬНАЯ ЛЕГИТИМНОСТЬ · ПАРЛАМЕНТ',title:'Как обеспечить доверие к следующему голосованию?',speaker:'Избирательная комиссия, парламентские фракции и независимые наблюдатели.',body:'Процедура влияет на доверие к результату, скорость подготовки и возможность оспаривать нарушения. Решение не меняет состав парламента до завершения подсчёта.',timeout:180,defaultChoice:'independent',choices:[['independent','Независимый аудит реестра и подсчёта','Комиссия публикует методику, журналы исправлений и отчёт наблюдателей; подготовка требует времени.'],['cross-party','Межпартийный контроль с независимым наблюдением','Фракции проверяют процедуру совместно, а спорные участки получают внешний аудит.'],['current','Сохранить текущую процедуру без дополнительных гарантий','Быстрее и дешевле, но сомнения оппозиции и протестных групп остаются.'],['postpone','Перенести голосование ради исправления реестра','Даёт время на проверку, но требует обоснованного срока и может усилить подозрения в затягивании.']]},
      'protest-charter':{kicker:'ПУБЛИЧНЫЕ СОБРАНИЯ · ПРАВИЛА И ГАРАНТИИ',title:'Как организовать безопасный порядок публичных собраний?',speaker:'Муниципалитет, организаторы движения, полиция, медики и независимый наблюдатель.',body:'Режим должен учитывать доступ экстренных служб, право на собрание, прозрачность ограничений и ответственность за действия отдельных участников.',timeout:150,defaultChoice:'joint',choices:[['joint','Совместный протокол маршрута и экстренных коридоров','Организаторы назначают распорядителей, полиция сообщает о перекрытиях, спор решается через связных.'],['neutral','Независимый координатор маршрута и медицинский план','Посредник сверяет изменения маршрута и документирует причины каждого ограничения.'],['court','Потребовать судебного пересмотра спорных ограничений','Сохраняет правовую процедуру, но на время решения остаётся неопределённость.'],['restrict','Ввести широкие временные ограничения собраний','Даёт администрации больше контроля, но усиливает недоверие и может перевести протест в неформальные действия.']]}
    };return configs[kind]||null;
  }
  function queuePolicy(sim,kind){
    const c=civicConfigs(kind);if(!c||!sim?.state)return false;
    const d=api.queueDecision(sim,{...c,type:'v12-policy',payload:{kind,createdAt:nowOf(sim.state)},notify:true});
    api.renderDecision?.(sim);return d;
  }
  function resolveV12Decision(sim,d,choice,automatic=false){
    const s=sim.state,now=nowOf(s),kind=d.payload?.kind;s.v12LastMeaningfulResponseAt=now;d.status=automatic?'timed-out':'resolved';d.choice=choice;d.resolvedAt=now;d.automatic=!!automatic;if(s.v9CurrentDecisionId===d.id)s.v9CurrentDecisionId=null;
    const overlay=document.getElementById('v9-modal-overlay');if(overlay?.dataset.decisionId===d.id)overlay.remove();let body='',tone='info';
    if(kind==='civil-service'){
      if(choice==='minimum'){s.v12MinimumServiceUntil=now+4320;s.roadBlockage=clamp((s.roadBlockage||0)-.03,0,.98);s.trust=clamp((s.trust||50)+1.5);body='Утверждён трёхдневный минимальный график для ключевых маршрутов. Стачка остаётся законной; по окончании срока график пересматривается с профсоюзами.';tone='success';addProgram(s,{kind:'minimum-services',title:'Минимальный график городских маршрутов',deadlineAt:now+4320,details:'Срок соглашения — 72 игровых часа.'});}
      else if(choice==='fund'){s.treasury=Math.max(0,(s.treasury||0)-.025);s.serviceQuality=clamp((s.serviceQuality||50)+2);s.v12TransportSubsidyUntil=now+2880;s.roadBlockage=clamp((s.roadBlockage||0)-.06,0,.98);s.trust=clamp((s.trust||50)+1);body='Выделена временная поддержка перевозчиков и доплаты сменам. Через 48 часов казначейство проверит расходы и фактические рейсы.';tone='success';addProgram(s,{kind:'transport-subsidy',title:'Временная поддержка перевозок',deadlineAt:now+2880,details:'Нужен аудит рейсов и выплат.'});}
      else if(choice==='compel'){s.activeStrikes=(s.activeStrikes||0)+1;s.crowdAnger=clamp((s.crowdAnger||0)+18,0,1000);s.trust=clamp((s.trust||50)-3);s.v6Radicalization=clamp((s.v6Radicalization||0)+2);body='Обязательный график введён без согласия профсоюзов. Немедленная доступность маршрутов не гарантирована: вероятны отказы от сверхурочных и новая стачечная мобилизация.';tone='warning';}
      else {if(window.KonturV9?.createTrack)window.KonturV9.createTrack(sim,{party:'Профсоюзы и городские перевозчики',topic:'Минимальные услуги во время трудового конфликта',demand:'Согласовать перечень жизненно важных маршрутов, сменные доплаты, право на стачку и проверяемый трёхдневный график.',format:'mediated'});body='Открыта отдельная трёхсторонняя линия переговоров. До результата действует текущий график; правительство не объявляет конфликт урегулированным.';tone='success';}
    }else if(kind==='election-integrity'){
      s.v12ElectionOversight=s.v12ElectionOversight||{};s.v12ElectionOversight.mode=choice;s.v12ElectionOversight.startedAt=now;s.v12ElectionOversight.until=now+(choice==='independent'?10080:choice==='cross-party'?7200:choice==='postpone'?4320:1440);s.v12ElectionOversight.level=choice==='independent'?3:choice==='cross-party'?2:choice==='current'?0:1;
      if(choice==='independent'){s.trust=clamp((s.trust||50)+3);s.policies=s.policies||{};s.policies.mediaFreedom=clamp((s.policies.mediaFreedom??50)+2);body='Независимый аудит реестра и подсчёта получил семидневный мандат. Методика исправлений и журнал доступа должны стать публичными.';tone='success';}
      else if(choice==='cross-party'){s.trust=clamp((s.trust||50)+2);body='Межпартийный контроль создан. Спорные участки направляются внешним наблюдателям, а фракции получают одинаковый доступ к протоколам.';tone='success';}
      else if(choice==='current'){s.trust=clamp((s.trust||50)-2);s.crowdAnger=clamp((s.crowdAnger||0)+9,0,1000);body='Процедура сохранена без дополнительных гарантий. Сомнения не исчезают и могут вернуться при первом спорном протоколе.';tone='warning';}
      else {const c=s.v10ElectionCycle||(s.v10ElectionCycle={phase:'campaign',history:[]});c.phase='campaign';c.electionAt=Math.max(now+4320,(c.electionAt||now)+4320);s.trust=clamp((s.trust||50)+.5);s.crowdAnger=clamp((s.crowdAnger||0)+6,0,1000);body='Голосование отложено на три игровых дня для исправления реестра; срок задержки опубликован и подлежит парламентскому контролю.';tone='warning';}
      addProgram(s,{kind:'election-oversight',title:'Надзор за избирательной процедурой',deadlineAt:s.v12ElectionOversight.until,details:'Мандат контроля имеет конечный срок.'});
    }else if(kind==='protest-charter'){
      const until=now+(choice==='joint'?1440:choice==='neutral'?720:choice==='court'?2880:360);s.v12ProtestCharter=choice;s.v12ProtestCharterUntil=until;
      if(choice==='joint'){s.emergencyCorridor=true;s.v11PoliceLiaisonUntil=Math.max(s.v11PoliceLiaisonUntil||0,now+360);s.v11PoliceLiaisonMode='joint';s.v6Organization=clamp((s.v6Organization||0)+3);s.v6Radicalization=clamp((s.v6Radicalization||0)-2);s.tension=clamp((s.tension||0)-2);body='Совместный протокол принят на сутки: распорядители и полиция обмениваются изменениями маршрута, экстренный коридор проверяется каждые 30 минут.';tone='success';}
      else if(choice==='neutral'){s.emergencyCorridor=true;s.v11PoliceLiaisonUntil=Math.max(s.v11PoliceLiaisonUntil||0,now+720);s.v11PoliceLiaisonMode='mediated';s.trust=clamp((s.trust||50)+1.5);body='Независимый координатор получил полномочия фиксировать изменения маршрута и сообщать причины ограничений. Эффект действует 12 часов.';tone='success';}
      else if(choice==='court'){s.investigationOpen=true;s.v12ProtestCharter='court-pending';s.trust=clamp((s.trust||50)+.5);body='Спорные ограничения переданы на судебный пересмотр. До решения администрация обязана публиковать причины ограничений и не расширять их автоматически.';tone='info';}
      else{s.crowdAnger=clamp((s.crowdAnger||0)+24,0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+180,0,s.cityPopulation||5000);s.v6Radicalization=clamp((s.v6Radicalization||0)+4);s.trust=clamp((s.trust||50)-4);body='Введены широкие ограничения. Они создают краткосрочные административные полномочия, но увеличивают недоверие и вероятность неформальных собраний.';tone='warning';}
      addProgram(s,{kind:'protest-charter',title:'Временный протокол публичных собраний',deadlineAt:until,details:'По окончании срока требуется новое решение или возврат к обычной процедуре.'});
    }
    const selected=d.choices?.find(c=>c[0]===choice)?.[1]||choice;log(sim,d.title,`${selected}. ${body}`,tone);if(automatic)log(sim,'Автоматическое решение по истечении срока',`Для «${d.title}» автоматически применён вариант «${selected}».`, 'warning');
    api.renderDecision?.(sim);api.renderDiplomacy?.(s,true);sim._refreshDerived?.();sim._notify?.('update');renderStatus(s);setTimeout(()=>window.KonturV11.repairModal(sim),0);return true;
  }
  function installProgramForV11Decision(sim,d,choice){
    const s=sim.state,now=nowOf(s),kind=d.payload?.kind||d.type.replace(/^v11-/,'');
    if(kind==='police-review'&&choice!=='reject'){
      const duration=choice==='independent'?10080:choice==='ombudsman'?4320:2880;
      s.v11PoliceOversight=s.v11PoliceOversight||{};s.v11PoliceOversight.until=now+duration;
      addProgram(s,{kind:'police-report',title:'Промежуточный отчёт по жалобам на полицию',deadlineAt:now+duration,details:`Отчёт должен быть опубликован через ${Math.round(duration/1440)} игровых дней.`});
    }
    if(kind==='living-cost'&&['targeted','index','broad'].includes(choice)){
      const delta=choice==='targeted'?3:choice==='index'?7:10,duration=choice==='targeted'?43200:choice==='index'?129600:86400;
      addProgram(s,{kind:'living-cost',title:choice==='targeted'?'Адресная помощь домохозяйствам':choice==='index'?'Временная индексация пособий':'Компенсация тарифов',deadlineAt:now+duration,policyDelta:delta,details:`Пересмотр через ${Math.round(duration/1440)} игровых дней.`});
    }
    if(kind==='transparency'){
      if(choice==='briefing')addProgram(s,{kind:'media-briefings',title:'Ежедневные открытые брифинги',deadlineAt:now+4320,nextBriefAt:now+1440,remainingBriefs:3,details:'Три ежедневных брифинга с ответами на вопросы.'});
      if(choice==='restrict')addProgram(s,{kind:'media-restriction',title:'Ограничения публикаций и риск слухов',deadlineAt:now+2880,nextRumorAt:now+360,details:'Каждые шесть часов проверяется уровень слухов.'});
    }
    if(kind==='assembly-vote'){
      const until=now+(choice==='pause'?180:choice==='strike'?180:choice==='sit-in'?300:360);
      s.v12AssemblyMandate={choice,startedAt:now,until,nextPulseAt:now+30,status:'active',lastResponseAt:now};
      if(choice==='strike'&&s.v12SolidarityBallot){s.v12SolidarityBallot.deadlineAt=now+180;s.v12SolidarityBallot.status='open';}
      if(choice==='pause'){s.v12LastMeaningfulResponseAt=now-1;s.v12AssemblyMandate.responseAfter=now;s.v10Crowd=s.v10Crowd||{};s.v10Crowd.negotiationPauseUntil=until;}
    }
  }
  function processBallot(sim,now){
    const s=sim.state,b=s.v12SolidarityBallot;if(!b||b.status!=='open'||now<Number(b.deadlineAt))return;
    const unionStrength=clamp(s.unions?.strength??s.v10UnionStrength??45,0,100),organization=clamp(s.v6Organization??35,0,100),anger=clamp((s.crowdAnger||0)/10,0,100),fatigue=clamp(s.crowdFatigue||0,0,100),hardship=clamp(Math.max(0,(s.inflation||3)-3)*1.5+Math.max(0,(s.unemployment||6)-6),0,18);
    const support=clamp(22+unionStrength*.28+organization*.24+anger*.18+hardship-fatigue*.16,8,92);b.supportEstimate=Math.round(support);b.resolvedAt=now;
    if(support>=52){b.status='approved';b.result='Профсоюзная коалиция одобрила солидарную стачку';s.activeStrikes=(s.activeStrikes||0)+1;s.unions=s.unions||{};s.unions.active=true;s.unions.strength=clamp(unionStrength+4);s.unions.phase='солидарная стачка одобрена';s.mobilizationSurge=clamp((s.mobilizationSurge||0)+110,0,s.cityPopulation||5000);s.crowdAnger=clamp((s.crowdAnger||0)+5,0,1000);log(sim,'Профсоюзное голосование одобрило солидарную стачку',`Оценка поддержки — ${Math.round(support)}%. Забастовка активирована после голосования, а не одним решением организаторов.`,'warning');}
    else{b.status='rejected';b.result='Профсоюзная коалиция не набрала достаточной поддержки';s.crowdFatigue=clamp((s.crowdFatigue||0)-2,0,100);s.v6Radicalization=clamp((s.v6Radicalization||0)+1);log(sim,'Профсоюзное голосование не поддержало стачку',`Оценка поддержки — ${Math.round(support)}%. Часть участников предпочла сохранить переговорное давление без остановки работы.`,'info');}
  }
  function advancePrograms(sim,now){
    const s=sim.state,programs=ensurePrograms(s);let dirty=false;
    for(const p of programs){if(p.status!=='active')continue;
      if(p.kind==='media-briefings'&&now>=p.nextBriefAt&&now<p.deadlineAt&&p.remainingBriefs>0){p.nextBriefAt+=1440;p.remainingBriefs--;s.trust=clamp((s.trust||50)+.4);s.media=s.media||{};s.media.viralLevel=clamp((s.media.viralLevel||0)-2);log(sim,'Ежедневный открытый брифинг состоялся',`Представители кабинета ответили на вопросы; осталось запланированных брифингов: ${p.remainingBriefs}.`,'success');dirty=true;}
      if(p.kind==='media-restriction'&&now>=p.nextRumorAt&&now<p.deadlineAt){p.nextRumorAt+=360;s.media=s.media||{};s.media.viralLevel=clamp((s.media.viralLevel||0)+2);s.crowdAnger=clamp((s.crowdAnger||0)+2,0,1000);log(sim,'Неподтверждённые сообщения распространились на фоне ограничений',`Уровень слухов увеличился. До пересмотра ограничений осталось ${Math.max(0,p.deadlineAt-now)} игровых минут.`,'warning');dirty=true;}
      if(now<p.deadlineAt)continue;
      p.status='review-due';p.completedAt=now;
      if(p.kind==='living-cost') {s.policies=s.policies||{};s.policies.welfare=clamp((s.policies.welfare??50)-(p.policyDelta||0),0,100);s.crowdAnger=clamp((s.crowdAnger||0)+(p.policyDelta>=10?12:p.policyDelta>=7?8:5),0,1000);log(sim,`Истёк срок программы: ${p.title}`,`Временная мера закончилась. Показатель социальной поддержки скорректирован; кабинет должен продлить программу, заменить её адресной мерой или принять окончание эффекта.`,'warning');dirty=true;}
      else if(p.kind==='police-report'){s.v11PoliceOversight=s.v11PoliceOversight||{};s.v11PoliceOversight.level=0;s.v11PoliceOversight.until=now;s.v11PoliceOversight.reportPublishedAt=now;s.v11PoliceOversight.reportStatus='published';s.v11PoliceOversight.reportSummary='Промежуточный отчёт опубликован; расследование может продолжаться по отдельным эпизодам.'; s.investigationOpen=true;s.trust=clamp((s.trust||50)+1);s.crowdAnger=clamp((s.crowdAnger||0)-3,0,1000);log(sim,'Срок промежуточного отчёта по полиции наступил',`Комиссия должна опубликовать проверяемые выводы и список материалов, которые не удалось получить. Политический надзор завершил первый этап; расследование может продолжаться.`,'success');dirty=true;}
      else if(p.kind==='election-oversight'){s.v12ElectionOversight=s.v12ElectionOversight||{};s.v12ElectionOversight.level=0;log(sim,'Истёк мандат избирательного надзора',`Закончился срок: ${p.title}. Новое продление требует решения парламента или комиссии.`,'info');dirty=true;}
      else if(p.kind==='protest-charter'){if(s.v12ProtestCharterUntil<=now){s.v12ProtestCharter='expired';log(sim,'Истёк срок временного протокола публичных собраний','Дальнейшие мероприятия возвращаются к обычным правилам, пока новое соглашение не продлено.','info');dirty=true;}}
      else if(p.kind==='minimum-services'){s.v12MinimumServiceUntil=0;log(sim,'Истёк минимальный график городских маршрутов','Временное соглашение завершилось. Перевозчики и профсоюзы должны подтвердить новый график; автоматического продления нет.','warning');dirty=true;}
      else if(p.kind==='media-briefings'){log(sim,'План ежедневных брифингов завершён','Три запланированных брифинга завершены или срок программы истёк. Продление требует нового публичного решения.','info');dirty=true;}
      else if(p.kind==='media-restriction'){s.trust=clamp((s.trust||50)-1);log(sim,'Срок ограничений публикаций истёк','Ограничения больше не продлеваются автоматически. Редакциям и хранителю документов нужно подтвердить действующий режим доступа.','info');dirty=true;}
      else if(p.kind==='transport-commission'){s.v12TransportCommissionUntil=0;log(sim,'Мандат транспортной комиссии завершён','Согласованный календарь и минимальные услуги требуют нового решения. Комиссия не продлевается автоматически.','info');dirty=true;}
      else if(p.kind==='transport-subsidy'){s.v12TransportSubsidyUntil=0;log(sim,'Временная поддержка перевозок требует аудита','Кабинет должен сверить расходы с фактически выполненными рейсами. Поддержка не продлевается автоматически.','info');dirty=true;}
    }
    if(dirty)renderStatus(s);
  }
  function advanceMandate(sim,now){
    const s=sim.state,m=s.v12AssemblyMandate;if(!m||m.status!=='active')return;
    if(m.choice==='sit-in'&&now>=m.until){m.status='completed';s.v11SitInUntil=0;if(s.rally?.status==='sit-in')s.rally.status='announced';log(sim,'Сидячая акция завершена по мандату собрания','Пятиичасовой срок истёк. Распорядители освобождают проезжую часть и проверяют доступ экстренных служб.','info');}
    if(m.choice==='strike'&&now>=m.until&&s.v12SolidarityBallot?.status!=='open'){m.status='completed';}
    if(m.choice==='pause'&&now>=m.until){m.status='completed';const answered=Number(s.v12LastMeaningfulResponseAt??-1)>=m.startedAt;if(!answered){s.crowdAnger=clamp((s.crowdAnger||0)+12,0,1000);s.v6Radicalization=clamp((s.v6Radicalization||0)+2);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+45,0,s.cityPopulation||5000);log(sim,'Переговорная пауза истекла без видимого ответа','Участники сочли паузу затягиванием. Поддержка жёсткой линии растёт; вопрос возвращается в повестку.','warning');}else log(sim,'Переговорная пауза завершилась после ответа кабинета','Полученный ответ снижает риск срыва паузы, но не означает автоматического согласия движения.','success');}
    if(now>=m.nextPulseAt&&now<m.until){m.nextPulseAt=now+30;if(m.choice==='peaceful'){const stewards=Number(s.v10Crowd?.stewards||0);s.tension=clamp((s.tension||0)-(stewards>0?.45:.15),0,100);s.v6Radicalization=clamp((s.v6Radicalization||0)- (stewards>0?.18:.05));}
      else if(m.choice==='sit-in'){s.crowdFatigue=clamp((s.crowdFatigue||0)+.45,0,100);if(!s.emergencyCorridor)s.tension=clamp((s.tension||0)+.2,0,100);}
    }
  }
  function processElectionOversight(sim,now){
    const s=sim.state,o=s.v12ElectionOversight,p=s.v10Parliament;if(!o||Number(o.until||0)<=now||Number(o.level||0)<=0||!p?.lastElection||Number(p.lastElection.at)!==now||p.lastElection.v12AuditedAt===now)return;
    p.lastElection.v12AuditedAt=now;p.lastElection.auditMode=o.mode;p.lastElection.auditLevel=o.level;
    p.lastElection.turnout=clamp((p.lastElection.turnout||50)+(o.level>=3?3:o.level>=2?2:1),25,95);
    s.trust=clamp((s.trust||50)+(o.level>=3?2.5:o.level>=2?1.5:.5));s.crowdAnger=clamp((s.crowdAnger||0)-(o.level>=3?8:o.level>=2?4:0),0,1000);
    log(sim,'Проверка избирательной процедуры завершена',`Результат опубликован с уровнем контроля ${o.level}/3. Модельная явка скорректирована после аудита, журнал протоколов сохранён.`,'success');
  }
  function advanceTimedSystems(sim){
    const s=sim.state;if(!s)return;const now=nowOf(s);if(s.paused||now===s.v12LastAdvancedAt)return;s.v12LastAdvancedAt=now;
    processBallot(sim,now);advancePrograms(sim,now);advanceMandate(sim,now);processElectionOversight(sim,now);
    if(s.v12ElectionOversight&&s.v12ElectionOversight.until<=now)s.v12ElectionOversight.level=0;
    if(s.v12ProtestCharterUntil&&s.v12ProtestCharterUntil<=now&&s.v12ProtestCharter!=='expired')s.v12ProtestCharter='expired';
  }
  function renderStatus(s){
    const el=document.getElementById('v11-policy-status');if(!el)return;
    const now=nowOf(s),bits=[];
    if((s.v11PoliceOversight?.until||0)>now)bits.push(`Надзор полиции: ещё ${Math.ceil((s.v11PoliceOversight.until-now)/60)} ч`);
    if((s.v11PoliceLiaisonUntil||0)>now)bits.push(`Связь с организаторами: ещё ${Math.ceil((s.v11PoliceLiaisonUntil-now)/60)} ч`);
    if((s.v11SupportUntil||0)>now)bits.push(`Медико-правовая поддержка: ещё ${Math.ceil((s.v11SupportUntil-now)/60)} ч`);
    if((s.v12TransportCommissionUntil||0)>now)bits.push(`Транспортная комиссия: ещё ${Math.ceil((s.v12TransportCommissionUntil-now)/60)} ч`);
    if((s.v12TransportSubsidyUntil||0)>now)bits.push(`Поддержка перевозок: ещё ${Math.ceil((s.v12TransportSubsidyUntil-now)/60)} ч`);
    if((s.v12MinimumServiceUntil||0)>now)bits.push(`Минимальный график услуг: ещё ${Math.ceil((s.v12MinimumServiceUntil-now)/60)} ч`);
    if((s.v11SitInUntil||0)>now)bits.push(`Сидячая акция: ещё ${Math.ceil((s.v11SitInUntil-now)/60)} ч`);
    if(s.v12SolidarityBallot?.status==='open')bits.push(`Голосование профсоюзов: осталось ${Math.ceil((s.v12SolidarityBallot.deadlineAt-now)/60)} ч`);
    const active=ensurePrograms(s).filter(p=>p.status==='active');if(active.length)bits.push(`Программы с контрольным сроком: ${active.length}`);
    el.textContent=bits.join(' · ')||'Нет временных мер с активным сроком. Все программы и общественные решения имеют конечный срок и записанный результат.';
    const p=document.getElementById('v12-civic-status');if(p){const list=active.slice(0,4).map(x=>`${x.title} — ${Math.max(0,Math.ceil((x.deadlineAt-now)/60))} ч`);p.textContent=list.length?`Контрольные сроки: ${list.join(' · ')}`:'Нет активных программ с контрольным сроком.';}
  }
  function ensureActions(){
    window.KonturV11.ensureCivicPanel?.();const root=document.querySelector('#v11-policy-actions .v11-policy-buttons');if(!root)return;
    const items=[['civil-service','Сохранить городские услуги при стачке'],['election-integrity','Усилить гарантии честности выборов'],['protest-charter','Согласовать правила публичных собраний']];
    for(const [kind,label] of items){if(root.querySelector(`[data-v12-action="${kind}"]`))continue;const b=document.createElement('button');b.type='button';b.dataset.v12Action=kind;b.textContent=label;root.appendChild(b);}
    let status=document.getElementById('v12-civic-status');if(!status){status=document.createElement('p');status.id='v12-civic-status';status.className='v12-civic-status';root.parentElement?.appendChild(status);}renderStatus(window.gameSimulation?.state||{});
  }
  api.resolveDecision=function(sim,id,choice,automatic=false){
    const d=sim?.state?.v9Decisions?.find(x=>x.id===id&&['queued','pending'].includes(x.status));
    if(d?.type==='v12-policy')return resolveV12Decision(sim,d,choice,automatic);
    const result=oldResolve.call(api,sim,id,choice,automatic);
    if(d&&sim?.state){const s=sim.state,now=nowOf(s);if(d.type==='agenda'||d.type==='politics'||(d.type?.startsWith('v11-')&&d.payload?.kind!=='assembly-vote'))s.v12LastMeaningfulResponseAt=now;if(d.type?.startsWith('v11-'))installProgramForV11Decision(sim,d,choice);
      if(d.type==='politics'&&d.payload?.eventKey==='transport'&&choice==='tripartite')addProgram(s,{kind:'transport-commission',title:'Трёхсторонняя транспортная комиссия',deadlineAt:s.v12TransportCommissionUntil||now+4320,details:'Комиссия согласует минимальный график и порядок урегулирования стачки.'});
      if(d.type==='politics'&&d.payload?.eventKey==='transport'&&choice==='subsidy')addProgram(s,{kind:'transport-subsidy',title:'Временная поддержка перевозок',deadlineAt:s.v12TransportSubsidyUntil||now+2880,details:'Нужен аудит фактически выполненных рейсов и выплат.'});
      renderStatus(s);}
    return result;
  };
  SP.tick=function(...args){const r=oldTick.apply(this,args);advanceTimedSystems(this);renderStatus(this.state);return r;};
  if(typeof oldUpdate==='function')UP.updateStats=function(...args){const r=oldUpdate.apply(this,args);const foot=document.querySelector('.app-footer span');if(foot)foot.textContent='КОНТУР // ВЕРСИЯ 12.0.0';ensureActions();renderStatus(this.sim?.state||{});return r;};
  UP.saveGame=function(automatic=false){
    try{localStorage.setItem(KEY,JSON.stringify(this.sim.snapshot()));this._lastSaveAt=new Date();const label=document.getElementById('last-save-label');if(label)label.textContent=`СОХРАНЕНО ${this._lastSaveAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;if(!automatic)this.toast('Игра сохранена','Состояние v12 записано в основной слот. Старые сохранения сохранены отдельно.','success');return true;}
    catch(err){if(!automatic)this.toast('Не удалось сохранить',`Браузер не разрешил запись в localStorage: ${err.message}`,'error');return false;}
  };
  UP.loadGame=function(){
    try{let raw=localStorage.getItem(KEY),source=KEY;if(!raw){for(const key of LEGACY_KEYS){const candidate=localStorage.getItem(key);if(candidate){raw=candidate;source=key;break;}}}if(!raw){this.toast('Сохранение не найдено','Нет сохранений v12 или совместимых старых версий.','warning');return false;}
      const parsed=JSON.parse(raw);if(!parsed||!parsed.state)throw new Error('В файле отсутствует состояние симуляции.');this.sim.loadSnapshot(parsed);this.sim.state=this.sim.state||parsed.state;window.KonturV10.ensureState(this.sim.state);window.KonturV10.syncTracks(this.sim.state);window.KonturV10.archiveClosed(this.sim.state);this.draft={...(this.sim.state.policies||{})};this._syncPolicyInputs?.();this.renderAll?.(true);window.KonturV11.repairModal(this.sim);renderStatus(this.sim.state);if(source!==KEY)localStorage.setItem(KEY,JSON.stringify(this.sim.snapshot()));const label=document.getElementById('last-save-label');if(label)label.textContent=source===KEY?'ЗАГРУЖЕНО ИЗ v12':`ИМПОРТИРОВАНО ИЗ ${source.replace('kontur-republic-save-','v')}`;this.toast('Сохранение загружено',source===KEY?'Состояние v12 восстановлено.':'Старое сохранение импортировано; исходный слот оставлен без изменений.','success');return true;
    }catch(err){this.toast('Ошибка загрузки',`Сохранение не удалось прочитать: ${err.message}`,'error');return false;}
  };
  function boot(){ensureActions();if(window.gameSimulation?.state)renderStatus(window.gameSimulation.state);}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v12-action]');if(!b)return;const sim=window.gameSimulation;if(!sim?.state)return;e.preventDefault();e.stopPropagation();queuePolicy(sim,b.dataset.v12Action);},true);
  if(window.GAME_CONFIG)window.GAME_CONFIG.version='12.0.0';
  window.KonturV12={version:'12.0.0',queuePolicy,resolveV12Decision,advanceTimedSystems,advancePrograms,advanceMandate,processBallot,processElectionOversight,renderStatus,ensureActions};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
