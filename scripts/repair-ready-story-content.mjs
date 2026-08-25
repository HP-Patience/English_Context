import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function target(segments, word, lesson = null) {
  const segment = segments.find((item) => item.type === 'targetWord' && item.word === word)
  if (segment) return segment
  const row = lesson?.words?.find((item) => item.word.text === word)
  if (!row) throw new Error(`Missing target word: ${word}`)
  return {
    type: 'targetWord',
    word: row.word.text,
    definitionCn: row.glossCn,
    phonetic: row.word.phonetic ?? '',
    wordOrder: row.sortOrder,
  }
}

function text(value) {
  return { type: 'text', value }
}

function replaceText(segments, find, replacement) {
  for (const segment of segments) {
    if (segment.type === 'text' && segment.value.includes(find)) {
      segment.value = segment.value.replace(find, replacement)
      return true
    }
  }
  return false
}

function removeText(segments, value) {
  for (const segment of segments) {
    if (segment.type === 'text' && segment.value.includes(value)) {
      segment.value = segment.value.replace(value, '')
    }
  }
}

function removeRepeatedNarrativePrefix(paragraph) {
  const firstText = paragraph.segments.find((segment) => segment.type === 'text')
  if (!firstText || firstText.value.length < 20) return false

  let seen = false
  let changed = false
  for (const segment of paragraph.segments) {
    if (segment.type !== 'text' || !segment.value.startsWith(firstText.value)) continue
    if (!seen) {
      seen = true
      continue
    }
    segment.value = segment.value.slice(firstText.value.length)
    changed = true
  }
  return changed
}

function appendAfterTarget(document, word, suffix) {
  for (const paragraph of document.paragraphs) {
    const index = paragraph.segments.findIndex((segment) => segment.type === 'targetWord' && segment.word === word)
    if (index < 0) continue
    const next = paragraph.segments[index + 1]
    if (next?.type !== 'text' || next.value.includes(suffix)) return false
    next.value = `${suffix}${next.value}`
    return true
  }
  return false
}

const storyMeaningSpecs = [
  { lesson: 13, word: 'vision', definitionCn: '愿景；远见' },
  { lesson: 42, word: 'gulf', definitionCn: '鸿沟；巨大分歧' },
  { lesson: 43, word: 'scholarship', definitionCn: '学问；学术' },
  { lesson: 45, word: 'flap', definitionCn: '拍打' },
  { lesson: 46, word: 'inaugurate', definitionCn: '开创, 开启' },
  { lesson: 51, word: 'spell', definitionCn: '咒语；魔力' },
  { lesson: 56, word: 'seal', definitionCn: '密封' },
  { lesson: 68, word: 'rest', definitionCn: '剩余部分' },
  { lesson: 79, word: 'twitter', definitionCn: '叽喳声' },
]

const missingMeaningSpecs = [
  {
    word: 'gay',
    partOfSpeech: 'adjective',
    definitionCn: '欢快的；愉悦的',
    definition: 'cheerful, lively, and pleasant',
    example: 'The room had a **gay** atmosphere after the celebration.',
  },
  {
    word: 'feat',
    partOfSpeech: 'noun',
    definitionCn: '壮举；功绩',
    definition: 'an impressive achievement or act of skill or courage',
    example: 'Breaking the record was an extraordinary **feat**.',
  },
  {
    word: 'metric',
    partOfSpeech: 'noun',
    definitionCn: '指标；衡量标准',
    definition: 'a standard or measure used to assess performance or progress',
    example: 'The team chose a clear **metric** to measure its progress.',
  },
  {
    word: 'enclose',
    partOfSpeech: 'verb',
    definitionCn: '围住；封闭',
    definition: 'to surround an area or object and close it off',
    example: 'A stone wall **enclosed** the small garden.',
  },
  {
    word: 'aggregate',
    partOfSpeech: 'verb',
    definitionCn: '聚合；汇集',
    definition: 'to collect or combine things into a single group or total',
    example: 'The report **aggregates** data from several regions.',
  },
  {
    word: 'employment',
    partOfSpeech: 'noun',
    definitionCn: '使用；运用',
    definition: 'the use of something for a particular purpose',
    example: 'The **employment** of new techniques improved the process.',
  },
  {
    word: 'export',
    partOfSpeech: 'verb',
    definitionCn: '输出；运出',
    definition: 'to send or carry goods, services, or resources out of a place',
    example: 'The region **exports** tea and medicinal herbs to other countries.',
  },
]

function updateTargetDefinition(document, word, definitionCn) {
  let changed = false
  for (const paragraph of document.paragraphs) {
    for (const segment of paragraph.segments) {
      if (segment.type === 'targetWord' && segment.word === word && segment.definitionCn !== definitionCn) {
        segment.definitionCn = definitionCn
        changed = true
      }
    }
  }
  return changed
}

function rewriteTargetContext(document, word, beforeFind, beforeReplacement, afterFind, afterReplacement) {
  for (const paragraph of document.paragraphs) {
    const index = paragraph.segments.findIndex((segment) => segment.type === 'targetWord' && segment.word === word)
    if (index < 0) continue
    const before = paragraph.segments[index - 1]
    const after = paragraph.segments[index + 1]
    if (before?.type !== 'text' || after?.type !== 'text') throw new Error(`Target context missing for ${word}`)
    if (before.value.includes(beforeReplacement) && after.value.includes(afterReplacement)) return false
    if (!before.value.includes(beforeFind) || !after.value.includes(afterFind)) return false
    before.value = before.value.replace(beforeFind, beforeReplacement)
    after.value = after.value.replace(afterFind, afterReplacement)
    return true
  }
  throw new Error(`Target word not found: ${word}`)
}

function replaceTargetContextText(document, word, side, find, replacement) {
  for (const paragraph of document.paragraphs) {
    const index = paragraph.segments.findIndex((segment) => segment.type === 'targetWord' && segment.word === word)
    if (index < 0) continue
    const segment = paragraph.segments[index + (side === 'before' ? -1 : 1)]
    if (segment?.type !== 'text') throw new Error(`Target context missing for ${word}`)
    if (!segment.value.includes(find)) return false
    segment.value = segment.value.replace(find, replacement)
    return true
  }
  throw new Error(`Target word not found: ${word}`)
}

