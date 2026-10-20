'use strict';
/* KONTUR v8.0 — continuous minute-level crisis, lawful pre-mobilization, independent unions, media shocks, dual power and service logistics. */
(function installKonturV8(){
  const Sim=window.RepublicSimulation, Scene=window.RepublicCityScene, UI=window.RepublicDashboardUI;
  if(!Sim||!Scene||!UI)return;
  const SP=Sim.prototype, P=Scene.prototype, UP=UI.prototype;
  const prevTick=SP.tick, prevHourly=SP._hourlyStep, prevReset=SP.reset, prevSave=UP.saveGame, prevLoad=UP.loadGame, prevStats=UP.updateStats;
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  if(window.GAME_CONFIG) window.GAME_CONFIG.version='8.0.1';
  const fireTypes=['fire','arson','building_fire','roof_fire','camp_fire','vehicle_fire'];
  const defaults=()=>({
    v8Initialized:true, rally:{status:'none',noticeAt:null,plannedAt:null,route:'центральный проспект',permit:'не подано',attendance:0},
    unions:{active:false,phase:'нет забастовки',strength:0,demands:['индексация зарплат','гарантии пенсий','сохранение рабочих мест'],leverage:0,blockade:0},
    media:{viralLevel:0,lastViralAt:-999,stories:[],policeVideo:false},
    negotiationProcess:{active:false,elapsed:0,duration:360,round:0,side:'профсоюзная коалиция',status:'не начаты',offer:'',deadline:null},
    dualPower:{active:false,committeeCount:0,control:0,ultimatumDeadline:null,administrationParalyzed:0,choice:null},
    policeProtest:{active:false,phase:'служба сохраняет строй',morale:72,publicCriticism:0,lastActionAt:-999},
    fireLogistics:{foam:100,ladders:100,waterTenders:100,engines:100,ambulances:100,policeVans:100,buses:100,patrolCars:100,fireCrews:100,foamTeams:100,ladderTrucks:100,used:{},lastDispatch:null},
    tacticalBrief:'Командование наблюдает за площадью; задачи пересматриваются по событиям.', tacticalUpdatedAt:0,
    v8Minute:0, v8LastMediaShockAt:-999, v8LastObjectiveAt:-999, v8LastRallyReviewAt:-999
  });
  function init(s,hard=false){
    if(!s.v8Initialized||hard){Object.assign(s,defaults());}
    s.fireLogistics=Object.assign(defaults().fireLogistics,s.fireLogistics||{});
    s.fireLogistics.used=Object.assign({},s.fireLogistics.used||{});
    s.rally=Object.assign(defaults().rally,s.rally||{});s.unions=Object.assign(defaults().unions,s.unions||{});
    s.media=Object.assign(defaults().media,s.media||{});s.negotiationProcess=Object.assign(defaults().negotiationProcess,s.negotiationProcess||{});
    s.dualPower=Object.assign(defaults().dualPower,s.dualPower||{});s.policeProtest=Object.assign(defaults().policeProtest,s.policeProtest||{});
  }
  SP.reset=function(...a){const r=prevReset.apply(this,a);init(this.state,true);return r;};
  SP.tick=function(speed=1){
    const s=this.state;init(s,false);const before=s.hoursElapsed||0;const r=prevTick.call(this,speed);if(s.paused)return r;
    // The simulation's base tick is one in-game minute. Crisis decisions below run every minute, not only on hour boundaries.
    s.v8Minute=(s.v8Minute||0)+Math.max(1,Number(speed)||1);
    minuteStep(this,Math.max(1,Number(speed)||1));
    if((s.hoursElapsed||0)!==before) refreshBrief(this);
    renderPanel(s);
    return r;
  };
  function addNews(sim,cat,level,title,body){try{sim.addNews(cat,level,title,body);}catch(_){}}
  function radio(sim,channel,speaker,msg,tone='info',source='government'){try{sim._radio(channel,speaker,msg,tone,source);}catch(_){}}
  function publish(sim,category,code,title,body,opts={}){try{sim._publishCrisisEvent(category,code,title,body,opts);}catch(_){addNews(sim,category,opts.tone||'warning',title,body);}}
  function minuteStep(sim,speed){
    const s=sim.state, now=(s.day||1)*1440+(s.hour||0)*60+(s.minute||0); s.v8Minute=now;
    // Media shock is fast: a verified viral clip has same-evening effects, not a slow background drift.
    if(s.media.policeVideo && now-(s.media.lastViralAt||-999)>45){s.media.lastViralAt=now;s.media.viralLevel=clamp(s.media.viralLevel+28,0,100);s.crowdAnger=clamp((s.crowdAnger||0)+75,0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+18,0,100);s.v8LastMediaShockAt=now;
      publish(sim,'protest','viral-police-video','Видео применения силы стремительно распространяется','Кадры попали в национальные ленты; студенческие сети и профсоюзы объявляют вечерние собрания. Эффект мобилизации проявляется в течение ближайших часов.',{severity:1.35,channel:'Медиа',speaker:'Редактор новостной ленты',tone:'critical'});
      s.media.policeVideo=false;
    }
    s.media.viralLevel=Math.max(0,(s.media.viralLevel||0)-0.08*speed);
    // Rally moves through advance notice -> permit decision -> march -> plaza; not every crisis starts as a square clash.
    const rally=s.rally;
    if(rally.status==='announced' && rally.plannedAt!=null && now>=rally.plannedAt){rally.status='assembling';rally.attendance=Math.max(12,Math.round((s.crowdTarget||38)*.35));s.crowdAnger=clamp((s.crowdAnger||0)+2,0,1000);addNews(sim,'city','info','Начинается заранее объявленный марш',`Участники собираются по согласованному маршруту: ${rally.route}. Представители наблюдателей и медиа присутствуют на месте.`,'');radio(sim,'Диспетчерская','Координатор маршрута','Началось формирование колонны; движение перенаправляется заранее, службы получают уведомление.','info','government');}
    if(rally.status==='assembling'){rally.attendance=Math.min(Math.max(80,Math.round((s.crowdTarget||38)+8)),(rally.attendance||0)+Math.max(1,Math.round(2*speed)));if(s.crowdTarget<rally.attendance)s.crowdTarget=Math.min(rally.attendance,s.crowdTarget+Math.max(1,Math.round(speed*2)));if(now-(rally.plannedAt||now)>180)rally.status='marching';}
    if(rally.status==='marching' && (s.tension||0)>52){rally.status='disrupted';publish(sim,'protest','march-disrupted','Марш нарушен напряжённостью на маршруте','Координаторы пытаются восстановить колонну и удержать участников вместе; полиция и городские службы пересматривают коридоры движения.',{severity:1.0,channel:'Диспетчерская',speaker:'Координатор маршрута',tone:'warning'});}
    // Unions are an independent actor: strikes and infrastructure pressure develop over several hours.
    if(s.unions.active){const u=s.unions;u.strength=clamp(u.strength+0.012*speed,0,100);u.leverage=clamp(u.leverage+(u.blockade?0.06:0.018)*speed,0,100);u.blockade=clamp(u.blockade+0.004*speed,0,0.7);s.roadBlockage=clamp((s.roadBlockage||0)+0.0015*speed*u.strength/100,0,0.96);s.strikeIntensity=clamp((s.strikeIntensity||0)+0.012*speed,0,100);
      if(!u.announced){u.announced=true;addNews(sim,'politics','warning','Профсоюзная коалиция объявила бессрочную забастовку',`Коалиция требует: ${u.demands.join(', ')}. Переговорная сила растёт по мере присоединения предприятий и транспортных узлов.`);radio(sim,'Профсоюзы','Координационный совет','Забастовка объявлена; требования направлены правительству, дальнейшие действия будут зависеть от ответа.','warning','protest');}
    }
    // Negotiations take time and can fail, pause, or produce a signed commitment.
    const n=s.negotiationProcess;if(n.active){n.elapsed+=speed;n.status='переговоры идут';if(n.elapsed>=n.duration){n.active=false;n.status='раунд завершён';n.round=(n.round||0)+1;const acceptable=(s.publicApproval||50)>35 && (s.crowdAnger||0)<720 && n.offer!=='отказ';if(acceptable){s.crowdAnger=clamp((s.crowdAnger||0)-35,0,1000);s.tension=clamp((s.tension||0)-5);s.mobilizationSurge=Math.max(0,(s.mobilizationSurge||0)-8);addNews(sim,'politics','info','Завершён раунд переговоров',`Делегации согласовали рамочный протокол: ${n.offer||'продолжить переговоры и опубликовать график решений'}. Следующий раунд назначен на более позднее время.`);radio(sim,'Правительственный','Секретарь переговоров','Раунд завершён. Подписанный протокол и сроки исполнения внесены в реестр обязательств.','info','government');}else{ s.crowdAnger=clamp((s.crowdAnger||0)+18,0,1000);addNews(sim,'politics','warning','Переговорный раунд завершился без соглашения','Представители сторон не смогли согласовать гарантии и сроки; профсоюзы обсуждают продление акции.');}n.offer='';}}
    // Police can also become a labour actor, refuse orders, or publicly criticize leadership.
    const pp=s.policeProtest;if((s.policeFatigue||0)>78 || (s.policeMorale||72)<24){pp.publicCriticism=clamp(pp.publicCriticism+0.035*speed,0,100);if(!pp.active && pp.publicCriticism>18){pp.active=true;pp.phase='коллективное заявление';s.policeMorale=clamp((s.policeMorale||50)-4);publish(sim,'politics','police-labour-action','Полицейские требуют гарантий и пересмотра смен','Представители сотрудников публично критикуют управление сменами и требуют отдыха, правовой защиты и прозрачных правил применения силы.',{severity:1.0,channel:'Полиция',speaker:'Представитель сотрудников',tone:'warning'});}if(pp.active&&pp.publicCriticism>45){pp.phase='частичный отказ от сверхурочных';s.policePresence=Math.max(5,(s.policePresence||35)-0.02*speed);}}
    // Crowd self-governance: stewards separate opportunists, aid casualties, and form safe lanes.
    if((s.crowdTarget||0)>120){s.crowdStewards=clamp((s.crowdStewards||0)+0.01*speed,0,100);s.crowdAidCapacity=clamp((s.crowdAidCapacity||10)+0.02*speed,0,100);if((s.crowdTarget||0)>350&&(s.crowdStewards||0)>8)s.emergencyCorridor=true;}
    // A death has an immediate, discrete political shock; not just a small gradual modifier.
    if((s.deaths||0)>(s.v8DeathsSeen||0)){const count=(s.deaths||0)-(s.v8DeathsSeen||0);s.v8DeathsSeen=s.deaths;s.crowdAnger=clamp((s.crowdAnger||0)+Math.min(260,165*count),0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+Math.min(55,28*count),0,100);s.publicApproval=clamp((s.publicApproval||50)-Math.min(18,12*count),0,100);publish(sim,'politics','fatality-mobilization-shock','Гибель участника резко меняет динамику кризиса','Независимые редакции и профсоюзы требуют расследования; мобилизация усиливается в тот же вечер, а доверие к властям резко падает.',{severity:2.0,channel:'Медиа',speaker:'Национальная редакция',tone:'critical'});}
    // Occupation opens a continuing dual-power phase, not a game-over screen.
    if(s.building?.occupation && !s.dualPower.active){s.dualPower.active=true;s.dualPower.committeeCount=1;s.dualPower.control=20;s.dualPower.ultimatumDeadline=now+360;s.dualPower.administrationParalyzed=25;s.dualPower.choice=null;publish(sim,'politics','dual-power-begins','После занятия здания возникли конкурирующие центры власти','Комитет площади объявил временный совет и предъявил ультиматум. Правительство может вести переговоры, легализовать временный совет или готовить правовое восстановление контроля; администрация продолжает работу частично.',{severity:1.8,channel:'Правительственный',speaker:'Секретариат правительства',tone:'critical'});}
    if(s.dualPower.active){s.dualPower.control=clamp(s.dualPower.control+((s.crowdTarget||0)>500?0.035:-0.015)*speed,0,100);s.dualPower.administrationParalyzed=clamp(s.dualPower.administrationParalyzed+((s.crowdTarget||0)>700?0.025:-0.02)*speed,0,100);if(s.dualPower.ultimatumDeadline&&now>s.dualPower.ultimatumDeadline&&!s.dualPower.choice){s.crowdAnger=clamp((s.crowdAnger||0)+25,0,1000);addNews(sim,'politics','critical','Истёк ультиматум временного совета','Комитет объявил, что дальнейшие шаги будут зависеть от ответа правительства; кризис перешёл в затяжную фазу двоевластия.');s.dualPower.ultimatumDeadline=now+360;}}
    // Fires persist until the incident and fire zone are actually controlled; method effectiveness differs by fuel and height.
    serviceFireModel(sim,s,speed);
    // Re-evaluate police tactics on every simulated minute; strategic policy can still use hourly turns.
    if(s.tacticalUpdatedAt===undefined||now-(s.tacticalUpdatedAt||0)>=3||hasFlashpoint(s)){
      try{sim._updatePoliceDoctrine?.(true);}catch(_){}
      // Tactical decisions are event-driven and minute-scale; fatigue/shift accounting remains hourly.
      if(hasFlashpoint(s)&&now-(s.v8LastTacticalOrderAt||-999)>=6){
        const code=s.doctrineCode; let method=null;
        if(code==='withdraw') method='retreat'; else if(code==='protect') method='cordon';
        else if(code==='disperse') method=(s.crowdAnger||0)>850?'physical':'gas';
        else if(code==='contain') method=(s.crowdAnger||0)>760?'arrest':'cordon';
        else if((s.crowdTarget||0)>200) method='talk';
        if(method&&sim.commandPolice){try{sim.commandPolice(method,true);s.v8LastTacticalOrderAt=now;}catch(_){}}
      }
      refreshBrief(sim);s.tacticalUpdatedAt=now;
    }
    if(s.media.policeVideo) s.media.lastViralAt=now;
  }
  function hasFlashpoint(s){return (s.incidents||[]).some(i=>i.status!=='resolved'&&['riot','clash','fire','arson','building_assault','blockade','medical'].includes(i.type));}
  function refreshBrief(sim){const s=sim.state;const inc=(s.incidents||[]).filter(i=>i.status!=='resolved');const fire=(s.fireZones||[]).filter(z=>z.condition!=='Потушено');let text='Командование наблюдает за площадью; задачи пересматриваются по событиям.';if(s.building?.occupation)text='Полиция: обеспечить безопасный периметр и доступ служб. Цель движения: удержать временный совет и добиться признания полномочий.';else if(fire.length)text=`Полиция: сохранить коридоры пожарным и медикам, изолировать опасный сектор. Цель движения: ${s.crowdObjective||s.movementGoal?.title||'добиться ответа правительства'}.`;else if(inc.some(i=>i.type==='building_assault'))text=`Полиция: защита входов и эвакуационных коридоров; командир пересматривает задачу каждую минуту. Цель протестующих: ${s.crowdObjective||s.movementGoal?.title||'получить политические уступки'}.`;else if((s.crowdAnger||0)>650)text=`Полиция: эшелонированное сдерживание и сохранение медицинского коридора. Цель протестующих: ${s.crowdObjective||s.movementGoal?.title||'добиться уступок правительства'}.`;else if((s.crowdTarget||0)>180)text=`Полиция: сопровождение колонны и разведение потоков. Цель протестующих: ${s.crowdObjective||s.movementGoal?.title||'добиться публичных слушаний'}.`;if(!text.includes('Цель')) text += ` Цель протестующих: ${s.crowdObjective||s.movementGoal?.title||'добиться ответа правительства'}.`;s.tacticalBrief=text;const el=document.getElementById('tactical-brief');if(el)el.textContent=text;}
  function serviceFireModel(sim,s,speed){
    const l=s.fireLogistics;if(!l)return;
    s.fireZones=s.fireZones||[];
    // Smoke continues to rise for a short period after the flame front has been contained.
    for(const z of s.fireZones){if(z.condition==='Потушено')z.smokeLife=Math.max(0,(Number(z.smokeLife)||0)-speed);}
    for(const inc of (s.incidents||[])){
      if(inc.status==='resolved'||!fireTypes.includes(inc.type))continue;
      inc.v8FireAge=(inc.v8FireAge||0)+speed;
      const roof=inc.type==='roof_fire'||inc.locationType==='крыша'||inc.target==='крыша';
      const fuel=inc.fuelType||(/шин|резин/.test(inc.label||'')?'rubber':roof?'structure':'mixed');
      let reduction=0;
      if(inc.fireServiceActive){
        if(roof){if((inc.fireMethod||'water')==='ladder'&&l.ladders>0){reduction=.10*speed;inc.fireHeightAccess=true;}else reduction=.002*speed;}
        else if(fuel==='rubber'){if((inc.fireMethod||'water')==='foam'&&l.foam>0)reduction=.14*speed;else reduction=.006*speed;}
        else reduction=(inc.fireMethod||'water')==='foam'?.08*speed:.035*speed;
      }
      inc.fireIntensity=clamp((inc.fireIntensity??0.6)-reduction,0,1.5);
      let zone=s.fireZones.find(z=>z.id===inc.id);
      if(!zone){zone={id:inc.id,x:inc.x||640,y:inc.y||420,area:inc.fireArea||8,radius:inc.fireRadius||22,smokeRadius:Math.max(56,inc.smokeRadius||50),intensity:inc.fireIntensity,windDrift:inc.windDrift||0,source:inc.type,condition:'Горит',smokeLife:0,at:inc.createdAt||s.hoursElapsed||0};s.fireZones.unshift(zone);}
      zone.x=inc.x??zone.x;zone.y=inc.y??zone.y;zone.intensity=inc.fireIntensity;
      zone.radius=clamp((zone.radius||inc.fireRadius||22)+(inc.fireIntensity>.65?.05:-.08)*speed,12,130);
      zone.smokeRadius=clamp((zone.smokeRadius||inc.smokeRadius||56)+(fuel==='rubber'?.12:.05)*speed,36,240);
      if(inc.fireIntensity<=.03&&inc.fireServiceActive){
        inc.status='resolved';inc.resolution='потушен подходящим расчётом';zone.condition='Потушено';zone.smokeLife=Math.max(Number(zone.smokeLife)||0,20);
        l.lastDispatch=`${fuel==='rubber'?'пена':roof?'автолестница':'расчёт'}: пожар локализован`;
        radio(sim,'Пожарные','Руководитель тушения',`Очаг ${inc.id} локализован. Проверяется повторное возгорание.`,'info','fire');
      }
    }
    s.fireZones=s.fireZones.filter(z=>z.condition!=='Потушено'||(Number(z.smokeLife)||0)>0);
  }
  const dispatchPlans={
    'dispatch-water':{resources:['waterTenders','engines'],label:'вода',service:'fire',method:'water'},
    'dispatch-foam':{resources:['foamTeams','foam','engines'],label:'пена',service:'fire',method:'foam'},
    'dispatch-ladder':{resources:['ladderTrucks','ladders','engines'],label:'автолестница',service:'fire',method:'ladder'},
    'dispatch-ambulance':{resources:['ambulances'],label:'скорая',service:'ambulance'},
    'dispatch-bus':{resources:['buses'],label:'автобус эвакуации',service:'bus'}
  };
  function dispatchResource(sim,scene,action){
    const plan=dispatchPlans[action];
    if(!plan)return {ok:false,message:'Неизвестная команда диспетчерской.'};
    const s=sim.state;init(s,false);const l=s.fireLogistics;
    if(!scene||typeof scene._dispatchVehicle!=='function'||!Array.isArray(scene.vehicles))
      return {ok:false,message:'Экран площади ещё загружается: ресурс не списан.'};
    const shortages=plan.resources.filter(k=>(Number(l[k])||0)<=0);
    if(shortages.length)return {ok:false,message:`Резерв исчерпан: ${shortages.map(k=>k==='engines'?'пожарные машины':k==='waterTenders'?'цистерны с водой':k==='foamTeams'?'пенные расчёты':k==='foam'?'пенообразователь':k==='ladders'?'лестницы':k==='ladderTrucks'?'автолестницы':k==='ambulances'?'скорые':'автобусы').join(', ')}.`};
    const activeFire=(s.incidents||[]).filter(i=>i.status!=='resolved'&&fireTypes.includes(i.type));
    const incident=plan.service==='fire'?(plan.method==='ladder'?(activeFire.find(i=>i.type==='roof_fire'||i.locationType==='крыша'||i.target==='крыша')||activeFire[0]):activeFire.sort((a,b)=>(Number(b.fireIntensity)||0)-(Number(a.fireIntensity)||0))[0]):(s.incidents||[]).find(i=>i.status!=='resolved'&&i.type==='medical');
    const targetX=Number.isFinite(Number(incident?.x))?Number(incident.x):(plan.service==='bus'?640:640);
    const targetY=Number.isFinite(Number(incident?.y))?Number(incident.y):(plan.service==='bus'?555:420);
    s.vehicleSequence=(Number(s.vehicleSequence)||0)+1;
    const id=s.vehicleSequence;
    try{
      scene._dispatchVehicle({id,service:plan.service,x:targetX,y:targetY,incidentId:incident?.id||null,purpose:plan.label,external:false,v8Manual:true});
    }catch(err){return {ok:false,message:`Не удалось отправить технику: ${err?.message||'ошибка сцены'}. Резерв не списан.`};}
    const v=scene.vehicles.find(unit=>unit.id===id)||scene.vehicles[scene.vehicles.length-1];
    if(!v)return {ok:false,message:'Машина не появилась на карте; резерв не списан.'};
    for(const key of plan.resources)l[key]=Math.max(0,(Number(l[key])||0)-1);
    l.lastDispatch=plan.label;l.lastDispatchIncident=incident?.id||null;
    v.v8Equipment=plan.label;v.v8ReserveKey=plan.resources[0];v.v8IncidentId=incident?.id||null;
    if(plan.service==='fire'&&incident){
      incident.fireServiceEnRoute=true;incident.fireServiceActive=false;incident.fireMethod=plan.method;
      incident.fuelType=incident.fuelType||(/шин|резин/.test(incident.label||'')?'rubber':(incident.type==='roof_fire'||incident.locationType==='крыша'||incident.target==='крыша')?'structure':'mixed');
      incident.dispatchedServices=incident.dispatchedServices||{};incident.dispatchedServices.fire=true;
      if(plan.method==='ladder')incident.fireHeightAccess=true;
    }
    if(plan.service==='ambulance'&&incident){incident.dispatchedServices=incident.dispatchedServices||{};incident.dispatchedServices.ambulance=true;}
    const destination=incident?`к очагу ${incident.id}`:(plan.service==='bus'?'на эвакуационный маршрут':'на площадь, к дежурной точке');
    return {ok:true,message:`Выезд №${id}: ${plan.label} направлен ${destination}. Машина видна на дороге; запас уменьшен на 1 по задействованным ресурсам.`,vehicle:v,incidentId:incident?.id||null};
  }
  function ensurePanel(){if(document.getElementById('v8-systems-panel'))return;const anchor=document.querySelector('.world-panel')||document.querySelector('.response-panel');if(!anchor)return;const el=document.createElement('section');el.className='panel v8-systems-panel';el.id='v8-systems-panel';el.innerHTML=`<div class="panel-heading"><div><span class="section-index">03Б / ПРОЦЕССЫ И ЛОГИСТИКА</span><h2>Политический календарь и службы</h2></div><span class="data-chip">МИНУТНАЯ МОДЕЛЬ</span></div><div class="v8-grid"><div><h3>До выхода на улицу</h3><label>Время марша <input id="v8-rally-delay" type="number" min="30" max="1440" value="180" step="30"> мин от сейчас</label><label>Маршрут <select id="v8-rally-route"><option>центральный проспект</option><option>площадь и парламентский квартал</option><option>вокзал и транспортный узел</option><option>промышленный район</option></select></label><div class="v8-actions"><button data-v8="rally">Разрешить марш</button><button data-v8="ban">Запретить / изменить маршрут</button><button data-v8="strike">Включить профсоюзную забастовку</button></div></div><div><h3>Медиа и переговоры</h3><div class="v8-actions"><button data-v8="viral">Вирусное видео насилия</button><button data-v8="talks">Начать переговоры (4–8 ч)</button><button data-v8="offer">Предложить компромисс</button><button data-v8="reject">Отклонить требования</button><button data-v8="police-protest">Публичная критика полиции</button></div><p id="v8-negotiation-status" class="v8-muted">Переговоры не начаты.</p></div><div><h3>После занятия здания</h3><div class="v8-actions"><button data-v8="dual-talk">Переговоры с временным советом</button><button data-v8="dual-legal">Легализовать временный совет</button><button data-v8="dual-restore">Правовое восстановление контроля</button></div><p id="v8-dual-status" class="v8-muted">Двоевластие не возникло.</p></div><div><h3>Резерв техники и средств</h3><div id="v8-logistics" class="v8-logistics"></div><div class="v8-actions"><button data-v8="dispatch-water">Пожарная машина: вода</button><button data-v8="dispatch-foam">Пожарная машина: пена</button><button data-v8="dispatch-ladder">Автолестница</button><button data-v8="dispatch-ambulance">Скорая</button><button data-v8="dispatch-bus">Автобус эвакуации</button></div><p id="v8-dispatch-status" class="v8-muted" aria-live="polite">Все службы готовы. Выберите тип выезда.</p><p class="v8-muted">100 единиц каждого типа в резерве на начало кампании.</p></div></div>`;anchor.insertAdjacentElement('afterend',el);document.addEventListener('click',e=>{const b=e.target.closest('[data-v8]');if(!b)return;const sim=window.gameSimulation;if(!sim)return;const s=sim.state;init(s,false);const action=b.dataset.v8;const now=(s.day||1)*1440+(s.hour||0)*60+(s.minute||0);if(action==='rally'){const delay=clamp(document.getElementById('v8-rally-delay').value,30,1440);s.rally={...s.rally,status:'announced',noticeAt:now,plannedAt:now+delay,route:document.getElementById('v8-rally-route').value,permit:'разрешён',attendance:0};addNews(sim,'politics','info','Марш зарегистрирован заранее',`Марш запланирован через ${delay} минут по маршруту «${s.rally.route}». Муниципалитет координирует перекрытия и аварийные коридоры.`);sim._notify('v8');}
else if(action==='ban'){s.rally.permit='запрещён или перенаправлен';s.rally.status='disputed';s.crowdAnger=clamp((s.crowdAnger||0)+16,0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+4,0,100);addNews(sim,'politics','warning','Марш запрещён или перенаправлен префектурой','Организаторы обжалуют решение; часть групп соглашается на новый маршрут, другие объявляют спонтанное собрание.');}
else if(action==='strike'){s.unions.active=true;s.unions.strength=Math.max(10,s.unions.strength||0);s.unions.blockade=0.1;s.strikeIntensity=clamp((s.strikeIntensity||0)+10,0,100);}
else if(action==='viral'){s.media.policeVideo=true;s.media.viralLevel=100;s.media.lastViralAt=-999;}
else if(action==='talks'){s.negotiationProcess={...s.negotiationProcess,active:true,elapsed:0,duration:360+Math.random()*240,round:(s.negotiationProcess.round||0)+1,status:'делегации прибывают',side:s.unions.active?'профсоюзная коалиция':'представители площади',offer:'',deadline:now+720};radio(sim,'Правительственный','Секретарь кабинета','Начат переговорный процесс. Делегации, эксперты и представители посредника должны согласовать протокол и график решений.','info','government');}
else if(action==='offer'){if(s.negotiationProcess.active){s.negotiationProcess.offer='компромисс с публичным графиком исполнения';s.crowdAnger=clamp((s.crowdAnger||0)-8,0,1000);}}
else if(action==='reject'){if(s.negotiationProcess.active){s.negotiationProcess.offer='отказ';s.crowdAnger=clamp((s.crowdAnger||0)+22,0,1000);}}
else if(action==='police-protest'){s.policeProtest.active=true;s.policeProtest.publicCriticism=100;s.policeProtest.phase='публичная критика руководства';s.policeMorale=clamp((s.policeMorale||72)-8);addNews(sim,'politics','warning','Сотрудники полиции публично критикуют руководство','Представители сотрудников заявили о несогласии с политикой смен и потребовали независимой правовой оценки приказов.');}
else if(action.startsWith('dual-')){if(!s.dualPower.active){s.dualPower.active=true;s.dualPower.committeeCount=Math.max(1,s.dualPower.committeeCount||0);s.dualPower.control=Math.max(10,s.dualPower.control||0);s.dualPower.ultimatumDeadline=now+360;}if(action==='dual-talk'){s.dualPower.choice='переговоры';s.crowdAnger=clamp((s.crowdAnger||0)-18,0,1000);s.dualPower.administrationParalyzed=clamp((s.dualPower.administrationParalyzed||25)-8);addNews(sim,'politics','info','Правительство согласилось на переговоры с временным советом','Начат процесс определения полномочий, гарантий и срока восстановления обычного управления.');}if(action==='dual-legal'){s.dualPower.choice='легализация';s.dualPower.control=clamp((s.dualPower.control||0)+18,0,100);s.stateMode='Переходное соглашение';s.stateModeCode='transition';addNews(sim,'politics','warning','Временный совет получил ограниченный правовой статус','Начат переходный период с совместным надзором и согласованием компетенций.');}if(action==='dual-restore'){s.dualPower.choice='правовое восстановление контроля';s.crowdAnger=clamp((s.crowdAnger||0)+30,0,1000);s.tension=clamp((s.tension||0)+10);addNews(sim,'politics','warning','Правительство объявило процедуру восстановления контроля','Администрация заявила о правовом процессе; риск столкновения повышен, а доступ гуманитарных и медицинских служб должен сохраняться.');}}
else if(action.startsWith('dispatch-')){const result=dispatchResource(sim,window.worldScene,action);const status=document.getElementById('v8-dispatch-status');if(status){status.textContent=result.message;status.dataset.state=result.ok?'success':'error';}if(result.ok){radio(sim,result.vehicle.service==='fire'?'Пожарные':result.vehicle.service==='ambulance'?'Медики':'Диспетчерская','Диспетчер',result.message,'info',result.vehicle.service==='fire'?'fire':'government');}}
renderPanel(s);refreshBrief(sim);sim._notify('v8');});}
  function renderPanel(s){const el=document.getElementById('v8-systems-panel');if(!el)return;const n=s.negotiationProcess||{},d=s.dualPower||{},l=s.fireLogistics||{};const ns=document.getElementById('v8-negotiation-status');if(ns)ns.textContent=n.active?`Раунд ${n.round||1}: ${Math.floor(n.elapsed||0)}/${Math.floor(n.duration||360)} игровых минут · ${n.side} · ${n.offer?'предложение: '+n.offer:'ожидается предложение'}`:`${n.status||'Переговоры не начаты'}${n.round?' · завершено раундов: '+n.round:''}`;const ds=document.getElementById('v8-dual-status');if(ds)ds.textContent=d.active?`Комитеты: ${d.committeeCount||1} · контроль: ${Math.round(d.control||0)}% · паралич администрации: ${Math.round(d.administrationParalyzed||0)}% · решение: ${d.choice||'не принято'}`:'Двоевластие не возникло.';const box=document.getElementById('v8-logistics');if(box)box.innerHTML=Object.entries({Пожарные:l.engines,Пена:l.foam,Автолестницы:l.ladders,Водяные_машины:l.waterTenders,Скорые:l.ambulances,Патрульные:l.patrolCars,Полицейские_фургоны:l.policeVans,Автобусы:l.buses,Пожарные_расчёты:l.fireCrews,Бригады_пены:l.foamTeams,Лестничные_машины:l.ladderTrucks}).map(([k,v])=>`<span>${k.replaceAll('_',' ')} <b>${Math.max(0,Math.round(v??100))}</b></span>`).join('');}
  // The tactical summary is pinned immediately below the simulation, as requested.
  function injectTacticalBrief(){const frame=document.querySelector('.scene-frame');if(frame&&!document.getElementById('tactical-brief-wrap')){const d=document.createElement('div');d.id='tactical-brief-wrap';d.className='tactical-brief-wrap';d.innerHTML='<span>ТАКТИКА ПОЛИЦИИ · ЦЕЛЬ ПРОТЕСТУЮЩИХ</span><p id="tactical-brief">Командование наблюдает за площадью; задачи пересматриваются по событиям.</p>';frame.insertAdjacentElement('afterend',d);}}
  function boot(){ensurePanel();injectTacticalBrief();const versionFooter=document.querySelector('.app-footer span');if(versionFooter)versionFooter.textContent='КОНТУР // ВЕРСИЯ 8.0.1';if(window.gameSimulation){init(window.gameSimulation.state,false);renderPanel(window.gameSimulation.state);refreshBrief(window.gameSimulation);} }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  const serviceArriveOriginal=SP.serviceArrive;SP.serviceArrive=function(service,incidentId,vehicleId){const r=serviceArriveOriginal.call(this,service,incidentId,vehicleId);const inc=incidentId?(this.state.incidents||[]).find(i=>i.id===incidentId):null;if(service==='fire'&&inc){inc.fireServiceActive=true;if(!inc.fireMethod)inc.fireMethod='water';if(!inc.fuelType)inc.fuelType=inc.type==='roof_fire'?'structure':/шин|резин/.test(inc.label||'')?'rubber':'mixed';}return r;};
  const dispatchOriginal=P._dispatchVehicle;P._dispatchVehicle=function(order){const r=dispatchOriginal.call(this,order);const v=this.vehicles?.[this.vehicles.length-1];const s=this.sim?.state;if(v&&s){init(s,false);const key=v.service==='fire'?'engines':v.service==='ambulance'?'ambulances':v.service==='military'?'policeVans':v.service==='bus'?'buses':'patrolCars';if(!order.v8Manual&&(s.fireLogistics[key]??100)>0)s.fireLogistics[key]--;v.v8ReserveKey=key;}return r;};
  const oldUpdate=P.update;P.update=function(time,delta){oldUpdate.call(this,time,delta);if(this.sim){init(this.sim.state,false);renderPanel(this.sim.state);refreshBrief(this.sim);}};
  const oldRender= P._renderEnvironment;
  if(oldRender){P._renderEnvironment=function(s,time){oldRender.call(this,s,time);const g=this.fx;if(!g)return; // No event rings: remove all circular location markers from this visual layer.
    // Foam/water effects are low-profile directional streaks, not target rings.
    const l=s.fireLogistics||{};if(l.lastDispatch&&/пена|вода|автолестница/.test(l.lastDispatch)){const inc=(s.incidents||[]).find(i=>i.id===l.lastDispatchIncident&&fireTypes.includes(i.type));if(inc){if(l.lastDispatch==='пена'){g.fillStyle(0xe8eee1,.10);for(let i=0;i<8;i++)g.fillEllipse(inc.x-35+i*10,inc.y-20-i*2,20,6);}else if(l.lastDispatch==='вода'){g.lineStyle(2,0x9dcad7,.25);for(let i=0;i<7;i++){g.beginPath();g.moveTo(inc.x-75+i*8,inc.y-34-i);g.lineTo(inc.x-22+i*8,inc.y-14-i);g.strokePath();}}else{g.lineStyle(2,0xd9d4c4,.65);g.beginPath();g.moveTo(inc.x+35,inc.y+45);g.lineTo(inc.x+25,inc.y-60);g.strokePath();g.beginPath();g.moveTo(inc.x+25,inc.y-60);g.lineTo(inc.x,inc.y-60);g.strokePath();}}}
  };}
  // Store versioned state through existing save/load mechanism.
  UP.saveGame=function(...a){init(this.sim.state,false);return prevSave.apply(this,a);};
  UP.loadGame=function(...a){const r=prevLoad.apply(this,a);init(this.sim.state,false);renderPanel(this.sim.state);refreshBrief(this.sim);return r;};
  UP.updateStats=function(...a){const r=prevStats.apply(this,a);renderPanel(this.sim.state);return r;};
  window.KonturV8={init,minuteStep,refreshBrief,renderPanel,dispatchResource,dispatchPlans};
})();
