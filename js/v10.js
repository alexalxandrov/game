'use strict';
/* KONTUR v10 — active-track archive, concrete bargaining, ratification, elections, press and crowd civic agency. */
(function installKonturV10(){
  const Sim=window.RepublicSimulation, UI=window.RepublicDashboardUI, api=window.KonturV9;
  if(!Sim||!UI||!api)return;
  if(window.GAME_CONFIG)window.GAME_CONFIG.version='10.0.0';
  const SP=Sim.prototype, UP=UI.prototype;
  const oldTick=SP.tick, oldReferendum=SP._updateReferendum;
  const oldRender=api.renderDiplomacy, oldResolve=api.resolveDecision, oldFinish=api.finishTrack, oldCreateTrack=api.createTrack;
  const oldFulfillPromise=SP.fulfillPromise, oldUpdateStats=UP.updateStats;
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const nowOf=s=>(Math.max(1,Number(s.day)||1)-1)*1440+(Number(s.hour)||0)*60+(Number(s.minute)||0);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function init(s){
    if(!Array.isArray(s.negotiationArchive))s.negotiationArchive=[];
    if(!Array.isArray(s.negotiationTracks))s.negotiationTracks=[];
    if(!Array.isArray(s.v10ProcessedPoliticalIds))s.v10ProcessedPoliticalIds=[];
    if(!s.v10Media)s.v10Media={pressTeams:0,pressExpiresAt:0,streamers:0,streamExpiresAt:0,viralCalls:0,lastAction:'',lastActionAt:0};
    if(!s.v10Crowd)s.v10Crowd={stewards:0,stewardsExpireAt:0,chorusUntil:0,chainUntil:0,observers:0,observersExpireAt:0};
    if(!s.v10Parliament)s.v10Parliament={seats:{cabinet:88,opposition:66,labour:24,regional:22},coalition:'Кабинет + региональная группа',confidence:'majority',nextConfidenceAt:nowOf(s)+1440,lastVote:null};
    if(!s.v10Parliament.seats)s.v10Parliament.seats={cabinet:88,opposition:66,labour:24,regional:22};
    if(!s.v10ElectionCycle)s.v10ElectionCycle={phase:'none',electionAt:null,electionsCalledAt:null,history:[]};
    if(!s.v10CivicSequence)s.v10CivicSequence=0;
    if(typeof s.v10LastAdvancedAt!=='number')s.v10LastAdvancedAt=-1;if(typeof s.v10LastPanelRenderAt!=='number')s.v10LastPanelRenderAt=-999;
    for(const t of s.negotiationTracks){if(t.closed||t.stage==='complete'){if(!s.negotiationArchive.some(x=>x.id===t.id))s.negotiationArchive.push(t);}}
    s.negotiationTracks=s.negotiationTracks.filter(t=>!t.closed&&t.stage!=='complete');
    if(s.negotiationArchive.length>80)s.negotiationArchive=s.negotiationArchive.slice(-80);
  }
  function event(sim,title,body,kind='info',trackId=null){
    const s=sim.state;init(s);s.v10CivicSequence++;
    const item={id:`V10-${s.v10CivicSequence}`,at:nowOf(s),day:s.day||1,hour:s.hour||0,title,body,kind,trackId};
    s.v9EventLog=Array.isArray(s.v9EventLog)?s.v9EventLog:[];s.v9EventLog.unshift(item);s.v9EventLog=s.v9EventLog.slice(0,60);
    sim.addNews?.('politics',kind==='warning'?'warning':kind==='success'?'good':'info',title,body);
    banner(title,body,kind);return item;
  }
  function banner(title,body,kind='info'){
    if(!document.body)return;let stack=document.getElementById('v9-banner-stack');
    if(!stack){stack=document.createElement('div');stack.id='v9-banner-stack';stack.className='v9-banner-stack';stack.setAttribute('aria-live','polite');document.body.appendChild(stack);}
    const item=document.createElement('article');item.className=`v9-banner v9-banner-${['warning','critical','success'].includes(kind)?kind:'info'}`;
    const h=document.createElement('strong');h.textContent=title;const p=document.createElement('p');p.textContent=body;item.append(h,p);stack.prepend(item);
    while(stack.children.length>4)stack.lastElementChild.remove();window.setTimeout(()=>{item.classList.add('v9-banner-hide');window.setTimeout(()=>item.remove(),350);},8000);
  }
  function trackKind(t){
    const x=`${t.topic||''} ${t.demand||''} ${t.party||''}`.toLowerCase();
    if(/профсоюз|зарплат|индексац|стачк|труд|работник|забаст/.test(x))return'labour';
    if(/полиц|смен|сверхуроч|служб|правовой защит|командован/.test(x))return'police';
    if(/временн.*совет|переходн|двоевласт|полномоч|возвращени.*управлен/.test(x))return'council';
    if(/выбор|парламент|оппозиц|коалиц|мандат|вотум|распуск/.test(x))return'election';
    if(/сми|медиа|журналист|пресс|информац|прозрач|публикац/.test(x))return'media';
    if(/бюджет|налог|финанс|расход|выплат|тариф|социальн/.test(x))return'budget';
    if(/транспорт|маршрут|дорог|перевоз|автобус|движени/.test(x))return'transport';
    if(/регион|муницип|делегац|бизнес|предприним|работодател/.test(x))return'regions';
    return'protest';
  }
  function optionSet(labels,details={}){
    const desc=details.desc||{};
    return [
      ['accept',labels[0],desc.accept||'Принять основное требование; это повышает шанс соглашения и создаёт проверяемое обязательство.'],
      ['compromise',labels[1],desc.compromise||'Уступить частично, оставить этапы исполнения и последующую проверку.'],
      ['inquiry',labels[2],desc.inquiry||'Передать спор на независимую проверку с опубликованным сроком.'],
      ['delay',labels[3],desc.delay||'Отложить ответ; делегация может выдвинуть встречное предложение или ультиматум.'],
      ['reject',labels[4],desc.reject||'Отклонить пункт; риск выхода делегации и уличной эскалации возрастает.']
    ];
  }
  function makeAgendaData(t){
    const kind=trackKind(t),topic=t.topic||'общественное требование',demand=t.demand||topic;
    const rows={
      labour:[
        ['Пункт 1 · Индексация: требование профсоюзов — повышение зарплат на 7% с обратной датой выплаты. Какой размер и график закрепить?', ['7% с ретроактивной выплатой','4% сразу + ещё 3% после квартальной проверки','Финансовая экспертиза фонда оплаты за 48 часов','Отложить расчёт на 72 часа','Отклонить индексацию']],
        ['Пункт 2 · Сохранение рабочих мест: запрет массовых увольнений на 90 дней или согласованный план сокращений?', ['Мораторий на увольнения на 90 дней','Защита ключевых работников на 60 дней','Комиссия по занятости и открытым вакансиям','Вернуться после квартального отчёта','Оставить решение работодателям']],
        ['Пункт 3 · Коллективный договор: какая формула переговоров, арбитража и защиты представителей?', ['Обязательный коллективный договор','Типовой договор с отраслевыми исключениями','Независимый трудовой арбитраж','Отложить до аудита','Отказать в новых гарантиях']],
        ['Пункт 4 · Забастовка: приостанавливается ли акция при подписании промежуточного соглашения?', ['Пауза на 7 дней после подписания','Пауза на 72 часа при первых выплатах','Голосование членов профсоюза после слушаний','Запросить повторное голосование через 48 часов','Не предлагать паузу']],
        ['Пункт 5 · Исполнение: кто проверяет выплаты, занятость и нарушения договора?', ['Ежемесячный публичный реестр выплат','Совместная проверка раз в квартал','Независимый аудит с обязательным ответом','Отложить контроль до конца квартала','Без отдельного механизма контроля']]
      ],
      police:[
        ['Пункт 1 · График службы: установить верхний предел сверхурочных и гарантированный отдых между сменами?', ['12 часов на смену + 11 часов отдыха','Гибкий график с обязательным лимитом переработки','Независимая проверка нагрузки подразделений','Пересчитать графики за 72 часа','Сохранить текущий режим']],
        ['Пункт 2 · Оплата: как компенсировать сверхурочную службу и ночные смены?', ['Доплата 25% за сверхурочные','Доплата 15% и дополнительный отдых','Аудит фонда оплаты ведомства','Отложить до бюджетной комиссии','Не вводить доплаты']],
        ['Пункт 3 · Правовая защита: независимый разбор жалоб и гарантии добросовестным сотрудникам?', ['Внешний уполномоченный и сроки ответа','Совместная комиссия с внешним наблюдателем','Пилот на одном подразделении','Отложить правила на неделю','Оставить внутреннее рассмотрение']],
        ['Пункт 4 · Публичные действия: как фиксировать приказы и спорное применение силы?', ['Нагрудная фиксация и публикация агрегированных данных','Выборочная запись с независимым хранением','Пилотный протокол и оценка через месяц','Отложить до юридического заключения','Не менять правила фиксации']],
        ['Пункт 5 · Дежурный минимум: сколько сотрудников остаётся для экстренных вызовов при трудовом споре?', ['Публичный минимум и резерв смен','Временный минимум на 30 дней','Независимый расчёт безопасной численности','Вернуться после переговоров о графике','Не закреплять минимум']]
      ],
      council:[
        ['Пункт 1 · Правовой мандат: какие полномочия временного совета действуют до восстановления обычного управления?', ['Ограниченный мандат на 30 дней с перечнем полномочий','Совместное решение по услугам и бюджету','Заключение независимой конституционной комиссии','Отложить полномочия на 72 часа','Не признавать полномочия совета']],
        ['Пункт 2 · Городские службы: кто утверждает работу транспорта, больниц и аварийных коридоров?', ['Совместный штаб с публичным расписанием','Делегирование операционных задач муниципалитету','Независимый аудит критических служб','Отложить до юридической консультации','Сохранить единоличное управление']],
        ['Пункт 3 · Гарантии участников: какой механизм исключает месть и произвольные задержания?', ['Независимый наблюдатель и письменные гарантии','Комиссия по жалобам с коротким сроком','Пилотная процедура под контролем суда','Отложить согласование гарантий','Не предоставлять дополнительные гарантии']],
        ['Пункт 4 · Возврат к обычному управлению: какой календарь выборов и передачи функций?', ['Выборы и передача функций в течение 60 дней','Поэтапная передача за 90 дней','Дорожная карта под надзором парламента','Отложить календарь на 14 дней','Не согласовывать дату перехода']],
        ['Пункт 5 · Ратификация: кто утверждает соглашение и что делать при блокировке?', ['Парламентское голосование и публичный отчёт','Условное соглашение с последующим референдумом','Независимое правовое заключение','Перенести голосование на 72 часа','Отказаться от совместной ратификации']]
      ],
      election:[
        ['Пункт 1 · Дата выборов: назначить голосование в пределах 60 дней или сохранить действующий срок?', ['Выборы через 45 дней','Выборы через 90 дней после регистрации правил','Независимый календарный аудит','Отложить назначение на 14 дней','Сохранить действующий срок']],
        ['Пункт 2 · Правила мандатов: порог, распределение мест и финансирование кампании?', ['Единые правила и порог 4%','Компромиссный порог 5% + защита меньшинств','Комиссия по избирательному праву','Публикация проекта через неделю','Сохранить текущие правила']],
        ['Пункт 3 · Кампания и эфир: равный доступ партий к общественному вещанию?', ['Равное эфирное время и открытые дебаты','Пропорциональное время с минимальной гарантией','Независимый аудит редакционного доступа','Отложить правила на 72 часа','Оставить доступ на усмотрение редакций']],
        ['Пункт 4 · Подсчёт: наблюдатели, протоколы участков и пересчёт спорных бюллетеней?', ['Независимые наблюдатели и онлайн-протоколы','Совместные комиссии по спорным участкам','Судебный пересмотр по заявлению','Отложить регистрацию наблюдателей','Не вводить дополнительные гарантии']],
        ['Пункт 5 · После голосования: коалиционные переговоры, сроки кабинета и вотум доверия?', ['Публичные коалиционные переговоры за 72 часа','Кабинет меньшинства с вотумом доверия','Межпартийная комиссия по переходу власти','Перенести согласование состава','Сохранить действующий кабинет без голосования']]
      ],
      media:[
        ['Пункт 1 · Доступ журналистов к площади: согласовать аккредитацию, безопасные позиции и запрет блокировать съёмку?', ['Аккредитация без предварительной цензуры','Коридоры и безопасные зоны с равным доступом','Комиссия по безопасности работы прессы','Пересмотреть карту доступа за 48 часов','Ограничить доступ журналистов']],
        ['Пункт 2 · Жалобы на силу: кто проверяет исходную видеозапись и показания?', ['Независимая комиссия с публикацией отчёта','Совместная комиссия под внешним наблюдением','Экспертная проверка оригиналов','Отложить заключение на неделю','Оставить проверку внутри ведомства']],
        ['Пункт 3 · Источники: как защищать информаторов и журналистские материалы?', ['Гарантии конфиденциальности источников','Судебный порядок доступа к оригиналам','Пилотный протокол хранения данных','Запросить юридическое заключение','Не менять текущую процедуру']],
        ['Пункт 4 · Публикация документов: какой срок ответа на запросы об общественно значимых данных?', ['Ответ за 48 часов с реестром исключений','Ответ за 5 рабочих дней','Независимый уполномоченный по доступу','Отложить регламент на неделю','Расширить закрытый перечень']],
        ['Пункт 5 · Пресс-брифинг: как часто кабинет раскрывает решения и отвечает на вопросы?', ['Ежедневный брифинг и стенограмма','Брифинг после каждого крупного инцидента','Еженедельный независимый отчёт','Запустить пробный режим на месяц','Оставить коммуникацию по усмотрению кабинета']]
      ],
      budget:[
        ['Пункт 1 · Финансирование пакета: закрепить источник для индексации, компенсаций и социальных расходов?', ['Выделить 0,02 бюджета на пакет сразу','Два этапа с пересмотром расходов через квартал','Публичный анализ казны и независимая смета','Отложить бюджетный расчёт на 72 часа','Отклонить дополнительное финансирование']],
        ['Пункт 2 · Налоги и компенсации: кому предоставляется временное облегчение?', ['Адресная компенсация домохозяйствам','Временная льгота для низких доходов','Комиссия по оценке распределения расходов','Отложить до анализа доходов','Не вводить компенсации']],
        ['Пункт 3 · Приоритет расходов: больницы, транспорт или занятость?', ['Первый приоритет — общественные услуги','Поровну между транспортом и занятостью','Публичный аудит очередности проектов','Запросить оценку эффекта за 48 часов','Оставить текущую структуру расходов']],
        ['Пункт 4 · Контроль: как отслеживать закупки и расходование средств?', ['Квартальный аудит и открытый реестр','Совместная проверка контрольной палаты','Пилотный отчёт в течение месяца','Отложить публикацию сметы','Не менять процедуру аудита']],
        ['Пункт 5 · Срок действия пакета: когда пересматриваются суммы и критерии?', ['Пересмотр через 90 дней','Пересмотр через квартал при выполнении KPI','Независимая оценка до продления','Вернуться к вопросу через месяц','Не устанавливать дату пересмотра']]
      ],
      transport:[
        ['Пункт 1 · Расписание: какие автобусные и железнодорожные линии должны оставаться доступными?', ['Гарантировать базовое расписание и резервные маршруты','Сохранить основные линии в часы пик','Совместная оценка пассажиропотока','Опубликовать расчёт через 48 часов','Не вводить гарантированное расписание']],
        ['Пункт 2 · Компенсации работникам: как возместить простой и ночные смены?', ['Оплатить подтверждённый простой','Частичная выплата в два этапа','Комиссия работодателей и профсоюза','Отложить до отчётности предприятий','Отклонить компенсацию']],
        ['Пункт 3 · Соглашение с профсоюзами: как часто пересматриваются тарифы и графики?', ['Трёхсторонний договор на 6 месяцев','Временный договор на 90 дней','Независимый арбитраж тарифов','Перенести решение на неделю','Сохранить одностороннее расписание']],
        ['Пункт 4 · Экстренные коридоры: как не блокировать скорые и пожарные службы?', ['Постоянный коридор с совместным контролем','Окна пропуска каждый час','Дежурная группа для снятия препятствий','Согласовать схему в следующие 48 часов','Не согласовывать дополнительные коридоры']],
        ['Пункт 5 · Мониторинг исполнения: кто публикует отчёт о восстановлении движения?', ['Ежедневный отчёт по ключевым линиям','Еженедельная комиссия','Независимый аудит транспортной доступности','Отложить отчёт на месяц','Без публичного контроля']]
      ],
      regions:[
        ['Пункт 1 · Полномочия: какие услуги и решения передаются муниципалитетам?', ['Передать услуги с закреплённой финансовой долей','Пилот на 3 месяца в нескольких округах','Комиссия по разграничению полномочий','Опубликовать карту полномочий за неделю','Сохранить централизацию']],
        ['Пункт 2 · Финансирование: как распределить средства между регионами?', ['Формула по населению и потребности','Минимальная гарантия для каждого региона','Независимый аудит трансфертов','Отложить до бюджетного прогноза','Сохранить текущие трансферты']],
        ['Пункт 3 · Представительство: как регионы участвуют в общих решениях?', ['Постоянный региональный совет','Совместные слушания по спорным мерам','Независимый посредник по компетенциям','Пилот на один квартал','Не создавать новую площадку']],
        ['Пункт 4 · Подотчётность: как предотвращать конфликт полномочий?', ['Публичный реестр решений и аудит','Совместный надзор центра и региона','Арбитражная комиссия','Отложить до юридического заключения','Оставить вопросы текущей практике']],
        ['Пункт 5 · Пересмотр: когда оценивается новая модель управления?', ['Через 90 дней с открытым отчётом','Через полгода по ключевым показателям','Независимая оценка до продления','Отложить дату пересмотра','Не устанавливать срок']]
      ],
      protest:[
        ['Пункт 1 · Немедленные гарантии: освобождение задержанных без правового основания и срочный доступ к защитнику?', ['Проверить все задержания за 24 часа и освободить незаконно удерживаемых','Независимый пересмотр по приоритетным делам за 48 часов','Назначить судебные слушания и опубликовать сводку','Отложить ответ на 72 часа','Отклонить требование о пересмотре']],
        ['Пункт 2 · Применение силы: кто проверяет записи, приказы и показания свидетелей?', ['Независимая комиссия и отчёт за 7 дней','Совместная проверка с внешним наблюдателем','Сохранить исходники и назначить экспертизу','Запросить дополнительное время','Отказать в независимой проверке']],
        ['Пункт 3 · Марш и ограничения: разрешить альтернативный маршрут и гарантировать доступ медиков?', ['Разрешить маршрут с коридорами экстренных служб','Изменить маршрут после консультации с организаторами','Публичные слушания и карта ограничений','Перенести решение на 48 часов','Сохранить запрет или ограничения']],
        ['Пункт 4 · Материальные требования: согласовать конкретный пакет по предмету «'+demand.slice(0,110)+'»?', ['Принять требование с финансированием и контрольным сроком','Исполнить первый этап в течение недели','Поручить независимой комиссии смету','Запросить расчёт за 72 часа','Отклонить материальную часть']],
        ['Пункт 5 · Гарантии соглашения: публикация протокола, ответственные лица и дата проверки?', ['Опубликовать обязательный график и ответственных','Создать совместную комиссию с отчётом каждую неделю','Независимый мониторинг выполнения','Продлить переговоры на 48 часов','Не закреплять механизм контроля']]
      ]
    };
    const chosen=rows[kind]||[
      [`Пункт 1 · Основное требование: «${demand.slice(0,140)}». Принять его в полном объёме или изменить масштаб?`,['Принять требование полностью','Принять первую фазу с датой пересмотра','Независимое заключение по предмету','Отложить ответ на 72 часа','Отклонить требование']],
      [`Пункт 2 · Финансирование и правовая основа: какой источник средств, полномочие и ответственный орган необходимы?`,['Закрепить ресурс и ответственного','Разбить исполнение на этапы','Провести открытый аудит','Отложить расчёты','Не менять текущие правила']],
      [`Пункт 3 · Гарантии: кто контролирует выполнение и как подать жалобу на нарушение?`,['Внешний наблюдатель и публикация','Совместный контроль сторон','Независимая проверка жалоб','Перенести решение','Не добавлять гарантий']],
      [`Пункт 4 · Календарь: какой первый проверяемый результат должен быть через 7, 30 и 90 дней?`,['Первый этап за 7 дней','Поэтапный график на 30 дней','Комиссия по срокам','Запросить ещё время','Отказаться от календаря']],
      [`Пункт 5 · Ратификация и последствия: кто утверждает итоговый пакет и что происходит при срыве?`,['Публичная ратификация с контролем','Условный протокол и повторное голосование','Независимое правовое заключение','Отложить утверждение','Отклонить пакет']]
    ];
    return chosen.map((r,i)=>({question:r[0],options:optionSet(r[1])}));
  }
  function applyAgendaToTrack(t){
    if(!t||!Array.isArray(t.agenda)||!t.agenda.length||t.stage==='mandate')return;
    if(t.v10AgendaVersion===2)return;
    t.v10Kind=trackKind(t);t.v10AgendaData=makeAgendaData(t);t.agenda=t.v10AgendaData.map(x=>x.question);t.agendaOptions=t.v10AgendaData.map(x=>x.options);t.v10AgendaVersion=2;
    t.concessionLevel=Number(t.concessionLevel)||0;t.walkoutRisk=Number(t.walkoutRisk)||0;t.mediatorRounds=Number(t.mediatorRounds)||0;t.v10CounterRejected=Number(t.v10CounterRejected)||0;
    // Keep already-recorded rounds but make the remaining issue list concrete.
    t.agendaIndex=clamp(t.agendaIndex||0,0,t.agenda.length);t.updatedAt=nowOf(window.gameSimulation?.state||{});
  }
  function syncTracks(s){
    init(s);
    for(const t of s.negotiationTracks){if(t.stage!=='mandate'&&t.agenda?.length)applyAgendaToTrack(t);}
    for(const d of s.v9Decisions||[]){
      if(d.type!=='agenda'||!['queued','pending'].includes(d.status))continue;
      const t=s.negotiationTracks.find(x=>x.id===d.trackId);if(!t)continue;applyAgendaToTrack(t);
      const ix=clamp(t.agendaIndex||0,0,Math.max(0,t.agenda.length-1)),question=t.agenda?.[ix],options=t.agendaOptions?.[ix];if(!question||!Array.isArray(options)||!options.length)continue;
      d.title=question;d.body=`ТЕМА: ${t.topic}. СТОРОНА: ${t.party}. Предмет обсуждения: ${question} Общие требования стороны: ${t.demand}. Это конкретный пункт ${ix+1}/5. После позиции кабинета делегация ответит в установленный срок; при отказе может выставить встречное предложение или ультиматум.`;d.choices=options;d.v10AgendaSignature=`${t.id}:${ix}:${question}`;
    }
  }
  function archiveClosed(s){
    init(s);const done=s.negotiationTracks.filter(t=>t.closed||t.stage==='complete');if(!done.length)return false;
    for(const t of done){if(!s.negotiationArchive.some(x=>x.id===t.id)){t.archivedAt=nowOf(s);s.negotiationArchive.unshift(t);}}
    s.negotiationTracks=s.negotiationTracks.filter(t=>!t.closed&&t.stage!=='complete');if(s.negotiationArchive.length>80)s.negotiationArchive=s.negotiationArchive.slice(0,80);return true;
  }
  function ensureArchiveDOM(){
    const panel=document.getElementById('v9-diplomacy-panel');if(!panel)return null;
    let root=document.getElementById('v10-negotiation-archive');if(!root){root=document.createElement('section');root.id='v10-negotiation-archive';root.className='v10-archive';const grid=document.getElementById('v9-track-grid');(grid||panel).insertAdjacentElement('afterend',root);}
    return root;
  }
  function renderArchive(s){
    const root=ensureArchiveDOM();if(!root)return;const items=s.negotiationArchive||[];const signature=items.map(t=>`${t.id}:${t.result?.outcome||t.status}:${t.obligations?.length||0}`).join('|');if(root.dataset.v10Signature===signature)return;root.dataset.v10Signature=signature;root.replaceChildren();
    const details=document.createElement('details');details.className='v10-archive-details';const sum=document.createElement('summary');sum.textContent=`Архив завершённых переговоров · ${items.length}`;details.append(sum);
    const tools=document.createElement('div');tools.className='v10-archive-tools';const p=document.createElement('p');p.textContent='Завершённые линии автоматически убраны из активной панели. Архив можно удалить целиком или очистить отдельную историю; действующие обязательства от этого не удаляются.';const clear=document.createElement('button');clear.type='button';clear.className='v9-secondary-button';clear.textContent='Удалить весь архив';clear.dataset.v10ClearArchive='1';clear.disabled=!items.length;tools.append(p,clear);details.append(tools);
    if(!items.length){const empty=document.createElement('p');empty.className='v9-empty';empty.textContent='Архив пуст. Завершённые линии появятся здесь и больше не будут загромождать активный список.';details.append(empty);}
    for(const t of items){
      const row=document.createElement('article');row.className='v10-archive-row';const main=document.createElement('div');const h=document.createElement('strong');h.textContent=t.topic||'Переговоры';const meta=document.createElement('small');meta.textContent=`${t.party||'Делегация'} · ${t.result?.outcome||t.status||'завершена'} · согласовано ${t.result?.agreedTopics??t.acceptedTopics?.length??0}, частично ${t.result?.partialTopics??t.partialTopics?.length??0}`;main.append(h,meta);const actions=document.createElement('div');actions.className='v10-archive-row-actions';const view=document.createElement('button');view.type='button';view.className='v9-small-button';view.textContent='Протокол';view.dataset.v10ArchiveView=t.id;const del=document.createElement('button');del.type='button';del.className='v9-secondary-button';del.textContent='Удалить';del.dataset.v10DeleteArchive=t.id;actions.append(view,del);row.append(main,actions);details.append(row);
    }
    root.append(details);
  }
  function deleteArchiveEntry(s,id){
    const keys=new Set((s.negotiationArchive||[]).filter(t=>id==='*'||t.id===id).map(t=>t.id));
    s.negotiationArchive=(s.negotiationArchive||[]).filter(t=>!keys.has(t.id));
    s.v9EventLog=(s.v9EventLog||[]).filter(e=>!keys.has(e.trackId));
    s.v9Decisions=(s.v9Decisions||[]).filter(d=>!keys.has(d.trackId)||['queued','pending'].includes(d.status));
    // Signed obligations remain part of the public record even after transcript deletion.
    event(window.gameSimulation,id==='*'?'Архив переговоров очищен':'История переговоров удалена',id==='*'?'Удалены завершённые протоколы. Реестр обязательств сохранён.':'Удалён выбранный протокол. Реестр обязательств и результаты исполнения сохранены.','info');
    try{window.dashboardUI?.saveGame?.();}catch{}
    renderArchive(s);oldRender(s,true);
  }
  function normalisePromises(s){
    for(const p of s.promises||[]){if(!p.negotiationId)continue;const t=[...(s.negotiationTracks||[]),...(s.negotiationArchive||[])].find(x=>x.id===p.negotiationId);if(!t)continue;
      if(t.ratified&&p.status==='provisional')p.status='pending';
      else if(t.v10RatificationFailed&&['pending','provisional'].includes(p.status))p.status='cancelled';
      else if(!t.ratified&&!t.closed&&p.status==='pending')p.status='provisional';
      if(t.packageOffer&&p.negotiationId===t.id){p.packageCondition=t.packageOffer.condition;const listed=(t.obligations||[]).indexOf(p.id);if(listed>=0)p.packageSequence=listed;}
    }
  }
  function promotePromises(s,t){for(const p of s.promises||[]){if(p.negotiationId!==t.id)continue;if(p.status==='provisional')p.status='pending';if(t.packageOffer){p.packageCondition=t.packageOffer.condition;const listed=(t.obligations||[]).indexOf(p.id);if(listed>=0)p.packageSequence=listed;p.condition=`${p.condition||'Исполнение с контрольным сроком'}; пакетная связка: ${t.packageOffer.condition}`;}}}
  function cancelProvisional(s,t){for(const p of s.promises||[])if(p.negotiationId===t.id&&['pending','provisional'].includes(p.status))p.status='cancelled';}
  function record(sim,t,side,speaker,text,kind='info'){
    const at=nowOf(sim.state);t.transcript=t.transcript||[];t.transcript.push({at,side,speaker,text,kind});t.updatedAt=at;
    event(sim,`${t.topic}: ${side==='government'?'позиция правительства':side==='party'?'ответ делегации':'ход процесса'}`,text,kind,t.id);
  }
  function concreteCounteroffer(t,q){
    const k=t.v10Kind||trackKind(t);if(k==='labour')return'Встречное предложение: индексация 4% немедленно и ещё 3% через квартал при проверке казны; мораторий на массовые увольнения на 60 дней.';
    if(k==='police')return'Встречное предложение: лимит сверхурочных, дополнительный отдых смен и независимый разбор жалоб при сохранении минимального состава вызовов.';
    if(k==='council')return'Встречное предложение: временный правовой мандат на 30 дней, совместный штаб служб и парламентский надзор за календарём возврата полномочий.';
    if(k==='election')return'Встречное предложение: выборы в пределах 60–90 дней при согласованных правилах эфира, независимом подсчёте и публичных переговорах о коалиции.';
    if(k==='media')return'Встречное предложение: безопасный доступ прессы, независимое хранение оригиналов и публикация сводного отчёта в течение семи дней.';
    if(k==='budget')return'Встречное предложение: первая бюджетная фаза сейчас, полный пакет после аудита источника средств и контрольный пересмотр через квартал.';
    if(k==='transport')return'Встречное предложение: базовые маршруты и экстренные коридоры восстанавливаются первыми; компенсации и тарифы проходят трёхстороннюю комиссию.';
    return`Встречное предложение по пункту «${q}»: принять первую фазу в течение недели, установить внешний контроль и вернуться к спорной части через 72 часа.`;
  }
  function queueCustom(sim,type,options){
    const d=api.queueDecision(sim,{type:`v10-${type}`,trackId:options.trackId||null,kicker:options.kicker||'ПОЛИТИЧЕСКИЙ ПРОЦЕСС',title:options.title||'Требуется решение',speaker:options.speaker||'',body:options.body||'',timeout:options.timeout||120,defaultChoice:options.defaultChoice||options.choices?.[0]?.[0],choices:options.choices||[],payload:options.payload||{},notify:options.notify!==false});
    d.v10Custom=true;decorateModal(sim);return d;
  }
  function queueCounteroffer(sim,t,q){
    if(t.closed||t.pendingDecisionId)return;
    t.stage='counteroffer';t.status='Делегация внесла встречное предложение';t.currentCounteroffer={question:q,text:concreteCounteroffer(t,q),at:nowOf(sim.state)};t.walkoutRisk=clamp((t.walkoutRisk||0)+6,0,100);
    queueCustom(sim,'counteroffer',{trackId:t.id,kicker:'ВСТРЕЧНОЕ ПРЕДЛОЖЕНИЕ · ТРЕК '+t.id,title:`Ответить на встречное предложение: ${t.topic}`,speaker:`${t.party}${t.mediator?' · посредник ведёт закрытый раунд':''}`,body:`Исходный спорный пункт: ${q}\n\n${t.currentCounteroffer.text}\n\nПримите пакет, предложите промежуточную формулу, отклоните его или поручите посреднику провести закрытые консультации между сторонами. Отказ повышает риск ультиматума или выхода делегации.`,timeout:t.format==='mediated'?110:85,defaultChoice:'compromise',payload:{trackId:t.id,question:q},choices:[['accept','Принять встречный пакет','Подписать пункт и зарегистрировать обязательство с датой исполнения.'],['compromise','Согласовать промежуточную формулу','Принять первую фазу и сохранить спорную часть для следующего раунда.'],['shuttle','Поручить посреднику закрытый обмен позициями','Посредник внесёт письменный пакет и может приостановить раунд для консультаций.'],['reject','Отклонить встречное предложение','Делегация вправе выставить финальный ультиматум или покинуть стол.']]});
  }
  function queueRatification(sim,t){
    if(!t||t.closed||t.ratificationQueued)return;
    t.ratificationQueued=true;t.pendingDecisionId=null;
    const negotiated=(t.acceptedTopics?.length||0)+(t.partialTopics?.length||0);
    if(!negotiated){t.v10RatificationFailed=true;t.v10RatificationReason='Переговоры завершились без согласованных пунктов';api.finishTrack(sim,t,'declined');return;}
    t.stage='ratification';t.status='Соглашение ожидает ратификации';
    queueCustom(sim,'ratification',{trackId:t.id,kicker:'РАТИФИКАЦИЯ · ПОСЛЕДНЯЯ СТАДИЯ',title:`Утвердить итоговый пакет: ${t.topic}`,speaker:`Делегация: ${t.party}. Условия согласованы не полностью и должны пройти внутреннее голосование.`,body:`Согласовано полностью: ${t.acceptedTopics.length}; частично: ${t.partialTopics?.length||0}; отклонено: ${t.rejectedTopics.length}. Принятые ранее пункты пока предварительные: юридические обязательства вступят в силу только после ратификации. Вариант референдума связывает соглашение с действующим гражданским голосованием.`,timeout:150,defaultChoice:'vote',payload:{trackId:t.id},choices:[['vote','Провести голосование делегации и парламента','Моделируются голоса умеренного и радикального крыла, а также поддержка парламентских фракций.'],['conditional','Подписать условное соглашение','Ввести согласованные пункты поэтапно; спорные части остаются на повторном контроле.'],['referendum','Вынести пакет на референдум','Три модельных дня голосования; результат непосредственно определит судьбу этого соглашения.'],['reject','Не ратифицировать пакет','Временные обещания отменяются, напряжение и риск повторной мобилизации растут.']]});
  }
  function issueLog(s,title,choice,description){
    s.politicalDecisionLog=Array.isArray(s.politicalDecisionLog)?s.politicalDecisionLog:[];
    s.politicalDecisionLog.unshift({id:`V10-P-${++s.v10CivicSequence}`,at:nowOf(s),day:s.day||1,event:'v10',title,choice,choiceTitle:choice,description,automatic:false});s.politicalDecisionLog=s.politicalDecisionLog.slice(0,60);
  }
  function applyStreetEffect(sim,t,choice,q){
    const s=sim.state;const anger=Number(s.crowdAnger)||0;
    if(choice==='accept'){
      s.crowdAnger=clamp(anger-14,0,1000);s.publicAnger=clamp((s.publicAnger||0)-3,0,100);s.mobilizationSurge=Math.max(0,(s.mobilizationSurge||0)-65);s.tension=clamp((s.tension||0)-2,0,100);t.concessionLevel=(t.concessionLevel||0)+2;t.trustAccumulated=(t.trustAccumulated||0)+2;
      event(sim,'Уступка объявлена публично',`Объявлен пункт «${q}». Часть участников считает конкретный срок первым результатом; мобилизация начинает снижаться до завершения всего соглашения.`,'success',t.id);
    }else if(choice==='compromise'){
      s.crowdAnger=clamp(anger-7,0,1000);s.mobilizationSurge=Math.max(0,(s.mobilizationSurge||0)-25);s.tension=clamp((s.tension||0)-.8,0,100);t.concessionLevel=(t.concessionLevel||0)+1;t.trustAccumulated=(t.trustAccumulated||0)+1;
      event(sim,'Объявлена промежуточная уступка',`По пункту «${q}» объявлена поэтапная формула. Умеренная часть движения получает аргумент за продолжение переговоров.`,'info',t.id);
    }else if(choice==='reject'){
      s.crowdAnger=clamp(anger+12,0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+45,0,s.cityPopulation||5000);t.walkoutRisk=clamp((t.walkoutRisk||0)+12,0,100);
      event(sim,'Отказ правительства вызвал реакцию улицы',`Пункт «${q}» отклонён. Организаторы обсуждают более жёсткую позицию; радикальное крыло получает аргументы для давления.`,'warning',t.id);
    }else if(choice==='delay'){
      s.crowdAnger=clamp(anger+4,0,1000);t.walkoutRisk=clamp((t.walkoutRisk||0)+5,0,100);
      event(sim,'Затягивание ответа замечено участниками',`По пункту «${q}» кабинет запросил дополнительное время. Следующий срок записан в протоколе; риск ультиматума вырос.`,'warning',t.id);
    }
  }
  function resolveCustomDecision(sim,id,choice,automatic=false){
    const s=sim.state;init(s);const d=(s.v9Decisions||[]).find(x=>x.id===id&&['queued','pending'].includes(x.status));if(!d)return false;
    d.status=automatic?'timed-out':'resolved';d.choice=choice;d.resolvedAt=nowOf(s);d.automatic=automatic;if(s.v9CurrentDecisionId===id)s.v9CurrentDecisionId=null;
    const t=d.trackId?s.negotiationTracks.find(x=>x.id===d.trackId):null;if(t&&t.pendingDecisionId===id)t.pendingDecisionId=null;
    const overlay=document.getElementById('v9-modal-overlay');if(overlay&&overlay.dataset.decisionId===id)overlay.remove();
    if(d.type==='v10-counteroffer'&&t)resolveCounteroffer(sim,t,d,choice,automatic);
    else if(d.type==='v10-ultimatum'&&t)resolveUltimatum(sim,t,d,choice,automatic);
    else if(d.type==='v10-ratification'&&t)resolveRatification(sim,t,d,choice,automatic);
    else if(d.type==='v10-election-coalition')resolveElectionCoalition(sim,d,choice,automatic);
    else if(d.type==='v10-no-confidence')resolveNoConfidence(sim,d,choice,automatic);
    else if(d.type==='v10-referendum')resolveReferendumLaunch(sim,d,choice,automatic);
    else if(d.type==='v10-package'&&t)resolvePackage(sim,t,d,choice,automatic);
    normalisePromises(s);archiveClosed(s);syncTracks(s);api.renderDecision?.(sim);oldRender(s,true);renderArchive(s);renderCivic(s);decorateModal(sim);sim._notify?.('update');return true;
  }
  function queueFinalUltimatum(sim,t,q){
    const now=nowOf(sim.state);t.stage='ultimatum';t.ultimatumDeadline=now+90;t.status='Делегация выставила финальный ультиматум';
    queueCustom(sim,'ultimatum',{trackId:t.id,kicker:'УЛЬТИМАТУМ · КРАЙНИЙ СРОК 90 МИНУТ',title:`Финальная позиция: ${t.topic}`,speaker:t.party,body:`Делегация требует ответа по пункту «${q}». Срок — 90 игровых минут. Если ответа, который можно ратифицировать, не будет, переговоры будут сорваны и участники пересмотрят дальнейшие действия.`,timeout:90,defaultChoice:'stand',payload:{trackId:t.id,question:q},choices:[['accept','Принять ключевую уступку','Снять ультиматум и зарегистрировать условное обязательство.'],['shuttle','Запросить срочное посредничество','Дать одну последнюю паузу и письменный пакет посредника.'],['stand','Не уступать','Ультиматум истекает без согласия; делегация покинет стол.']]});
    event(sim,'Выставлен переговорный ультиматум',`По теме «${t.topic}» срок ответа — 90 игровых минут. Идёт обратный отсчёт; отсутствие согласия будет иметь последствия.`,'warning',t.id);
  }
  function detectCounteroffers(sim){
    const s=sim.state,now=nowOf(s);for(const t of s.negotiationTracks||[]){if(t.closed)continue;const count=t.rejectedTopics?.length||0;const seen=Number(t.v10SeenRejected)||0;if(count<=seen){t.v10SeenRejected=Math.max(seen,count);continue;}t.v10SeenRejected=count;if(t.stage!=='agenda'||t.pendingDecisionId||t.pendingActorResponse)continue;const q=t.rejectedTopics[count-1]||t.topic;if(count>=3||(t.walkoutRisk||0)>=58){t.v10CounterRejected=(t.v10CounterRejected||0)+1;queueFinalUltimatum(sim,t,q);}else queueCounteroffer(sim,t,q);}
  }
  function resolveCounteroffer(sim,t,d,choice,automatic){
    const s=sim.state,now=nowOf(s),q=d.payload?.question||t.currentCounteroffer?.question||t.topic;
    if(choice==='accept'||choice==='compromise'){
      const list=choice==='accept'?t.acceptedTopics:(t.partialTopics||(t.partialTopics=[]));list.push(q);
      const p=api.createPromise(sim,t,choice==='accept'?q:`Промежуточная сделка: ${q}`,choice);if(p){p.status='provisional';p.counteroffer=true;}
      applyStreetEffect(sim,t,choice,q);t.walkoutRisk=Math.max(0,(t.walkoutRisk||0)-10);record(sim,t,'government','Правительство',choice==='accept'?`Встречный пакет принят: ${q}. Обязательство предварительное до ратификации.`:`Согласована промежуточная формула по пункту «${q}»; спорная часть остаётся открытой.`,choice==='accept'?'success':'info');
      t.stage='agenda';t.status=choice==='accept'?'Встречный пункт согласован':'Встречный пункт принят частично';t.nextAt=now+(t.format==='mediated'?24:14);t.endAt=Math.max(t.endAt||now,now+40);t.currentCounteroffer=null;
    }else if(choice==='shuttle'){
      t.mediatorRounds=(t.mediatorRounds||0)+1;t.openingBias=(t.openingBias||0)+6;t.trustAccumulated=(t.trustAccumulated||0)+3;t.walkoutRisk=Math.max(0,(t.walkoutRisk||0)-7);
      record(sim,t,'mediator',t.mediator||'Независимый посредник',`Закрытый обмен позициями №${t.mediatorRounds}. Посредник предложил пакет: ${concreteCounteroffer(t,q)} Стороны получают дополнительное время; следующий раунд будет назначен после консультаций.`,'info');
      t.stage='agenda';t.status='Посредник проводит shuttle diplomacy';t.nextAt=now+60;t.endAt=Math.max(t.endAt||now,now+90);t.currentCounteroffer=null;event(sim,'Посредник приостановил открытый раунд',`По линии «${t.topic}» проводится закрытый обмен позициями; следующий раунд через 60 игровых минут.`,'info',t.id);
    }else{
      t.v10CounterRejected=(t.v10CounterRejected||0)+1;t.walkoutRisk=clamp((t.walkoutRisk||0)+25,0,100);t.currentCounteroffer=null;queueFinalUltimatum(sim,t,q);
    }
  }
  function resolveUltimatum(sim,t,d,choice,automatic){
    const s=sim.state,now=nowOf(s),q=d.payload?.question||t.topic;
    if(choice==='accept'){
      t.acceptedTopics.push(q);const p=api.createPromise(sim,t,q,'accept');if(p)p.status='provisional';t.ratified=false;t.stage='agenda';t.status='Ультиматум снят уступкой кабинета';t.nextAt=now+25;t.walkoutRisk=Math.max(0,(t.walkoutRisk||0)-20);applyStreetEffect(sim,t,'accept',q);record(sim,t,'government','Правительство',`В последнюю минуту принято требование делегации: ${q}. Пункт подлежит ратификации вместе с пакетом.`,'success');
    }else if(choice==='shuttle'){
      t.mediatorRounds=(t.mediatorRounds||0)+1;t.openingBias=(t.openingBias||0)+10;t.stage='agenda';t.status='Ультиматум приостановлен посредником';t.nextAt=now+45;t.walkoutRisk=Math.max(0,(t.walkoutRisk||0)-10);record(sim,t,'mediator',t.mediator||'Независимый посредник','Посредник добился короткой паузы и оформляет последнюю общую формулу.','info');
    }else{
      t.v10Walkout=true;t.v10RatificationFailed=true;t.v10RatificationReason='Делегация покинула переговоры после ультиматума';t.status='Делегация покинула переговоры';t.closed=true;t.stage='complete';cancelProvisional(s,t);t.result={outcome:'Делегация покинула переговоры после ультиматума',agreedTopics:t.acceptedTopics.length,partialTopics:t.partialTopics.length,rejectedTopics:t.rejectedTopics.length,topicsDiscussed:t.round,obligations:0,finishedAt:now,reason:'ультиматум отвергнут'};s.crowdAnger=clamp((s.crowdAnger||0)+25,0,1000);s.mobilizationSurge=clamp((s.mobilizationSurge||0)+90,0,s.cityPopulation||5000);s.tension=clamp((s.tension||0)+5,0,100);record(sim,t,'party',t.party,'Делегация официально выходит из переговоров. Умеренная группа отозвала мандат, радикальное крыло усилило давление.','warning');event(sim,'Переговоры сорваны ультиматумом',`${t.topic}: сторона покинула стол, публичные обязательства не ратифицированы.`,'critical',t.id);
    }
  }
  function resolveRatification(sim,t,d,choice,automatic){
    const s=sim.state,now=nowOf(s);const accepted=t.acceptedTopics.length,partial=t.partialTopics.length,rejected=t.rejectedTopics.length;
    if(choice==='referendum'){
      const issue=`Ратификация соглашения «${t.topic}» между правительством и ${t.party}`;const started=sim.startReferendum?.(issue);
      if(!started){t.status='Ратификация приостановлена: другое голосование уже идёт';event(sim,'Референдум не назначен','Другое голосование ещё не завершено; можно повторить решение позже.','warning',t.id);t.stage='ratification';return;}
      s.referendum.v10NegotiationId=t.id;s.referendum.v10Issue='negotiation';t.stage='referendum';t.status='Соглашение вынесено на референдум';t.referendumStartedAt=now;event(sim,'Соглашение вынесено на референдум',`По линии «${t.topic}» началось трёхдневное голосование. Обязательства остаются предварительными до результата.`,'info',t.id);return;
    }
    if(choice==='conditional'){
      t.ratified=true;t.v10Conditional=true;t.ratifiedAt=now;t.factions={moderates:{vote:'за условный пакет',share:Math.round(clamp(42+accepted*8+partial*5,5,95))},radicals:{vote:'за повторные гарантии',share:100-Math.round(clamp(42+accepted*8+partial*5,5,95))}};promotePromises(s,t);event(sim,'Условная ратификация подписана',`По линии «${t.topic}» вступают в силу согласованные пункты. Спорные положения остаются открытыми и получат дату повторного рассмотрения.`,'success',t.id);api.finishTrack(sim,t);if(t.result)t.result.outcome='Условное соглашение ратифицировано; спорные пункты остаются открытыми';return;
    }
    if(choice==='reject'){
      t.v10RatificationFailed=true;t.v10RatificationReason='Стороны не ратифицировали итоговый пакет';api.finishTrack(sim,t,'declined');return;
    }
    const anger=clamp((s.crowdAnger||0)/10,0,100),radical=clamp(s.v6Radicalization||0,0,100),trust=clamp(s.trust??50,0,100);
    const delegateSupport=clamp(44+accepted*8+partial*3-rejected*6+(trust-50)*.23-radical*.22-(t.v10CounterRejected||0)*7+(t.concessionLevel||0)*1.2+(t.mediatorRounds||0)*2,5,95);
    const seats=s.v10Parliament.seats;let parliamentSupport=(seats.cabinet||0)+(s.v10Parliament.coalition?.includes('регион')?(seats.regional||0):0)+(s.v10Parliament.coalition?.includes('труд')?(seats.labour||0):0);
    if(trackKind(t)==='election'||/закон|бюджет|полномоч|выбор/i.test(t.topic))parliamentSupport-=Math.max(0,(seats.opposition||0)*.12);
    const parliamentShare=clamp(parliamentSupport/2,0,100),support=clamp(delegateSupport*.78+parliamentShare*.22,0,100);const passed=support>=50;
    t.factions={moderates:{vote:passed?'за соглашение':'за повторные гарантии',share:Math.round(delegateSupport)},radicals:{vote:passed?'против части пакета':'против соглашения',share:100-Math.round(delegateSupport)},parliament:{support:Math.round(parliamentShare)}};
    t.ratificationVote={at:now,support:Math.round(support),delegateSupport:Math.round(delegateSupport),parliamentSupport:Math.round(parliamentShare),passed};
    if(passed){t.ratified=true;t.ratifiedAt=now;promotePromises(s,t);s.trust=clamp((s.trust||50)+2,0,100);event(sim,'Ратификация прошла',`За пакет проголосовали умеренная часть делегации и парламентская поддержка. Модельная поддержка: ${Math.round(support)}%. Радикальное крыло сохраняет отдельные возражения.`,'success',t.id);api.finishTrack(sim,t);if(t.result)t.result.outcome='Соглашение ратифицировано после голосования делегации и парламента';}
    else{t.v10RatificationFailed=true;t.v10RatificationReason='Соглашение провалило ратификацию: умеренные не собрали большинство';cancelProvisional(s,t);event(sim,'Ратификация сорвалась из-за раскола делегации',`За пакет выступили ${Math.round(delegateSupport)}% умеренной делегации; парламентская поддержка — ${Math.round(parliamentShare)}%. Радикальное крыло блокировало утверждение.`,'warning',t.id);api.finishTrack(sim,t,'declined');}
  }
  function resolvePackage(sim,t,d,choice,automatic){
    const s=sim.state,now=nowOf(s);
    if(choice==='reject'){t.walkoutRisk=clamp((t.walkoutRisk||0)+10,0,100);s.crowdAnger=clamp((s.crowdAnger||0)+5,0,1000);event(sim,'Пакетная сделка не предложена',`Правительство отказалось связывать пункты в единый пакет по линии «${t.topic}».`,'warning',t.id);return;}
    const type=choice==='workers'?'социальный пакет и индексация':choice==='council'?'переходный мандат и парламентский надзор':'пакет взаимных уступок с аудитом и контрольными сроками';
    t.packageOffer={name:type,at:now,condition:choice==='workers'?'выплата второй части индексации после проверки бюджета и паузы забастовки':choice==='council'?'полномочия совета действуют при совместном контроле служб и календаре выборов':'финансирование следующего этапа только после независимой проверки предыдущего этапа'};
    t.openingBias=(t.openingBias||0)+9;t.concessionLevel=(t.concessionLevel||0)+3;t.trustAccumulated=(t.trustAccumulated||0)+2;t.walkoutRisk=Math.max(0,(t.walkoutRisk||0)-8);s.crowdAnger=clamp((s.crowdAnger||0)-8,0,1000);s.mobilizationSurge=Math.max(0,(s.mobilizationSurge||0)-20);
    record(sim,t,'government','Правительство',`Предложена пакетная сделка «${type}». Связующее условие: ${t.packageOffer.condition}. Принятие одного пункта усиливает вероятность исполнения связанного пункта, но срыв условия приостанавливает следующий этап.`,'info');event(sim,'Подготовлена связанная пакетная сделка',`${t.topic}: ${t.packageOffer.condition}`,'info',t.id);
  }
  function resolveElectionCoalition(sim,d,choice,automatic){
    const s=sim.state,p=s.v10Parliament,seats=p.seats;let name='',support=0;
    if(choice==='unity'){name='Кабинет + региональная группа';support=seats.cabinet+seats.regional;}
    else if(choice==='reform'){name='Оппозиция + трудовая и региональная группы';support=seats.opposition+seats.labour+seats.regional;}
    else if(choice==='recount'){s.v10ElectionCycle.phase='recount';s.v10ElectionCycle.electionAt=nowOf(s)+360;event(sim,'Назначен повторный подсчёт',`Спорные участки проверяются 360 игровых минут; коалиция пока не утверждена.`,'warning');return;}
    else{name='Кабинет меньшинства';support=seats.cabinet;}
    p.coalition=name;p.confidence=support>=101?'majority':'minority';p.lastVote={at:nowOf(s),type:'coalition',choice,support,seats:200};
    if(choice==='reform'&&support>=101){s.approval=clamp((s.approval||50)+2,0,100);s.trust=clamp((s.trust||50)+3,0,100);s.stability=clamp((s.stability||50)+2,0,100);s.stateMode='Коалиционное правительство';s.stateModeCode='coalition';}
    else if(support<101){s.stability=clamp((s.stability||50)-4,0,100);s.publicAnger=clamp((s.publicAnger||0)+5,0,100);}
    else{s.stability=clamp((s.stability||50)+3,0,100);s.trust=clamp((s.trust||50)+2,0,100);}
    s.v10ElectionCycle.phase='formed';s.v10ElectionCycle.formedAt=nowOf(s);s.v10ElectionCycle.coalition=name;
    issueLog(s,'Формирование кабинета после выборов',name,`Коалиция: ${name}. Поддержка: ${support}/200 мест. ${support>=101?'Большинство сформировано.':'Большинства нет; новый вотум доверия потребуется в ближайшем парламентском цикле.'}`);
    event(sim,support>=101?'Парламентское большинство сформировано':'Парламент зашёл в тупик',`${name}: ${support}/200 мест.` ,support>=101?'success':'warning');
  }
  function resolveNoConfidence(sim,d,choice,automatic){
    const s=sim.state,p=s.v10Parliament,seats=p.seats,now=nowOf(s);p.nextConfidenceAt=now+1440;
    if(choice==='cancel'){event(sim,'Вотум недоверия снят с повестки','Заседание перенесено; парламентская поддержка кабинета остаётся под наблюдением.','info');return;}
    const opposing=(seats.opposition||0)+(seats.labour||0)+(p.coalition?.includes('регион')?0:(seats.regional||0));
    const support=clamp(opposing+(50-(s.approval||50))*.28+(50-(s.trust||50))*.18+(s.v10ElectionCycle.phase==='minority'?8:0),0,200);const passed=support>=101;
    p.lastVote={at:now,type:'no-confidence',support:Math.round(support),passed};
    if(passed){p.confidence='lost';p.coalition='Распущенная коалиция';s.stability=clamp((s.stability||50)-9,0,100);s.approval=clamp((s.approval||50)-3,0,100);s.trust=clamp((s.trust||50)-2,0,100);s.v10ElectionCycle={...s.v10ElectionCycle,phase:'coalition',electionAt:now+240,calledAt:now,reason:'вотум недоверия'};event(sim,'Вотум недоверия прошёл',`За отставку кабинета модельно выступили ${Math.round(support)}/200 депутатов. Старое большинство распалось; начались коалиционные консультации.`,'critical');queueCustom(sim,'election-coalition',{kicker:'ПАРЛАМЕНТСКИЙ КРИЗИС',title:'Сформировать новый кабинет',speaker:'Правительство утратило доверие парламента.',body:'Выберите большинство, кабинет меньшинства или повторный подсчёт / дополнительную процедуру. До формирования большинства устойчивость и управляемость снижены.',timeout:180,defaultChoice:'reform',choices:[['unity','Собрать кабинет + региональную группу','Попытаться сохранить прежний политический курс с новыми обязательствами.'],['reform','Сформировать альтернативную коалицию','Оппозиция, трудовая и региональные фракции предлагают новый кабинет.'],['minority','Оставить кабинет меньшинства','Продолжить временно без гарантированного большинства.'],['recount','Продлить переговоры и повторить голосование','Отложить распределение постов до дополнительной проверки.']]});}
    else{p.confidence='retained';s.stability=clamp((s.stability||50)+1,0,100);event(sim,'Вотум недоверия отклонён',`Предлагаемая коалиция за отставку набрала ${Math.round(support)}/200 голосов. Кабинет сохраняет мандат, но должен учитывать зарегистрированные претензии.`,'success');}
  }
  function resolveReferendumLaunch(sim,d,choice,automatic){
    if(choice==='cancel'){event(sim,'Референдум не назначен','Инициатива возвращена в парламентскую повестку.','info');return;}
    const s=sim.state;const track=d.payload?.trackId?s.negotiationTracks.find(t=>t.id===d.payload.trackId):null;const issue=track?`Ратификация соглашения «${track.topic}»`:(d.payload?.issue||'Референдум по спорному пакету государственной политики');
    if(!sim.startReferendum?.(issue)){event(sim,'Референдум не назначен','Уже идёт другое голосование. Завершите текущую процедуру перед новой кампанией.','warning',track?.id);return;}
    if(track){s.referendum.v10NegotiationId=track.id;track.stage='referendum';track.status='Соглашение вынесено на референдум';}
    s.referendum.v10Issue='negotiation';event(sim,'Референдум назначен',`${issue}. Голосование завершится через три модельных дня.`, 'info',track?.id);
  }
  function resolveCustomDecisionWrapper(sim,id,choice,automatic=false){return resolveCustomDecision(sim,id,choice,automatic);}
  function checkReferendum(sim){
    const s=sim.state,r=s.referendum;if(!r||r.status==='open'||!r.v10NegotiationId)return;
    const t=[...(s.negotiationTracks||[]),...(s.negotiationArchive||[])].find(x=>x.id===r.v10NegotiationId);if(!t||t.closed||t.stage!=='referendum')return;
    if(r.status==='passed'){t.ratified=true;t.ratifiedAt=nowOf(s);promotePromises(s,t);event(sim,'Референдум ратифицировал соглашение',`Избиратели поддержали пакет «${t.topic}»; предварительные обязательства переходят в реестр исполнения. Явка ${Math.round(r.turnout||0)}%, поддержка ${Math.round(r.support||0)}%.`,'success',t.id);api.finishTrack(sim,t);if(t.result)t.result.outcome='Соглашение ратифицировано референдумом';}
    else{t.v10RatificationFailed=true;t.v10RatificationReason='Референдум отклонил итоговый пакет';cancelProvisional(s,t);event(sim,'Референдум отклонил соглашение',`Пакет «${t.topic}» не набрал большинства; делегации должны вернуться к консультациям или закрыть канал.`,'warning',t.id);api.finishTrack(sim,t,'declined');}
  }
  function processPoliticalLog(sim){
    const s=sim.state;init(s);const seen=new Set(s.v10ProcessedPoliticalIds);
    for(const e of s.politicalDecisionLog||[]){if(!e||seen.has(String(e.id)))continue;seen.add(String(e.id));
      if(e.event==='election'&&e.choice==='early'&&s.v10ElectionCycle.phase==='none'){
        const now=nowOf(s);s.v10ElectionCycle={phase:'campaign',electionsCalledAt:now,electionAt:now+1440,history:s.v10ElectionCycle.history||[]};s.v10Parliament.confidence='campaign';
        event(sim,'Началась избирательная кампания',`Досрочные выборы назначены через 24 игровых часа. Запущены регистрация списков, кампания, дебаты и проверка правил подсчёта.`,'warning');
      }
    }
    s.v10ProcessedPoliticalIds=[...seen].slice(-180);
  }
  function conductElection(sim){
    const s=sim.state,cycle=s.v10ElectionCycle,p=s.v10Parliament,now=nowOf(s);if(!['campaign','recount'].includes(cycle.phase)||now<(Number.isFinite(Number(cycle.electionAt))?Number(cycle.electionAt):Infinity))return;
    const approval=clamp(s.approval??50,0,100),trust=clamp(s.trust??50,0,100),anger=clamp((s.crowdAnger||0)/1000,0,1),media=clamp(s.policies?.mediaFreedom??50,0,100);
    let govtShare=.42+(approval-50)*.004+(trust-50)*.0015-anger*.13+(media-50)*.0008+(Math.random()-.5)*.045;govtShare=clamp(govtShare,.18,.64);
    const cabinet=Math.round(govtShare*200),remainder=200-cabinet,labour=clamp(Math.round(remainder*(.18+anger*.10)),8,48),regional=clamp(Math.round(remainder*.16),8,40),opposition=200-cabinet-labour-regional;
    p.seats={cabinet,opposition:Math.max(0,opposition),labour,regional};p.lastElection={at:now,seats:{...p.seats},approval,trust,turnout:Math.round(clamp(52+Math.abs(approval-50)*.35+anger*16,25,91))};cycle.history=cycle.history||[];cycle.history.unshift(p.lastElection);cycle.phase='coalition';cycle.resultsAt=now;p.confidence='pending coalition';
    event(sim,'Голосование завершено: опубликованы предварительные места',`Кабинет ${cabinet}, оппозиция ${p.seats.opposition}, трудовая группа ${labour}, регионы ${regional}. Явка ${p.lastElection.turnout}%. Ни одна партия не получает автоматического права править: начинается торговля о коалиции.`,'info');
    queueCustom(sim,'election-coalition',{kicker:'ПОСЛЕ ВЫБОРОВ · КОАЛИЦИОННЫЕ ТОРГИ',title:'Сформировать парламентское большинство',speaker:'Избирательная комиссия опубликовала распределение 200 мест.',body:`Кабинет: ${cabinet}; оппозиция: ${p.seats.opposition}; трудовая группа: ${labour}; региональные делегации: ${regional}. Для устойчивого большинства нужно не менее 101 места. Выберите направление коалиционных переговоров.`,timeout:240,defaultChoice:'unity',choices:[['unity','Кабинет + региональная группа','Сделка о финансировании регионов и умеренной реформе управления.'],['reform','Оппозиция + трудовая и региональная группы','Альтернативный кабинет, новая программа и контроль парламента.'],['minority','Кабинет меньшинства','Продолжить без большинства; вотум доверия будет нестабилен.'],['recount','Оспорить подсчёт спорных участков','Назначить дополнительную проверку до окончательного распределения мест.']]});
  }
  function advanceCivic(sim,now){
    const s=sim.state,m=s.v10Media,c=s.v10Crowd;
    if(m.pressTeams&&now>=m.pressExpiresAt){m.pressTeams=0;event(sim,'Редакции завершили работу на площади','Аккредитация текущих групп истекла; видеозаписи и протоколы остаются в публичном архиве.','info');}
    if(m.streamers&&now>=m.streamExpiresAt){m.streamers=0;event(sim,'Прямые эфиры завершились','Онлайн-эфиры закончены; уже опубликованные записи продолжают влиять на общественное мнение.','info');}
    if(c.stewards&&now>=c.stewardsExpireAt){c.stewards=0;event(sim,'Смена распорядителей завершила дежурство','Добровольцы передали следующей смене схему проходов и журнал инцидентов.','info');}
    if(c.observers&&now>=c.observersExpireAt)c.observers=0;
    if(now>=(c.chorusUntil||0))c.chorusUntil=0;if(c.chainUntil&&now>=c.chainUntil){c.chainUntil=0;if(c.v10SetCorridor){s.emergencyCorridor=!!c.priorEmergencyCorridor;c.v10SetCorridor=false;}}
    if(c.chainUntil>now){s.roadBlockage=clamp((s.roadBlockage||0)-.0008,0,.98);s.tension=clamp((s.tension||0)-.015,0,100);}
    if(c.stewards>0&&!((s.incidents||[]).some(i=>i.status!=='resolved'&&['riot','clash','arson','looting','building_assault'].includes(i.type)))){
      s.v6Radicalization=clamp((s.v6Radicalization||0)-.006,0,100);s.crowdAnger=clamp((s.crowdAnger||0)-.03,0,1000);
    }
    if(c.observers>0){s.trust=clamp((s.trust||50)+.001,0,100);}
  }
  function executeCivicAction(sim,action){
    const s=sim.state,m=s.v10Media,c=s.v10Crowd,now=nowOf(s);init(s);
    switch(action){
      case'press':m.pressTeams=2;m.pressExpiresAt=now+360;m.lastAction='две редакционные группы на площади';event(sim,'Пресса прибыла на площадь','Две редакционные группы получили зону безопасной съёмки и прямой доступ к публичным брифингам. Камеры повышают вероятность публичной проверки спорных действий сил и снижают риск непропорционального применения силы.','info');break;
      case'stream':m.streamers=3;m.streamExpiresAt=now+240;m.lastAction='три независимых прямых эфира';m.viralCalls=(m.viralCalls||0)+1;s.media=s.media||{viralLevel:0,stories:[]};s.media.viralLevel=clamp((s.media.viralLevel||0)+12,0,100);event(sim,'Запущены независимые прямые эфиры','Три стримера ведут трансляцию с разных участков. Инциденты быстрее попадают в национальную ленту; дезинформацию сложнее скрыть, но ошибочные слухи тоже могут быстро распространяться.','info');break;
      case'viral':m.viralCalls=(m.viralCalls||0)+1;m.lastAction='виральный призыв движения';s.mobilizationSurge=clamp((s.mobilizationSurge||0)+360,0,s.cityPopulation||5000);s.crowdAnger=clamp((s.crowdAnger||0)+7,0,1000);s.v6Organization=clamp((s.v6Organization||0)+5,0,100);s.media=s.media||{viralLevel:0,stories:[]};s.media.viralLevel=clamp((s.media.viralLevel||0)+20,0,100);event(sim,'Виральный призыв запущен движением','Организаторы публикуют конкретную повестку, время сбора и инструкции по ненасильственному поведению. Явка увеличится в ближайшие игровые часы; реакция зависит от доверия к источнику.','warning');break;
      case'chorus':c.chorusUntil=now+180;s.v6Organization=clamp((s.v6Organization||0)+13,0,100);s.crowdFatigue=clamp((s.crowdFatigue||0)-5,0,100);s.v10Crowd.chorusActive=true;event(sim,'Толпа организовала совместное скандирование','Хор укрепляет координацию и видимую солидарность. При спокойном взаимодействии растёт способность поддерживать общую повестку; сам по себе хор не создаёт автоматического столкновения.','info');break;
      case'chain':c.chainUntil=now+180;c.priorEmergencyCorridor=!!s.emergencyCorridor;c.v10SetCorridor=true;c.observers=Math.max(c.observers||0,2);c.observersExpireAt=Math.max(c.observersExpireAt||0,now+180);s.emergencyCorridor=true;s.roadBlockage=clamp((s.roadBlockage||0)-.06,0,.98);s.tension=clamp((s.tension||0)-2,0,100);event(sim,'Создана живая цепь и коридор для служб','Распорядители оставили проходы для скорой и пожарной техники. Эффект сохраняется три игровых часа, если коридор не разрушен новым инцидентом.','success');break;
      case'stewards':c.stewards=Math.max(c.stewards||0,4);c.stewardsExpireAt=now+360;c.observers=Math.max(c.observers||0,2);c.observersExpireAt=Math.max(c.observersExpireAt||0,now+360);s.v6Organization=clamp((s.v6Organization||0)+6,0,100);event(sim,'Добровольные распорядители вышли на дежурство','Четыре группы координируют проходы, зовут медиков и фиксируют провокации. Они не заменяют полицию, но уменьшают риск хаотического поведения и помогают выводить людей из опасных зон.','success');break;
      case'observers':c.observers=4;c.observersExpireAt=now+360;s.investigationOpen=true;s.trust=clamp((s.trust||50)+1,0,100);event(sim,'Создана гражданская группа наблюдения','Наблюдатели фиксируют инциденты и передают материалы независимой комиссии. Их задача — документирование и деэскалация, а не силовое вмешательство.','info');break;
    }
    m.lastActionAt=now;sim._notify?.('update');renderCivic(s);return true;
  }
  function triggerNoConfidence(sim){
    const s=sim.state;queueCustom(sim,'no-confidence',{kicker:'ПАРЛАМЕНТСКИЙ КОНТРОЛЬ',title:'Вынести вотум недоверия правительству?',speaker:'Предложение передано в парламентскую повестку.',body:'Вотум проходит по реальному модельному распределению 200 мест. Если оппозиционная коалиция собирает 101 голос, кабинет теряет мандат и начинается формирование нового большинства. При провале кабинет получает краткий стабилизационный эффект.',timeout:180,defaultChoice:'cancel',payload:{},choices:[['vote','Провести открытое голосование','Подсчитать места, учесть текущую коалицию и общественную поддержку.'],['cancel','Снять вопрос с повестки','Перенести заседание; текущее правительство продолжает работу.']]});
  }
  function launchReferendumPrompt(sim){queueCustom(sim,'referendum',{kicker:'ГРАЖДАНСКАЯ РАТИФИКАЦИЯ',title:'Какой пакет вынести на референдум?',speaker:'Избирательная комиссия может открыть одно голосование за раз.',body:'Референдум длится три модельных дня. Если он связан с переговорами, результат непосредственно ратифицирует или отклоняет конкретное соглашение.',timeout:150,defaultChoice:'package',payload:{},choices:[['package','Голосование по текущему общественно-политическому пакету','Вопрос о принятии спорного пакета государственной политики.'],['cancel','Не назначать голосование','Вернуться к парламентской и переговорной процедурам.']]});}
  function renderCivic(s){
    const root=document.getElementById('v10-civic-panel');if(!root)return;init(s);const now=nowOf(s),m=s.v10Media,c=s.v10Crowd,p=s.v10Parliament,cycle=s.v10ElectionCycle;
    const press=root.querySelector('#v10-media-status');if(press)press.textContent=`Пресса: ${m.pressTeams||0} группы · прямые эфиры: ${m.streamers||0} · виральных призывов: ${m.viralCalls||0}. ${m.pressTeams?`Аккредитация истекает через ${Math.max(0,m.pressExpiresAt-now)} мин.`:'На площадь можно пригласить редакции.'}`;
    const crowd=root.querySelector('#v10-crowd-status');if(crowd)crowd.textContent=`Распорядители: ${c.stewards||0} · наблюдатели: ${c.observers||0} · хор: ${c.chorusUntil>now?'активен':'не активен'} · живая цепь: ${c.chainUntil>now?'держит коридор':'не активна'}.`;
    const parliament=root.querySelector('#v10-parliament-status');if(parliament){const x=p.seats;parliament.replaceChildren();const h=document.createElement('strong');h.textContent=`Парламент · ${p.coalition||'коалиция не утверждена'} · ${p.confidence==='majority'?'большинство':p.confidence==='minority'?'кабинет меньшинства':p.confidence}`;parliament.append(h);const rows=[['Кабинет',x.cabinet,'cabinet'],['Оппозиция',x.opposition,'opposition'],['Трудовая группа',x.labour,'labour'],['Регионы',x.regional,'regional']];for(const [label,n,key] of rows){const row=document.createElement('div');row.className='v10-seat-row';const name=document.createElement('span');name.textContent=label;const bar=document.createElement('div');bar.className='v10-seat-track';const fill=document.createElement('i');fill.style.width=`${clamp(n/200*100,0,100)}%`;bar.append(fill);const num=document.createElement('strong');num.textContent=String(n);row.append(name,bar,num);parliament.append(row);}const footer=document.createElement('small');footer.textContent=`Большинство: 101/200 мест. ${cycle.phase==='campaign'?`Выборы через ${Math.max(0,(cycle.electionAt||now)-now)} игровых минут.`:cycle.phase==='coalition'?'Идут переговоры о коалиции.':cycle.phase==='formed'?'Кабинет сформирован после парламентских торгов.':'Досрочные выборы запускаются из политического календаря.'}`;parliament.append(footer);}
    const pressOverlay=document.getElementById('v10-press-overlay');if(pressOverlay){pressOverlay.hidden=!(m.pressTeams||m.streamers);pressOverlay.querySelector('.v10-press-label').textContent=`ПРЕССА НА ПЛОЩАДИ · ${m.pressTeams||0} РЕДАКЦИИ · ${m.streamers||0} ЭФИРА`;}
  }
  function injectCivicPanel(){
    const diplomacy=document.getElementById('v9-diplomacy-panel');if(!diplomacy)return;let root=document.getElementById('v10-civic-panel');
    if(!root){root=document.createElement('section');root.id='v10-civic-panel';root.className='v10-civic-panel';root.innerHTML=`<div class="v10-civic-head"><div><span class="v9-kicker">03Б / ПОЛИТИКА И ОБЩЕСТВЕННЫЕ ДЕЙСТВИЯ</span><h2>Политический контур</h2><p>Выборы · парламент · пресса · самоорганизация граждан</p></div></div><div class="v10-civic-grid"><section><h3>Медиа и открытость</h3><p id="v10-media-status"></p><div class="v10-actions"><button data-v10-action="press">Пригласить прессу на площадь</button><button data-v10-action="stream">Организовать независимые эфиры</button><button data-v10-action="viral">Запустить виральный призыв</button></div></section><section><h3>Самоорганизация толпы</h3><p id="v10-crowd-status"></p><div class="v10-actions"><button data-v10-action="chorus">Организовать хор / скандирование</button><button data-v10-action="chain">Живая цепь и коридор служб</button><button data-v10-action="stewards">Сформировать распорядителей</button><button data-v10-action="observers">Гражданское наблюдение</button></div></section><section><h3>Парламент и выборы</h3><div id="v10-parliament-status" class="v10-parliament-status"></div><div class="v10-actions"><button data-v10-action="no-confidence">Вынести вотум недоверия</button><button data-v10-action="referendum">Назначить референдум</button></div></section></div>`;diplomacy.insertAdjacentElement('afterend',root);}
    const scene=document.querySelector('.scene-frame');if(scene&&!document.getElementById('v10-press-overlay')){const badge=document.createElement('div');badge.id='v10-press-overlay';badge.className='v10-press-overlay';badge.hidden=true;badge.innerHTML='<i class="v10-camera-silhouette"><b></b></i><span class="v10-press-label">ПРЕССА НА ПЛОЩАДИ</span>';scene.append(badge);}
    renderCivic(window.gameSimulation?.state||{});
  }
  function askPackage(sim,trackId){const t=sim.state.negotiationTracks.find(x=>x.id===trackId);if(!t||t.closed)return;queueCustom(sim,'package',{trackId:t.id,kicker:'ПАКЕТНАЯ СДЕЛКА · СВЯЗАННЫЕ УСТУПКИ',title:`Собрать пакет по теме «${t.topic}»`,speaker:`Делегация: ${t.party}`,body:'Пакет связывает несколько уступок и вводит зависимость исполнения: следующий этап открывается после проверки предыдущего. Это меняет доверие и готовность делегации принимать дальнейшие предложения.',timeout:150,defaultChoice:'balanced',payload:{trackId:t.id},choices:[['balanced','Аудит + этапное исполнение + контрольный срок','Каждая следующая уступка вступает в силу после независимой проверки предыдущей.'],['workers','Социальный пакет с паузой забастовки','Индексация и защита занятости связаны с временной паузой и голосованием членов профсоюза.'],['council','Переходный мандат + парламентский надзор','Полномочия совета действуют ограниченный срок и связаны с календарём выборов.'],['reject','Не предлагать пакет','Сохранить предметные пункты отдельными, не связывая их общей сделкой.']]});}
  function renderTrackPackageButtons(s){
    const panel=document.getElementById('v9-track-grid');if(!panel)return;
    for(const card of panel.querySelectorAll('.v9-track-card')){if(card.classList.contains('v9-track-closed'))continue;const id=card.querySelector('[data-v9-show-track]')?.dataset.v9ShowTrack;if(!id||card.querySelector('[data-v10-package]'))continue;const foot=card.querySelector('.v9-track-foot');if(!foot)continue;const b=document.createElement('button');b.type='button';b.className='v9-small-button';b.textContent='Пакетная сделка';b.dataset.v10Package=id;foot.append(b);}
  }
  function decorateModal(sim){
    const s=sim?.state;if(!s)return;const d=(s.v9Decisions||[]).find(x=>x.status==='pending'&&x.id===s.v9CurrentDecisionId);if(!d)return;
    if(!d.type?.startsWith('v10-')&&d.type!=='agenda')return;
    const overlay=document.getElementById('v9-modal-overlay');if(!overlay||overlay.dataset.decisionId!==d.id)return;
    const dialog=overlay.querySelector('.v9-modal-dialog');if(!dialog)return;
    const title=dialog.querySelector('#v9-modal-title');if(title)title.textContent=d.title;
    const speaker=dialog.querySelector('.v9-modal-speaker');if(speaker)speaker.textContent=d.speaker;
    const body=dialog.querySelector('.v9-modal-body');if(body)body.textContent=d.body;
    const choices=dialog.querySelector('.v9-modal-choices');if(!choices)return;
    const sig=`${d.id}|${JSON.stringify((d.choices||[]).map(c=>c.slice(0,2)))}|${d.type}`;if(choices.dataset.v10Signature===sig)return;choices.dataset.v10Signature=sig;choices.replaceChildren();
    for(const [value,label,desc] of d.choices||[]){const b=document.createElement('button');b.type='button';b.className='v9-modal-choice';const strong=document.createElement('strong');strong.textContent=label;const small=document.createElement('small');small.textContent=desc;b.append(strong,small);b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();api.resolveDecision(sim,d.id,value,false);});choices.append(b);}
  }
  function afterClick(){const sim=window.gameSimulation;if(!sim?.state)return;const s=sim.state;init(s);syncTracks(s);archiveClosed(s);normalisePromises(s);processPoliticalLog(sim);detectCounteroffers(sim);checkReferendum(sim);oldRender(s,true);renderArchive(s);renderTrackPackageButtons(s);renderCivic(s);s.v10LastRenderedPanelSignature=panelSignature(s);s.v10LastPanelRenderAt=nowOf(s);decorateModal(sim);}
  api.createTrack=function(sim,opts){init(sim.state);const t=oldCreateTrack(sim,opts);if(t){t.v10Kind=trackKind(t);t.v10AgendaVersion=0;}return t;};
  api.finishTrack=function(sim,t,reason){const ret=oldFinish(sim,t,reason);const s=sim.state;if(t?.v10Walkout&&t.result){t.result.outcome='Делегация покинула переговоры после ультиматума';t.status=t.result.outcome;cancelProvisional(s,t);}else if(t?.v10RatificationFailed&&t.result){t.result.outcome=t.v10RatificationReason||'Соглашение не прошло ратификацию';t.status=t.result.outcome;t.result.obligations=0;cancelProvisional(s,t);s.crowdAnger=clamp((s.crowdAnger||0)+12,0,1000);s.tension=clamp((s.tension||0)+3,0,100);s.trust=clamp((s.trust||50)-2,0,100);}else if(t?.ratified){promotePromises(s,t);}archiveClosed(s);normalisePromises(s);oldRender(s,true);renderArchive(s);return ret;};
  api.resolveDecision=function(sim,id,choice,automatic=false){const d=sim.state?.v9Decisions?.find(x=>x.id===id);if(d?.type?.startsWith('v10-'))return resolveCustomDecisionWrapper(sim,id,choice,automatic);const t=d?.trackId?sim.state.negotiationTracks.find(x=>x.id===d.trackId):null;const q=d?.type==='agenda'?(t?.agenda?.[t.agendaIndex]||d.title):null;const r=oldResolve(sim,id,choice,automatic);if(sim.state){if(d?.type==='agenda'&&t&&q)applyStreetEffect(sim,t,choice,q);init(sim.state);syncTracks(sim.state);archiveClosed(sim.state);normalisePromises(sim.state);processPoliticalLog(sim);checkReferendum(sim);oldRender(sim.state,true);renderArchive(sim.state);renderTrackPackageButtons(sim.state);renderCivic(sim.state);decorateModal(sim);}return r;};
  SP._updateReferendum=function(...args){const r=oldReferendum?.apply(this,args);if(this.state)checkReferendum(this);return r;};
  // A linked package is sequential: later obligations cannot be marked fulfilled before earlier stages.
  SP.fulfillPromise=function(id){
    const s=this.state||{},pr=(s.promises||[]).find(p=>p.id===id&&p.status==='pending');
    if(pr?.packageCondition&&pr.negotiationId){
      const t=[...(s.negotiationTracks||[]),...(s.negotiationArchive||[])].find(x=>x.id===pr.negotiationId);
      const siblings=(s.promises||[]).filter(p=>p.negotiationId===pr.negotiationId&&p.packageCondition);
      siblings.sort((a,b)=>(Number.isInteger(a.packageSequence)?a.packageSequence:Number.MAX_SAFE_INTEGER)-(Number.isInteger(b.packageSequence)?b.packageSequence:Number.MAX_SAFE_INTEGER)||Number(a.id)-Number(b.id));
      const own=Number.isInteger(pr.packageSequence)?pr.packageSequence:(t?.obligations||siblings.map(p=>p.id)).indexOf(pr.id);
      const blocked=siblings.filter(p=>{
        if(p.id===pr.id||p.status==='fulfilled')return false;
        const seq=Number.isInteger(p.packageSequence)?p.packageSequence:(t?.obligations||siblings.map(x=>x.id)).indexOf(p.id);
        return seq>=0&&seq<own;
      });
      if(own>0&&blocked.length){this._notify?.('toast',{message:`Пакетное условие не выполнено: сначала исполните предыдущий этап (${blocked[0].title}).`,tone:'warning'});event(this,'Следующий этап пакета заблокирован',`Обязательство «${pr.title}» ждёт исполнения предыдущего этапа «${blocked[0].title}».`,'warning',t?.id||null);return false;}
    }
    return oldFulfillPromise?oldFulfillPromise.call(this,id):false;
  };
  if(typeof oldUpdateStats==='function')UP.updateStats=function(...args){const r=oldUpdateStats.apply(this,args);const foot=document.querySelector('.app-footer span');if(foot)foot.textContent='КОНТУР // ВЕРСИЯ 10.0.0';return r;};
  // Versioned saves leave the prior browser slot untouched and migrate it only after the user explicitly loads it.
  UP.saveGame=function(automatic=false){
    try{localStorage.setItem('kontur-republic-save-v10',JSON.stringify(this.sim.snapshot()));this._lastSaveAt=new Date();const label=document.getElementById('last-save-label');if(label)label.textContent=`СОХРАНЕНО ${this._lastSaveAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;if(!automatic)this.toast('Игра сохранена','Состояние v10 записано в отдельный слот браузера. Старый слот не перезаписан.','success');return true;}
    catch(err){if(!automatic)this.toast('Не удалось сохранить',`Браузер не разрешил запись в localStorage: ${err.message}`,'error');return false;}
  };
  UP.loadGame=function(){
    try{let raw=localStorage.getItem('kontur-republic-save-v10'),migrated=false;if(!raw){raw=localStorage.getItem('kontur-republic-save-v2');migrated=!!raw;}if(!raw){this.toast('Сохранение не найдено','Сначала сохраните игру кнопкой со стрелкой вниз.','warning');return false;}
      this.sim.loadSnapshot(JSON.parse(raw));init(this.sim.state);syncTracks(this.sim.state);archiveClosed(this.sim.state);normalisePromises(this.sim.state);this.draft={...this.sim.state.policies};this._syncPolicyInputs();this.renderAll(true);oldRender(this.sim.state,true);renderArchive(this.sim.state);renderCivic(this.sim.state);
      if(migrated){localStorage.setItem('kontur-republic-save-v10',JSON.stringify(this.sim.snapshot()));}
      const label=document.getElementById('last-save-label');if(label)label.textContent=migrated?'ЗАГРУЖЕНО И МИГРИРОВАНО В v10':'ЗАГРУЖЕНО ИЗ БРАУЗЕРА';this.toast('Сохранение загружено',migrated?'Старый слот перенесён в v10; исходный слот оставлен нетронутым.':'Состояние игры восстановлено.','success');return true;
    }catch(err){this.toast('Ошибка загрузки',`Сохранение не удалось прочитать: ${err.message}`,'error');return false;}
  };
  function panelSignature(s){return `${(s.negotiationTracks||[]).map(t=>t.id+':'+t.stage+':'+t.agendaIndex+':'+t.status).join('|')}#${(s.negotiationArchive||[]).map(t=>t.id+':'+(t.result?.outcome||t.status)).join('|')}#${(s.v9Decisions||[]).filter(d=>['queued','pending'].includes(d.status)).map(d=>d.id+':'+d.status).join('|')}#${(s.politicalDecisionLog||[]).slice(0,4).map(e=>e.id).join('|')}`;}
  SP.tick=function(...args){init(this.state);const r=oldTick.apply(this,args);const s=this.state;init(s);const now=nowOf(s);if(!s.paused&&now!==s.v10LastAdvancedAt){s.v10LastAdvancedAt=now;processPoliticalLog(this);conductElection(this);advanceCivic(this,now);detectCounteroffers(this);checkReferendum(this);}
    syncTracks(s);archiveClosed(s);normalisePromises(s);renderDecisionSafe(this);const afterPanel=panelSignature(s);
    if(afterPanel!==s.v10LastRenderedPanelSignature||now-s.v10LastPanelRenderAt>=3){s.v10LastPanelRenderAt=now;s.v10LastRenderedPanelSignature=afterPanel;s.v9LastRenderAt=NaN;oldRender(s,true);renderArchive(s);renderTrackPackageButtons(s);renderCivic(s);}
    else renderArchive(s);decorateModal(this);return r;};
  function renderDecisionSafe(sim){try{if(!document.getElementById('v9-modal-overlay'))api.renderDecision?.(sim);}catch{}}
  function boot(){
    injectCivicPanel();const sim=window.gameSimulation;if(sim?.state){init(sim.state);syncTracks(sim.state);archiveClosed(sim.state);oldRender(sim.state,true);renderArchive(sim.state);renderTrackPackageButtons(sim.state);renderCivic(sim.state);decorateModal(sim);}
    document.addEventListener('click',e=>{
      const del=e.target.closest?.('[data-v10-delete-archive]');if(del){e.preventDefault();deleteArchiveEntry(window.gameSimulation.state,del.dataset.v10DeleteArchive);return;}
      const clear=e.target.closest?.('[data-v10-clear-archive]');if(clear){e.preventDefault();deleteArchiveEntry(window.gameSimulation.state,'*');return;}
      const view=e.target.closest?.('[data-v10-archive-view]');if(view){const s=window.gameSimulation?.state,t=s?.negotiationArchive?.find(x=>x.id===view.dataset.v10ArchiveView);if(t)showArchivedTrack(t);return;}
      const pack=e.target.closest?.('[data-v10-package]');if(pack){e.preventDefault();askPackage(window.gameSimulation,pack.dataset.v10Package);return;}
      const b=e.target.closest?.('[data-v10-action]');if(!b)return;const active=window.gameSimulation;if(!active)return;e.preventDefault();
      if(b.dataset.v10Action==='no-confidence'){triggerNoConfidence(active);return;}if(b.dataset.v10Action==='referendum'){launchReferendumPrompt(active);return;}
      executeCivicAction(active,b.dataset.v10Action);
    });
    document.addEventListener('click',()=>window.setTimeout(afterClick,0));
    const foot=document.querySelector('.app-footer span');if(foot)foot.textContent='КОНТУР // ВЕРСИЯ 10.0.0';
  }
  function showArchivedTrack(t){
    if(document.getElementById('v9-modal-overlay'))return;const rows=(t.transcript||[]).slice(-30);const overlay=document.createElement('div');overlay.id='v10-archived-detail-overlay';overlay.className='v9-modal-overlay';const d=document.createElement('section');d.className='v9-modal-dialog';const h=document.createElement('h2');h.textContent=t.topic||'Завершённые переговоры';const meta=document.createElement('p');meta.className='v9-modal-speaker';meta.textContent=`${t.party||'Делегация'} · ${t.result?.outcome||t.status||'завершены'} · обязательств: ${t.obligations?.length||0}`;const body=document.createElement('div');body.className='v9-modal-body';body.textContent=`Результат: ${t.result?.outcome||'не зафиксирован'}. Полностью согласовано ${t.result?.agreedTopics??t.acceptedTopics?.length??0}, частично ${t.result?.partialTopics??t.partialTopics?.length??0}, отклонено ${t.result?.rejectedTopics??t.rejectedTopics?.length??0}.`;
    const log=document.createElement('div');log.className='v9-detail-transcript';for(const m of rows){const row=document.createElement('article');const strong=document.createElement('strong');strong.textContent=`${m.speaker||m.side||'Протокол'} · ${Math.floor((m.at||0)/60)} ч`;const p=document.createElement('p');p.textContent=m.text;row.append(strong,p);log.append(row);}const close=document.createElement('button');close.type='button';close.className='v9-secondary-button';close.textContent='Закрыть архивный протокол';close.addEventListener('click',()=>overlay.remove());d.append(h,meta,body,log,close);overlay.append(d);document.body.append(overlay);
  }
  function postBoot(){const sim=window.gameSimulation;if(!sim?.state)return;init(sim.state);syncTracks(sim.state);archiveClosed(sim.state);oldRender(sim.state,true);renderArchive(sim.state);renderTrackPackageButtons(sim.state);renderCivic(sim.state);decorateModal(sim);}
  window.KonturV10={ensureState:init,archiveClosed,syncTracks,renderArchive,queueRatification,queueCounteroffer,detectCounteroffers,resolveCustomDecision,createAgendaData:makeAgendaData,applyAgendaToTrack,advanceCivic,trackKind,executeCivicAction,conductElection,processPoliticalLog,deleteArchiveEntry,triggerNoConfidence,launchReferendumPrompt,resolveNoConfidence,resolveRatification,resolveElectionCoalition};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot();postBoot();},{once:true});else{boot();postBoot();}
})();