function rewriteTargetRun(paragraph, lead, entries, tail = '') {
  const currentTargets = paragraph.segments.filter((segment) => segment.type === 'targetWord')
  const currentWords = currentTargets.map((segment) => segment.word)
  const expectedWords = entries.map(([word]) => word)
  if (JSON.stringify(currentWords) !== JSON.stringify(expectedWords)) {
    throw new Error(`Unexpected target order in ${paragraph.sceneTitle}: ${currentWords.join(', ')}`)
  }

  const segments = [text(lead)]
  entries.forEach(([, suffix], index) => {
    const targetSegment = currentTargets[index]
    const glosses = targetSegment.definitionCn.split(/[；;，,/]/).map((value) => value.trim()).filter(Boolean)
    const repeatedGloss = glosses.sort((left, right) => right.length - left.length).find((gloss) => suffix.startsWith(gloss))
    segments.push(targetSegment, text(repeatedGloss ? suffix.slice(repeatedGloss.length) : suffix))
  })
  if (tail) segments.push(text(tail))
  if (JSON.stringify(paragraph.segments) === JSON.stringify(segments)) return false
  paragraph.segments = segments
  return true
}

function repairLesson68(document) {
  const rewrites = [
    ['紫薇仙子布下智道大阵，紧张的人群中忽然响起一阵', [
      ['laughter', '笑声，短暂冲淡杀机。李小白也从诗会中找到一点'],
      ['fun', '乐趣，借此稳住心神。方源则把阵中的每个'],
      ['person', '人都视作推算的一环；聚集的'],
      ['people', '人群越多，越容易暴露各方意图。无论仙凡，首先都是'],
      ['human', '人，也都会在危局中保护自身。方源审视自己的'],
      ['self', '自我与处境，随即改变部署；这种'],
      ['kind', '种类的应变，正是他屡次脱险的根本。'],
    ]],
    ['冰塞川召来黑楼兰，询问方源下落。她指出，五域中的', [
      ['foreigner', '外国人并不是判断局势的关键，真正值得留意的是被各方塑造出的'],
      ['hero', '英雄与被嘲弄的'],
      ['fool', '傻瓜。方源仍是长生天必须面对的'],
      ['enemy', '敌人；黑楼兰这个'],
      ['woman', '女人，则希望成为自身命运的'],
      ['owner', '主人，而不是任何势力的'],
      ['slave', '奴隶。冰塞川因此重新评估她的价值。'],
    ]],
    ['冰塞川取出强蛊，并承诺扶持黑楼兰重振黑家。她不会把这份许诺当作', [
      ['lover', '恋人间的情话，而是看作组织'],
      ['member', '成员之间的交易。她仍像一名谨慎的'],
      ['visitor', '访客，先观察长生天内部；鞋底沾着的'],
      ['dirt', '泥土提醒她，自己仍从险境而来。她接受强蛊的'],
      ['purpose', '目的很明确。至于长生天是否另有安排，这个'],
      ['question', '问题仍无答案；她只把冰塞川的'],
      ['report', '报告与承诺一并记下。'],
    ]],
    ['气海老祖向秦鼎菱索取天气、地气两只八转仙蛊作为报酬，没有留下', [
      ['rest', '休息的时间便投入追杀。他以分身'],
      ['body', '身体承受风险，换取本体需要的'],
      ['effect', '效果。追杀直到战局'],
      ['end', '末尾都未停止；中洲地渊成了新的交锋'],
      ['field', '领域。秦鼎菱盘点敌我'],
      ['figure', '数字时，也必须考虑气海老祖这股力量。杀意如'],
      ['flood', '洪水般漫过天际。'],
    ]],
    ['吴帅驾龙宫急遁，首要', [
      ['goal', '目标是拖住幽魂。魂啸冲击众人的'],
      ['hearing', '听力，黑烟又封死每个'],
      ['hole', '洞孔般的出口。寒意如'],
      ['ice', '冰覆盖龙宫，魂兽军势却已形成庞大'],
      ['industry', '行业般的严密体系。各方真正的'],
      ['interest', '兴趣都落在方源身上，追杀消息随后被写入'],
      ['letter', '信函，传往五域。'],
    ]],
    ['万灭雷森落入至尊仙窍，雷霆的', [
      ['light', '光照亮小南疆，电芒沿一条条'],
      ['line', '线撕开资源点。方源迅速列出损失'],
      ['list', '清单，并封锁外界'],
      ['media', '媒体般的信道传播，只向部下发送必要'],
      ['message', '信息。每一'],
      ['minute', '分钟都有山河毁灭，他只能在简短'],
      ['note', '笔记中记录最紧要的变化。'],
    ]],
    ['方源放出本体假象和太古年兽，一', [
      ['pair', '对诱饵按照预定'],
      ['pattern', '图案分头逃遁。幽魂识破其中一'],
      ['piece', '块破绽，并把年兽当作到手的'],
      ['prize', '奖品。它对假象的'],
      ['behaviour', '行为与对年兽的'],
      ['behavior', '行为截然不同，使方源确认自己的'],
      ['choice', '选择已经暴露。'],
    ]],
    ['方源舍弃龙宫与飞车，引三方追兵进入中洲地渊。这个', [
      ['programme', '计划并非临时起意，也不是固定的计算机'],
      ['program', '程序，而是随战局调整。众仙在各自'],
      ['seat', '座位般的位置上追击，每一道命令都像一条'],
      ['sentence', '句子落下。远处突然传来一记'],
      ['shot', '射击，迫使队伍转向地渊另一'],
      ['side', '侧面。李小白则把经历写成一篇'],
      ['story', '故事，隐藏了真实来历。'],
    ]],
    ['陆畏因发动幻沙转影战场，给幽魂带来真正的', [
      ['surprise', '惊讶。幽魂成为众人的共同'],
      ['target', '目标，围攻者的'],
      ['voice', '声音却并不一致；各方背后的'],
      ['audience', '观众也各有期待。方源不相信口头'],
      ['belief', '信念，只利用临时'],
      ['community', '群体共同应对眼前'],
      ['crisis', '危机。'],
    ]],
    ['幽魂强攻安土重山堡，每一处', [
      ['detail', '细节都可能决定生死。青仇撞来时，战场如遇'],
      ['earthquake', '地震；积累十万年的'],
      ['experience', '经历化作仇恨力量。气绝反戈也是关键'],
      ['factor', '因素，任何一方的'],
      ['failure', '失败都会改变战局。沉重'],
      ['footstep', '脚步声逼近时，没人会想到凡俗'],
      ['housewife', '家庭主妇的安稳生活；这里只剩复仇与求生。'],
    ]],
    ['幽魂自爆后，破碎战场留下骇人的', [
      ['image', '图像，也让他的'],
      ['influence', '影响力继续笼罩五域。方源把安土重山堡这项'],
      ['invention', '发明般的成果收回，并在随身'],
      ['journal', '学术期刊式记录中标注损失'],
      ['level', '水平。陆畏因说明乐土安排的'],
      ['manner', '方式，也提到联盟不是'],
      ['marriage', '婚姻，而是利益与传承的结合。'],
    ]],
  ]

  let changed = false
  document.paragraphs.forEach((paragraph, index) => {
    const [lead, entries] = rewrites[index]
    changed = rewriteTargetRun(paragraph, lead, entries) || changed
  })
  return changed
}

function repairLesson76(document) {
  const rewrites = [
    ['疯魔窟第八层残留着各小世界的', [
      ['fauna', '动物群记录。战局正朝对方源'],
      ['favourably', '有利的方向推进，而世界的'],
      ['fertility', '繁殖力也被写入玉简。战场的'],
      ['feverish', '狂热气氛不断加深，一名负责整理战报的'],
      ['filer', '归档者把'],
      ['filing', '归档工作做得井然有序，却没人关心凡俗'],
      ['film-making', '电影制作。道痕细节极为'],
      ['fine-grained', '细致，但大阵本身仍有'],
      ['flawed', '有缺陷的部分；机会'],
      ['fleeting', '短暂，方源必须立即抓住。'],
    ]],
    ['战部渡率众反攻仙墓，沿途既有', [
      ['flora', '植物群，也有负责照料资源的'],
      ['forester', '护林人；相关'],
      ['forestry', '林业记录都被收入玉简。仙墓每'],
      ['fortnightly', '两周一次的巡查已被大战打乱，守军威势更以'],
      ['fourfold', '四倍之势增长。负责入口的'],
      ['gatekeeper', '把关者拦住追兵，复活大阵的'],
      ['generative', '生成力量仍在运转。方源不需要'],
      ['geneticist', '遗传学家解释'],
      ['genetics', '遗传学，只判断眼前华丽而'],
      ['glamorous', '迷人的仙墓外象背后藏着什么杀机。'],
    ]],
    ['神帝城的人道影响已近似', [
      ['globalization', '全球化扩散，门内却只有死亡的'],
      ['gloominess', '忧郁气息。沈伤破阵后形势'],
      ['glowingly', '明显好转，但无人因此满足；方源只想'],
      ['gratify', '满足自身利益。脚下'],
      ['gravel', '砾石飞溅，神帝城这位'],
      ['guardian', '保护者仍挡在前方。没人有心思整理'],
      ['haircut', '发型，联军只想'],
      ['hasten', '加速破阵。幽魂将要'],
      ['haunt', '出没的生死门内一片'],
      ['hazy', '朦胧，真正杀机尚未显露。'],
    ]],
    ['众人追入生死门。这里没有凡俗', [
      ['headhunter', '猎头，只有幽魂掀起的'],
      ['heated', '激烈交锋。荒魂中混有'],
      ['herbivore', '食草动物般的魂兽，却仍构成巨大'],
      ['hindrance', '障碍。方源必须从'],
      ['holistic', '整体角度判断战局，任何'],
      ['home-grown', '本土成长的手段都不足以单独制胜。古老'],
      ['hominid', '人科动物与'],
      ['homo', '人属的魂魄都被卷入'],
      ['homogenization', '同质化的魂潮，再无人能高喊'],
      ['hooray', '万岁。'],
    ]],
    ['事实浮冰出现后，昔日', [
      ['hunter-gatherer', '狩猎采集者的痕迹也被大道演化收录。各方攻势出现'],
      ['hyperactivity', '过度活跃，军心近乎'],
      ['hysteria', '歇斯底里。无极这个'],
      ['idealist', '理想主义者验证永生时，仙元储备趋于'],
      ['illiquid', '非流动，资源的'],
      ['illiquidity', '流动性不足愈发明显。战场'],
      ['imaging', '成像揭示各方防御'],
      ['immunity', '免疫力并非绝对。气绝一时'],
      ['inarticulate', '不善表达，乐土的作用也绝非'],
      ['incidental', '次要。'],
    ]],
    ['方源晋升尊者后，先整理尚未确定的', [
      ['indefinite', '情报，再把天庭的'],
      ['indictment', '起诉书与敌人的'],
      ['indulgence', '放纵一并视作无用噪音。部下的'],
      ['industriousness', '勤奋让修复'],
      ['inescapably', '不可避免地加快。他不会'],
      ['inflate', '夸大眼前难题，而以'],
      ['innovatively', '创新方式推进；这种'],
      ['innovativeness', '创新性也可能藏着'],
      ['insidious', '潜伏风险，唯有'],
      ['insightful', '有洞察力的判断才能避开。'],
    ]],
    ['楚度与黑楼兰的交锋具有', [
      ['instructive', '启示意义，也揭示双方'],
      ['interdependence', '相互依赖的局面。力道与运道的'],
      ['interdisciplinary', '跨流派配合，引来长生天'],
      ['intervention', '干预。杀招'],
      ['intricacy', '复杂精细，任何破绽都可能'],
      ['invalidate', '使原计划无效。巨阳需要'],
      ['in-depth', '深入判断，而不是理会凡俗'],
      ['jobcentre', '就业中心、'],
      ['jobseeker', '求职者或'],
      ['judiciary', '司法机构一类无关事物。'],
    ]],
    ['回到东海后，方源必须', [
      ['juggle', '兼顾仙窍修复与尊者博弈。他不向外界提供'],
      ['justification', '理由，也不因旧日'],
      ['kinship', '血缘关系改变判断。任何'],
      ['knee-jerk', '下意识反应都会带来'],
      ['knock-on', '连锁后果；只有'],
      ['knowledgeable', '知识渊博的阵道部下能帮忙校正。战后留下的'],
      ['lameness', '跛行伤势，也被列入修复清单。'],
    ]],
  ]

  let changed = false
  document.paragraphs.forEach((paragraph, index) => {
    const [lead, entries] = rewrites[index]
    changed = rewriteTargetRun(paragraph, lead, entries) || changed
  })
  return changed
}

function repairLesson72(document) {
  const rewrites = [
    ['可信鸿带来九转风道仙材时，', [
      ['perhaps', '武庸或许早已猜到方源会开价；'],
      ['maybe', '交易仍会生变，但消息不能泄露到'],
      ['anywhere', '。双方把仙材与真传'],
      ['together', '摆上桌，可信鸿把条件说得很'],
      ['well', '。武庸很'],
      ['soon', '作出决定，检查'],
      ['round', '的封印后，'],
      ['as', '武家之主完成交易。厅中一度'],
      ['still', '，这是方源'],
      ['first', '次与武家建立稳定交易。'],
    ]],
    ['方源', [
      ['usually', '把合作视作省力手段，随后继续向'],
      ['forward', '推进布局。房家约有'],
      ['around', '半数蛊仙记得算不尽；他甚至'],
      ['even', '主动揭明身份，并把条件说'],
      ['aloud', '。'],
      ['anyhow', '房家如何掩饰，众仙仍彼此'],
      ['apart', '而坐。方源提出一条'],
      ['whereby', '自己可持续取得魂核的路径；无论希望藏在'],
      ['wherever', '，房家都无法回避。他只'],
      ['gently', '放下魂魄容器，谈判便有了结果。'],
    ]],
    ['正气盟几乎', [
      ['per', '日都收到蚁灾损失。军团蚁由遗毒蚁祸'],
      ['of', '中的复合变化所化；群仙聚集'],
      ['at', '气海老祖的议事地，蚁云悬在洞天'],
      ['over', '。其破坏力'],
      ['beyond', '寻常虫灾，各家只能'],
      ['by', '贡献真传合力推演。消息'],
      ['via', '信道传到宋家；'],
      ['besides', '炼道传承，各家还交出多道心得。'],
      ['except', '少数观望者，其余势力都把奥妙汇'],
      ['into', '同一场推演。'],
    ]],
    ['宋家在交出真传', [
      ['before', '反复权衡。真传'],
      ['from', '古老炼道体系而来；'],
      ['since', '气海老祖索取以来，宋家一直拒绝。真传到手'],
      ['after', '，方源立即参悟；'],
      ['during', '群仙推演蚁祸时，他已把杀机指向'],
      ['to', '火原洞主。敌人踏'],
      ['onto', '预设战场，方源沿'],
      ['along', '边缘收紧变化，杀招朝'],
      ['towards', '中心逼近。这场伏杀正是'],
      ['for', '试验新战场杀招而设。'],
    ]],
    ['火原洞主谈', [
      ['about', '自毁仙窍，想从战场脱身'],
      ['off', '去。其爆发再加'],
      ['plus', '数重，仍弱'],
      ['than', '方源的复合战场。异人蛊仙'],
      ['with', '本体同时进攻；若'],
      ['without', '气海老祖提供路线，方源无法准确接收仙窍。'],
      ['according to', '既定安排，洞主死后防线崩溃；'],
      ['owing to', '失去主心骨，大军从'],
      ['on', '洞天边界涌入，横'],
      ['across', '各处镇压反抗。'],
    ]],
    ['异人蛊仙没有站在方源的对立面', [
      ['against', '，而是守在他身'],
      ['beside', '汇报损毁。失衡必须通过'],
      ['through', '调整压回承受范围'],
      ['within', '。方源可继续吞并'],
      ['and', '整顿内部'],
      ['or', '暂缓扩张；'],
      ['though', '银白气运壮大，仍未质变。'],
      ['although', '后果尚未显现，他仍要判断气运'],
      ['if', '能够凝聚。天庭在考虑'],
      ['whether', '强夺醉仙翁真传时，选择了长期收服。'],
    ]],
    ['秦鼎菱一直等', [
      ['till', '醉仙翁看清证据，也等'],
      ['until', '他接受安排。'],
      ['while', '房睇长意志观察壁画世界，'],
      ['whenever', '新的人道蛊显现，体系便进一步发展。天庭布局人道'],
      ['but', '尚未与方源正面碰撞；'],
      ['whereas', '长生天把黑楼兰送入万兽混彩天。若'],
      ['unless', '有鲁桐兰掩护，她无法立足；她接受安排'],
      ['because', '图腾可以迅速成长，'],
      ['nor', '不会因圣子身份忘记真正的'],
      ['me', '。'],
    ]],
    ['黑楼兰清楚力量属于', [
      ['mine', '，万生路仍要靠'],
      ['myself', '。强者必须约束'],
      ['oneself', '。巨阳的指点仿佛在说：“'],
      ['you', '若想得到机缘，就守住'],
      ['yourself', '。”困境如活物，'],
      ['it', '会随恐惧扩大；她持续冲击，终于迫使困境'],
      ['itself', '裂开道路。'],
    ]],
  ]

  let changed = false
  document.paragraphs.forEach((paragraph, index) => {
    const [lead, entries] = rewrites[index]
    changed = rewriteTargetRun(paragraph, lead, entries) || changed
  })
  return changed
}

function repairLesson77(document) {
  const rewrites = [
    ['鲛人族群初入至尊仙窍，这次', [
      ['landing', '落脚先从'],
      ['language acquisition', '语言习得开始。她们发现榜上'],
      ['laureate', '获奖者能得到资源，也发现情报'],
      ['leakage', '泄漏会受惩处。这里没有凡俗'],
      ['left-of-centre', '中左立场之争，但已有管理'],
      ['legislature', '立法机关般的制度。三榜的'],
      ['legitimacy', '合法性来自方源权力，规则虽'],
      ['lengthy', '冗长，却能形成治理'],
      ['leverage', '杠杆。方源逐步'],
      ['liberalize', '放宽任务渠道，让新人也能立足。'],
    ]],
    ['星罗城的资源改善了族人的生活，是明显', [
      ['life-enriching', '丰富生活的变化。任务'],
      ['lightly', '轻微推进时，谱系'],
      ['lineage-specific', '特征仍影响分工。妙音仙子安排'],
      ['lodging', '住宿，毛十二解释制度'],
      ['logicality', '逻辑性。鲛人熟悉'],
      ['longline', '延绳钓，也理解'],
      ['long-standing', '长期规则；若海域'],
      ['long-fished', '长期捕捞，资源便难以'],
      ['long-lasting', '持久。眼下分配虽'],
      ['lopsided', '不平衡，至少已有上升通道。'],
    ]],
    ['连可心不把新环境看成', [
      ['low-stress', '低压力之地，也不愿族人永远承担'],
      ['low-wage', '低报酬任务。她反对用'],
      ['lynch', '私刑处死解决争端，并研究'],
      ['man-made', '人造海域和'],
      ['mass-market', '大众市场渠道。她保留'],
      ['maternal', '母性般的照护，也要'],
      ['maximise', '最大化英国式贸易收益，再'],
      ['maximize', '最大化美式账册中的资源配置。医疗事务不能被过度'],
      ['medicalize', '医学化，海底'],
      ['megalith', '巨石资源也应纳入长期建设。'],
    ]],
    ['古月方想把土炼蛊当作一枚', [
      ['memento mori', '死亡提醒，警告自己不可轻敌。他不懂'],
      ['metaphysical', '形而上学理论，也不是'],
      ['meteorologist', '气象学家；出身更谈不上'],
      ['middle-class', '中产阶级。他只把连可心视为'],
      ['middleman', '中间人，并调整求生'],
      ['mindset', '心态。追兵中有人穿着'],
      ['miniskirt', '超短裙般的异域服饰，但真正危险的是'],
      ['misconduct', '不当行为与旧日'],
      ['misdeed', '恶行。他设法'],
      ['mitigate', '减轻追杀压力，等待翻身。'],
    ]],
    ['方源交易的资源没有', [
      ['mitochondrial', '线粒体层面的意义，却能'],
      ['monetize', '按美式说法实现盈利，也能'],
      ['monetise', '按英式写法实现盈利。清单中甚至有'],
      ['morphine', '吗啡般的麻醉资源，以及来自某个'],
      ['municipality', '自治市的物资。异人加入同盟近似'],
      ['naturalization', '归化，谈判中的'],
      ['noise-making', '噪声制造并无价值。表面'],
      ['noncommercial', '非商业的援助、'],
      ['noncontroversial', '无争议的条款与'],
      ['noneconomic', '非经济因素，最终都服务于利益。'],
    ]],
    ['房家与万家的交锋既有', [
      ['nonverbal', '非语言信号，也借用了'],
      ['non-profit', '非营利名义。最'],
      ['noteworthy', '值得注意的是双方都声称判断具有'],
      ['objectiveness', '客观性，却又互斥到近乎'],
      ['obscene', '不堪入目。旧势力的'],
      ['old-fashionedness', '守旧暴露无遗，荒兽中的'],
      ['omnivore', '杂食动物也被卷入战场。房家的反击不是'],
      ['one-way', '单向行动，更不追求'],
      ['on-trend', '时髦；方源也不会把关键手段'],
      ['open-source', '开源给盟友。'],
    ]],
    ['天地一家大爱盟开始真正', [
      ['operative', '运作。宝黄天中的'],
      ['orb', '球体资源、装饰'],
      ['ornate', '华丽的仙材与荒兽'],
      ['ostrich', '鸵鸟都可交易。方源让收益'],
      ['outweigh', '胜过风险，却不愿成员'],
      ['overburdened', '负担过重，也不在意礼服是否'],
      ['overdressed', '过于正式。鲛人不能'],
      ['overfish', '过度捕捞资源，也不可'],
      ['overrate', '高估盟约保护；任何势力都可能'],
      ['overshadow', '使弱小族群黯然失色。'],
    ]],
    ['两天混淆加剧，任何势力若', [
      ['overstep', '逾越界限都可能引发冲突。华文洞天没有'],
      ['particularist', '特殊主义者能独断，也不是每个'],
      ['passer-by', '路人都有资格介入。天庭以'],
      ['peer-review', '同行评审般的方式复核情报，试图'],
      ['perpetuate', '延续自身优势。尊者谋划仿佛追求'],
      ['perpetuity', '永恒，但一片'],
      ['petal', '花瓣般细小的变数也可能改变两天。'],
    ]],
  ]

  let changed = false
  document.paragraphs.forEach((paragraph, index) => {
    const [lead, entries] = rewrites[index]
    changed = rewriteTargetRun(paragraph, lead, entries) || changed
  })
  return changed
}

function repairLesson(lesson) {
  const document = JSON.parse(lesson.contentJson)
  let changed = false

  for (const paragraph of document.paragraphs) {
    changed = replaceText(paragraph.segments, '五百年沉浮像一套冷硬的', '五百年沉浮把他的取舍训练成一套冷硬的') || changed
    for (const segment of paragraph.segments) {
      if (segment.type !== 'text') continue
      const normalized = segment.value.replace(/(?:\s+system)+(?=，让他在亲情面前也能迅速做出取舍)/g, ' system')
      if (normalized !== segment.value) {
        segment.value = normalized
        changed = true
      }
    }
    changed = replaceText(paragraph.segments, '没有放过任何', '没有') || changed
    changed = replaceText(paragraph.segments, 'layer层', 'layer') || changed
    changed = replaceText(paragraph.segments, '时间被拉得很', '方源让时间') || changed
    changed = replaceText(paragraph.segments, '，第二空窍蛊、', '得很长，第二空窍蛊、') || changed
    changed = replaceText(paragraph.segments, '声音变得', '喉咙变得') || changed
    changed = replaceText(paragraph.segments, '而嘶哑', '，声音嘶哑') || changed
    changed = replaceText(paragraph.segments, '一领旧', '一件旧') || changed
  }

  if (lesson.order === 12) {
    const paragraph = document.paragraphs.find((item) => item.segments.some((segment) => segment.type === 'targetWord' && segment.word === 'profound'))
    if (!paragraph) throw new Error('Lesson 12 target paragraph not found')
    const segments = paragraph.segments
    paragraph.segments = [
      text('丁浩放松后，方源眼中杀意像火中烙下的'),
      target(segments, 'print', lesson),
      text('，一瞬便定了结局。他让丁浩配合收拢尸群，又借尸潮'),
      target(segments, 'produce', lesson),
      text('的混乱追杀最后几名逃散蛊师。千尸之势本是丁浩苦心经营的'),
      target(segments, 'production', lesson),
      text('，此刻却成了方源清理痕迹的工具。魔道中人的'),
      target(segments, 'profession', lesson),
      text('从来不是讲信义，而是看谁更能活到天亮；这一点丁浩明白得太迟。方源的算计'),
      target(segments, 'profound'),
      text('得像夜色下的深井，先给他希望，再在最近处出手。骨枪蛊刺穿丁浩时，方源已盘算如何用这些收获'),
      target(segments, 'purchase'),
      text('新蛊，并为下一步准备足够的'),
      target(segments, 'quota'),
      text('。丁浩曾想凑足千人尸群的'),
      target(segments, 'quote'),
      text('；眼下他只把现场烧得干净。火光没有'),
      target(segments, 'random', lesson),
      text('乱窜，而是按方源选好的方向吞没尸体、蛊虫和痕迹。等灰烬落定，只剩普通尸潮袭击商队的假象，以及几件'),
      target(segments, 'rare', lesson),
      text('蛊虫曾经存在过的淡淡气息。'),
    ]
    changed = true
  }

  if (lesson.order === 33) {
    const paragraph = document.paragraphs.find((item) => item.segments.some((segment) => segment.type === 'targetWord' && segment.word === 'thigh'))
    if (!paragraph) throw new Error('Lesson 33 thigh paragraph not found')
    const thigh = target(paragraph.segments, 'thigh')
    if (paragraph.segments.some((segment) => segment.type === 'text' && segment.value.includes('竞价节奏像被人猛扯'))) {
      replaceText(paragraph.segments, '竞价节奏像被人猛扯', '方源的大腿')
      const thighIndex = paragraph.segments.indexOf(thigh)
      if (thighIndex >= 0) {
        paragraph.segments.splice(thighIndex, 1)
        const anchor = paragraph.segments.findIndex((segment) => segment.type === 'text' && segment.value.includes('方源的大腿'))
        paragraph.segments.splice(anchor + 1, 0, thigh, text('一紧，竞价节奏又陡然加快。'))
      }
      changed = true
    }

    const liverParagraph = document.paragraphs.find((item) => item.segments.some((segment) => segment.type === 'targetWord' && segment.word === 'liver'))
    if (!liverParagraph) throw new Error('Lesson 33 liver paragraph not found')
    const liver = target(liverParagraph.segments, 'liver')
    const liverIndex = liverParagraph.segments.indexOf(liver)
    if (liverIndex >= 0 && !liverParagraph.segments.some((segment) => segment.type === 'text' && segment.value.includes('他的肝脏'))) {
      liverParagraph.segments.splice(liverIndex, 1)
      liverParagraph.segments.splice(Math.max(0, liverIndex - 1), 0, text('他的肝脏'), liver, text('隐隐作痛；但心里最要紧的仍是近水楼台线索。'))
      changed = true
    }
  }

  if (lesson.order === 34) {
    const paragraph = document.paragraphs.find((item) => item.segments.some((segment) => segment.type === 'targetWord' && segment.word === 'furious'))
    if (paragraph && !paragraph.segments.some((segment) => segment.type === 'text' && segment.value.includes('的怒意'))) {
      const furious = target(paragraph.segments, 'furious')
      const index = paragraph.segments.indexOf(furious)
      if (index >= 0) paragraph.segments.splice(index + 1, 0, text('的怒意'))
    }
  }

  if (lesson.order >= 54 && lesson.order <= 77) {
    for (const paragraph of document.paragraphs) {
      const before = JSON.stringify(paragraph.segments)
      removeText(paragraph.segments, '局势随之变化。')
      removeText(paragraph.segments, '四周气息不断起伏，每个人都在衡量下一步得失。')
      removeText(paragraph.segments, '风声掠过战场，尚未落定的杀机依旧在暗处流转。')
      removeText(paragraph.segments, '短暂的寂静过后，局势仍沿着既定方向迅速推进。')
      removeText(paragraph.segments, '转瞬之间，先前的平衡便被新的变化悄然打破。')
      removeText(paragraph.segments, '没有人因此停步，所有选择仍被眼前的局势推着向前。')
      if (JSON.stringify(paragraph.segments) !== before) changed = true
    }
  }

  if (lesson.order >= 68 && lesson.order <= 77) {
    for (const paragraph of document.paragraphs) {
      changed = removeRepeatedNarrativePrefix(paragraph) || changed
    }
  }

  const allSegments = document.paragraphs.flatMap((paragraph) => paragraph.segments)

  if (lesson.order === 6) {
    changed = rewriteTargetContext(document, 'privacy', '也不该继续藏在别人的', '也不该被别人以', '里。', '为由继续遮掩。') || changed
  }
  if (lesson.order === 40) {
    changed = rewriteTargetContext(document, 'volt', '门中震动如一记', '门中震动，测量阵盘上的读数以', '打入人心。', '伏特计，足以让人心惊。') || changed
  }

  for (const spec of storyMeaningSpecs) {
    if (spec.lesson === lesson.order) changed = updateTargetDefinition(document, spec.word, spec.definitionCn) || changed
  }
  for (const spec of missingMeaningSpecs) {
    if (lesson.words.some((row) => row.word.text === spec.word)) changed = updateTargetDefinition(document, spec.word, spec.definitionCn) || changed
  }

  const replacements = {
    41: [
      ['标准标准只有一个', '公认标准只有一个'],
      ['又在天庭白光轰落时结出毁灭之', '又在天庭白光轰落时令毁灭之花'],
    ],
    43: [
      ['方源刚开始', '方源刚开始让自己'],
      ['自己熟悉新身躯，便感到旧仙僵躯壳', '熟悉新身躯，便感到旧仙僵躯壳'],
    ],
    44: [
      ['任何一步错漏，都可能让他们被命运狠狠。', '任何一步错漏，都可能让他们遭受命运的残酷摆布。'],
      ['倪家山寨在夜色中遭劫，劫火像 ', '倪家山寨在夜色中遭劫。凡俗所说的 '],
      ['蹂躏 过山谷的黑潮。', '指强奸，并不适合形容劫火；真正漫过山谷的是黑潮般的火焰。'],
      ['剑光擦身 ', '界壁边仍有荒兽低头'],
      [' 过戚荷', '吃草，剑光却擦过戚荷'],
      ['仙窍边缘重新 ', '方源又在仙窍边缘'],
      [' 住破口', '附上一层封禁，遮住破口'],
    ],
    45: [
      ['聚合成沉重的灾势', '总计起来，形成沉重的灾势'],
      ['墟蝠残翼的', '墟蝠残翼下的机关'],
      ['拍动声仿佛还在风雪中回响', '活板仍在风雪中晃动，声响仿佛还在回响'],
      ['他忽然', '他忽然让直飞出现一次'],
      ['直飞，令血河弯折', '，令血河弯折'],
      ['像巨槌', '巨响伴着一个'],
      ['在云土之上', '般的肿块从云土上鼓起'],
      ['像针芒', '带来针芒般的'],
      ['入神魂', '，直入神魂'],
      ['炉灰里泛着', '炉灰呈'],
      ['色余烬', '棕褐色，余烬仍未熄灭'],
      ['一个 ', '一个'],
      [' 的轮廓', '轮廓'],
      ['对自己也有 ', '竟也可供自己'],
      ['，这点牵连', '利用，这点牵连'],
    ],
    48: [
      ['远处鹰鸣未散，贪婪的人影仍未退去，', '远处鹰鸣未散，贪婪的人影仍未退去。'],
      ['这个危险 ', '这个危险局势使他判断方源'],
      [' 会循线追来', '会循线追来'],
      ['借四通八达上古战阵 ', '借四通八达上古战阵以'],
      [' 撤走', '的节奏撤走'],
      ['两件事', '两件事必须同时'],
      ['推进，越发显示出', '推进；这种'],
    ],
    49: [
      ['女性化的柔弱', '的柔弱'],
      ['可溶的之物', '之物'],
      ['敌人尸身', '一名重伤敌人'],
      ['倒伏', '着倒伏'],
      ['气泡外的乱流也开始', '气泡外的乱流也开始显出'],
      ['松变形', '的松散形态'],
      ['向花蝶女仙', '向花蝶女仙'],
      ['出影宗营地留下的', '影宗营地留下的'],
    ],
    50: [
      ['方源并不', '方源不在意他们所谓的'],
      ['他们口中威胁，只在心底', '关心，只在心底'],
    ],
    51: [
      ['他没有求谁', '他没有请求谁'],
      ['旧债，只轻轻局势随之变化。', '旧债，只轻轻'],
      ['反因对方境界而保留几分', '反而'],
      ['，终于给出', '对方的境界，终于给出'],
      ['随即念动驯养用的', '随即念动驯鹰法诀，又逐字检查其中'],
      ['法诀，不许', '是否有误，不许'],
      ['旁人稍有', '若有人提出'],
      ['便会受压', '动议，便会受道痕压制'],
      ['借层层算计', '借层层算计与'],
      ['住白凝冰的退路', '新闻界般的情报渠道压住白凝冰的退路'],
      ['反复', '反复进行'],
      ['五相赌约的布置', '练习，完善五相赌约的布置'],
      ['又凭运道顽强', '又凭运道展开顽强的'],
      ['回来', '，挣扎回来'],
    ],
    52: [
      ['转眼落入方源 ', '转眼砸在方源'],
      [' 之中', '大腿前方'],
    ],
    53: [
      ['巴德却不敢小觑，巴德忍不住', '巴德却不敢小觑，也忍不住'],
      ['压在心底，因为', '，因为'],
      ['；十大古派迅速', '；十大古派的行动迅速变得'],
      ['起来', ''],
      ['，沐凌澜，沐凌澜、', '，沐凌澜、'],
      ['他本就惯于', '他本就习惯保持'],
      ['行事，许多选择', '的状态，许多选择'],
      ['心中最后的', '心中仍'],
      ['只剩把方源引向', '能把方源引向'],
    ],
    54: [
      ['她即便说出', '她即便想'],
      ['，也换不来退让', '取悦旁人，也换不来退让'],
      ['都想找', '都不肯'],
      ['出手，河外杀机', '原谅方源，河外杀机'],
      ['接受这份暂时的', '接受影宗暂时出手'],
      ['，却从未放下戒心', '自己，却从未放下戒心'],
      ['影宗使者表达', '影宗使者试图'],
      ['时，他只当作', '他时，他只当作'],
      ['腰间布带仍有些', '腰间布带仍有些松，头上还戴着一顶'],
      ['。最后他摘下斗', '帽子。最后他摘下斗'],
      ['帽子，借琅琊派', '，借琅琊派'],
    ],
    55: [
      ['只会', '只会使旁人'],
      ['弱旁人心神', '疲惫'],
      ['方源的及时从容赶到', '方源及时从容赶到，这次'],
      ['却让广寒峰', '让广寒峰'],
    ],
    56: [
      ['这才取出真正可用的', '峰下水泽恰有一头'],
      ['封印。', '海豹游过；方源这才取出真正可用的封印。'],
      ['左夜灰夜灰将至', '左夜灰将至'],
    ],
    69: [
      ['只要众人配合，气海老祖便', '只要众人配合，气海老祖就是'],
      ['方源必须保住至尊仙窍的', '方源必须保住'],
      ['，不能任由雷森', '的至尊仙窍，不能任由雷森'],
    ],
    70: [
      ['天空仿佛', '天空仿佛被'],
      ['了沉重血水', '的沉重血水填满'],
      ['直到', '直到他确信自己已经'],
      ['每一道变化', '，每一道变化'],
      ['让可以', '让'],
      ['很', '极为'],
      ['的时间', '时间'],
      ['他的目光越过远方，', '他的目光越过远方，沿着一条'],
      ['落向下一场谋划', '的方向落向下一场谋划'],
    ],
    71: [
      ['直接以', '直接说'],
      ['的态度排除', '，排除'],
      ['她却', '她继续'],
      ['决定继续变强', '坚定地变强'],
      ['方源等人的阴影更让她无法停步。', '方源等人的阴影更让她无法停步，但压力并非'],
      ['，她没有把所有打算', '大；她没有把所有打算'],
      ['赵怜云在灵缘斋经营人脉，', '赵怜云在灵缘斋经营人脉，她对救魂一事'],
      ['不曾忘记马鸿运', '执着，从未忘记马鸿运'],
      ['她身边看似', '她身边有些人直到'],
      ['可信之人', '才显得可信'],
      ['没有停止追索', '关头也没有停止追索'],
      ['有人愿意返回原路', '愿意返回原路'],
      ['危险曾有', '危险曾'],
      ['逼近死亡', '将他们逼近死亡'],
      ['她在很久', '她'],
      ['便认准力道', '认准力道'],
      ['她是否', '她的选择是否'],
      ['后悔过无人知晓', '公正无人知晓'],
      ['武家蛊仙追问，她', '武家蛊仙追问，她早在很久'],
      ['直言要走出', '以前便直言要走出'],
      ['已逃到山', '已经逃到荒山'],
      ['只留下奇异天地气息', '，只留下奇异天地气息'],
      ['要保住谋划，', '要保住谋划，就'],
      ['便只能让火雷真传', '只能让火雷真传'],
      ['继续', '换一种方式继续'],
      ['会问', '会进一步追问'],
      ['由谁占据大义', '，由谁占据大义'],
      ['旁人只问真传在', '旁人只问真传如何'],
      ['、何时出世', '出世、何时出世'],
      ['这样的机会很', '这样的机会不知为何只'],
      ['出现一次', '出现一次'],
    ],
    73: [
      ['仍找不到', '找不到'],
      ['能够彻底遏止', '能彻底遏止'],
      ['炼蛊与售卖真传', '炼蛊与售卖真传二者'],
      ['都不是目的', '不是目的'],
      ['踏入', '踏入一'],
      ['场早已开局', '场早已开局'],
      ['在方源眼中，', '在方源眼中，任何'],
      ['如此完整的', '如此完整的一'],
      ['方源判断自己', '方源顺手收起一只'],
      ['借下属试探', '罐头状容器，再借下属试探'],
      ['他们很快', '他们很快成为'],
      ['那看似温和的', '明皓看似温和，但潜在'],
      ['反而让骄兵', '的威势反而让骄兵'],
      ['败军退回后仍', '败军退回后似乎仍'],
      ['天庭开坛传道的', '天庭开坛传道的成本'],
      ['方源却在心中判断：', '方源却在心中判断，自己的计划将'],
      ['计划不会因此停下', '变成现实，不会因此停下'],
      ['继续完善', '继续完善稳固的'],
      ['稳住', '让其阵营'],
      ['阵营', '保持稳定'],
      ['世界自有', '世界融合自有'],
      ['融合规律', '代价与规律'],
      ['全部布局中', '全部布局中属于'],
      ['此刻三方麾下强者越多，最', '此刻三方麾下强者越多，'],
      ['也不过意味着', '的力量也不过意味着'],
      ['天资卓绝之人越多', '，天资卓绝之人越多'],
      ['发动于', '发动于许多'],
    ],
  }
  for (const [find, replacement] of replacements[lesson.order] ?? []) {
    changed = replaceText(allSegments, find, replacement) || changed
  }

  if (lesson.order === 41) changed = appendAfterTarget(document, 'blossom', '盛放') || changed
  if (lesson.order === 44) {
    removeText(allSegments, '蹂躏')
  }
  if (lesson.order === 48) changed = appendAfterTarget(document, 'concurrent', '同时') || changed
  if (lesson.order === 50) changed = appendAfterTarget(document, 'gum', '（牙龈）') || changed
  if (lesson.order === 51) {
    for (const segment of allSegments) {
      if (segment.type === 'targetWord' && segment.word === 'gum' && segment.definitionCn !== '牙龈') {
        segment.definitionCn = '牙龈'
        changed = true
      }
    }
  }
  if (lesson.order === 54) changed = appendAfterTarget(document, 'hat', '帽子') || changed
  if (lesson.order === 57) changed = appendAfterTarget(document, 'orange', '色') || changed

  if (lesson.order === 68) changed = repairLesson68(document) || changed
  if (lesson.order === 72) changed = repairLesson72(document) || changed
  if (lesson.order === 76) changed = repairLesson76(document) || changed
  if (lesson.order === 77) changed = repairLesson77(document) || changed

  if (lesson.order === 40) changed = replaceTargetContextText(document, 'volt', 'after', '伏特计，足以让人心惊。', '计，足以让人心惊。') || changed
  if (lesson.order === 44) {
    changed = replaceTargetContextText(document, 'enclose', 'before', '方源又在仙窍边缘', '封禁迅速') || changed
    changed = replaceTargetContextText(document, 'enclose', 'after', '附上一层封禁，遮住破口', '围住破口') || changed
    changed = replaceTargetContextText(document, 'enclose', 'after', '围住破口', '破口') || changed
    changed = replaceTargetContextText(document, 'rape', 'before', '凡俗所说的 ', '倪家幸存者指控敌人犯下 ') || changed
    changed = replaceTargetContextText(document, 'rape', 'after', '指强奸，并不适合形容劫火；真正漫过山谷的是黑潮般的火焰。', '等暴行；真正漫过山谷的是黑潮般的火焰。') || changed
  }
  if (lesson.order === 45) {
    changed = replaceTargetContextText(document, 'aggregate', 'after', '总计起来', '聚合起来') || changed
    changed = replaceTargetContextText(document, 'aggregate', 'after', '聚合起来', '起来') || changed
    changed = replaceTargetContextText(document, 'flap', 'before', '墟蝠残翼下的机关', '墟蝠残翼在风雪中') || changed
    changed = replaceTargetContextText(document, 'flap', 'after', '活板仍在风雪中晃动，声响仿佛还在回响。', '，声响仿佛还在回响。') || changed
  }
  if (lesson.order === 56) {
    changed = replaceTargetContextText(document, 'seal', 'before', '峰下水泽恰有一头', '随后取出') || changed
    changed = replaceTargetContextText(document, 'seal', 'after', '海豹游过；方源', '密封证词；峰下水泽里一头海豹游过；方源') || changed
    const sealParagraph = document.paragraphs.find((paragraph) => paragraph.segments.some((segment) => segment.type === 'targetWord' && segment.word === 'seal'))
    const sealIndex = sealParagraph?.segments.findIndex((segment) => segment.type === 'targetWord' && segment.word === 'seal') ?? -1
    const sealAfter = sealIndex >= 0 ? sealParagraph.segments[sealIndex + 1] : null
    if (sealAfter?.type === 'text') {
      const marker = '方源这才取出真正可用的封印。'
      const markerIndex = sealAfter.value.indexOf(marker)
      if (markerIndex >= 0) {
        const normalized = `证词；峰下水泽里一头海豹游过；${marker}`
        if (sealAfter.value !== normalized) { sealAfter.value = normalized; changed = true }
      }
    }
  }
  if (lesson.order === 68) {
    changed = replaceTargetContextText(document, 'rest', 'before', '没有留下', '时间所剩的') || changed
    changed = replaceTargetContextText(document, 'rest', 'after', '休息的时间便投入追杀。', '也不多，便投入追杀。') || changed
  }

  return changed ? JSON.stringify(document) : null
}

const readyCourse = await prisma.storyCourse.findFirst({
  where: { status: 'ready', readySlot: 'ready' },
  include: {
    lessons: {
      orderBy: { order: 'asc' },
      include: { words: { include: { word: true } } },
    },
  },
})

if (!readyCourse) throw new Error('Ready story course not found')

let changedLessons = 0
await prisma.$transaction(async (tx) => {
  for (const lesson of readyCourse.lessons) {
    const contentJson = repairLesson(lesson)
    if (!contentJson) continue
    await tx.storyLesson.update({ where: { id: lesson.id }, data: { contentJson } })
    changedLessons += 1
  }

  const meaningByWordAndDefinition = new Map()
  for (const spec of missingMeaningSpecs) {
    const word = await tx.word.findFirst({ where: { text: spec.word } })
    if (!word) throw new Error(`Missing word for new meaning: ${spec.word}`)
    let meaning = await tx.meaning.findFirst({ where: { wordId: word.id, definitionCn: spec.definitionCn } })
    if (!meaning) {
      meaning = await tx.meaning.create({ data: { wordId: word.id, partOfSpeech: spec.partOfSpeech, definition: spec.definition, definitionCn: spec.definitionCn, example: spec.example } })
    }
    meaningByWordAndDefinition.set(`${spec.word}:${spec.definitionCn}`, meaning)
  }

  for (const spec of storyMeaningSpecs) {
    const lesson = readyCourse.lessons.find((item) => item.order === spec.lesson)
    const storyWord = lesson?.words.find((item) => item.word.text === spec.word)
    if (!storyWord) throw new Error(`Story word not found for lesson ${spec.lesson} ${spec.word}`)
    const meaning = await tx.meaning.findFirst({ where: { wordId: storyWord.wordId, definitionCn: spec.definitionCn } })
    if (!meaning) throw new Error(`Meaning association not found for lesson ${spec.lesson} ${spec.word} -> ${spec.definitionCn}`)
    await tx.storyLessonWord.update({ where: { id: storyWord.id }, data: { meaningId: meaning.id, glossCn: meaning.definitionCn } })
  }

  for (const spec of missingMeaningSpecs) {
    const storyWord = await tx.storyLessonWord.findFirst({ where: { lesson: { courseId: readyCourse.id }, word: { text: spec.word } } })
    const meaning = meaningByWordAndDefinition.get(`${spec.word}:${spec.definitionCn}`)
    if (!storyWord || !meaning) throw new Error(`Story association not found for ${spec.word}`)
    await tx.storyLessonWord.update({ where: { id: storyWord.id }, data: { meaningId: meaning.id, glossCn: meaning.definitionCn } })
  }

  const gumMeaning = await tx.meaning.findFirst({ where: { word: { text: 'gum' }, definitionCn: '牙龈' } })
  const gumStoryWord = await tx.storyLessonWord.findFirst({ where: { lesson: { courseId: readyCourse.id, order: 51 }, word: { text: 'gum' } } })
  if (!gumMeaning || !gumStoryWord) throw new Error('Lesson 51 gum meaning association not found')
  await tx.storyLessonWord.update({ where: { id: gumStoryWord.id }, data: { meaningId: gumMeaning.id, glossCn: gumMeaning.definitionCn } })
})

console.log(`Updated ${changedLessons} lessons in ready course ${readyCourse.id}.`)
console.log('Semantic review: rape retains the existing 强奸 meaning and its story sentence now uses that meaning directly; sore retains the existing 疼痛的 meaning.')
await prisma.$disconnect()
