/*
 * WordQuest · starter word bank
 *
 * Row format:
 *   [word, part of speech, phonetic, Chinese meaning, English definition,
 *    example sentence (must contain the word exactly), theme, confusables[]]
 *
 * To use your own list, replace RAW (or load JSON with the same fields)
 * and keep each example sentence containing the headword as written.
 */
(function (WQ) {
  'use strict';

  const RAW = [
    // Emotion
    ['ambivalent', 'adj.', '/æmˈbɪvələnt/', '矛盾的；情感复杂的', 'having mixed feelings about something', 'She felt ambivalent about leaving her hometown for the big city.', 'Emotion', ['ambiguous', 'ambitious']],
    ['apprehensive', 'adj.', '/ˌæprɪˈhensɪv/', '忧虑的；担心的', 'worried that something bad will happen', 'He was apprehensive about the interview, so he practised all night.', 'Emotion', ['comprehensive', 'apprehend']],
    ['complacent', 'adj.', '/kəmˈpleɪsnt/', '自满的；得意的', 'too satisfied with yourself to keep trying', "Don't grow complacent just because you won the first round.", 'Emotion', ['complaisant', 'compliant']],
    ['elated', 'adj.', '/iˈleɪtɪd/', '欢欣鼓舞的', 'extremely happy and excited', 'The players were elated by their last-minute victory.', 'Emotion', ['related', 'belated']],
    ['indignant', 'adj.', '/ɪnˈdɪɡnənt/', '愤慨的；义愤的', 'angry because something seems unfair', 'She was indignant when they blamed her for someone else\'s mistake.', 'Emotion', ['indigent', 'indifferent']],
    ['melancholy', 'n.', '/ˈmelənkəli/', '忧郁；悲伤', 'a deep sadness that lasts a long time', 'A quiet melancholy settled over the empty house after the guests left.', 'Emotion', ['melodrama']],
    ['nostalgic', 'adj.', '/nɒˈstældʒɪk/', '怀旧的', 'thinking about the past with longing', 'Old songs always make my grandfather feel nostalgic.', 'Emotion', ['neuralgic']],
    ['resentful', 'adj.', '/rɪˈzentfl/', '怨恨的；愤愤不平的', 'feeling bitter about unfair treatment', 'He grew resentful of colleagues who took credit for his work.', 'Emotion', ['respectful', 'resourceful']],
    ['sanguine', 'adj.', '/ˈsæŋɡwɪn/', '乐观的；充满希望的', 'cheerfully hopeful about the future', 'The doctor was sanguine about her chances of a full recovery.', 'Emotion', ['sanguinary', 'genuine']],
    ['wistful', 'adj.', '/ˈwɪstfl/', '惆怅的；渴望的', 'sadly thinking about something you cannot have', 'She gave a wistful smile as she looked through the old photos.', 'Emotion', ['wishful', 'watchful']],
    ['exasperated', 'adj.', '/ɪɡˈzɑːspəreɪtɪd/', '恼怒的；不耐烦的', 'very annoyed after putting up with something for a long time', 'The teacher was exasperated by the constant noise.', 'Emotion', ['exaggerated', 'evaporated']],
    ['jubilant', 'adj.', '/ˈdʒuːbɪlənt/', '喜气洋洋的；欢腾的', 'showing great joy about a success', 'Jubilant fans poured into the streets after the final.', 'Emotion', ['jubilee']],

    // Society
    ['affluent', 'adj.', '/ˈæfluənt/', '富裕的', 'having a lot of money and a good standard of living', 'They grew up in an affluent suburb with large gardens.', 'Society', ['effluent', 'fluent']],
    ['bureaucracy', 'n.', '/bjʊəˈrɒkrəsi/', '官僚体制；繁文缛节', 'a system with many complicated rules and offices', 'Getting a simple permit took months because of the bureaucracy.', 'Society', ['democracy', 'aristocracy']],
    ['consensus', 'n.', '/kənˈsensəs/', '共识；一致意见', 'general agreement among a group of people', 'After hours of debate, the committee finally reached a consensus.', 'Society', ['census', 'consent']],
    ['disparity', 'n.', '/dɪˈspærəti/', '差距；不平等', 'a large and often unfair difference', 'There is a huge disparity between the incomes of the rich and the poor.', 'Society', ['parity', 'disparage']],
    ['integrate', 'v.', '/ˈɪntɪɡreɪt/', '整合；使融入', 'to combine things so that they work together', 'The new app lets you integrate your calendar with your email.', 'Society', ['integral', 'intrigue']],
    ['marginalize', 'v.', '/ˈmɑːdʒɪnəlaɪz/', '使边缘化', 'to treat a person or group as unimportant', 'Good policies should not marginalize people who live in rural areas.', 'Society', ['maximize', 'minimize']],
    ['mandate', 'n.', '/ˈmændeɪt/', '授权；指令', 'the official authority to carry out a policy', 'The new government has a clear mandate to reform healthcare.', 'Society', ['mantle', 'manifest']],
    ['prosperity', 'n.', '/prɒˈsperəti/', '繁荣；兴旺', 'the state of being successful and having money', 'The new port brought decades of prosperity to the town.', 'Society', ['posterity', 'property']],
    ['reciprocal', 'adj.', '/rɪˈsɪprəkl/', '互惠的；相互的', 'given and received in return', 'The two universities signed a reciprocal agreement to exchange students.', 'Society', ['receptacle', 'recipient']],
    ['scrutiny', 'n.', '/ˈskruːtəni/', '仔细审查', 'careful and detailed examination', 'Every detail of the budget came under close scrutiny.', 'Society', ['mutiny', 'security']],
    ['solidarity', 'n.', '/ˌsɒlɪˈdærəti/', '团结；齐心协力', 'unity and support among people with shared interests', 'Workers across the country went on strike in solidarity.', 'Society', ['solitary', 'solidity']],
    ['alleviate', 'v.', '/əˈliːvieɪt/', '缓解；减轻', 'to make pain or a problem less severe', 'The medicine helped alleviate her pain.', 'Society', ['elevate', 'alienate']],

    // Thinking
    ['ambiguous', 'adj.', '/æmˈbɪɡjuəs/', '模棱两可的；含糊的', 'having more than one possible meaning', 'The ending of the film is deliberately ambiguous.', 'Thinking', ['ambivalent', 'ambitious']],
    ['arbitrary', 'adj.', '/ˈɑːbɪtrəri/', '任意的；武断的', 'based on chance or personal whim rather than reason', 'The rule seemed arbitrary, with no clear reason behind it.', 'Thinking', ['arbiter', 'military']],
    ['coherent', 'adj.', '/kəʊˈhɪərənt/', '连贯的；有条理的', 'logical and well organized', 'Her essay presents a clear and coherent argument.', 'Thinking', ['cohesive', 'adherent']],
    ['conjecture', 'n.', '/kənˈdʒektʃə(r)/', '猜测；推测', 'an opinion formed without proof', 'Without evidence, his theory is pure conjecture.', 'Thinking', ['conjunction', 'juncture']],
    ['deduce', 'v.', '/dɪˈdjuːs/', '推断；演绎', 'to reach a conclusion from the evidence available', 'From the muddy boots, the detective could deduce where he had been.', 'Thinking', ['deduct', 'induce']],
    ['fallacy', 'n.', '/ˈfæləsi/', '谬误；错误观念', 'a false belief or a mistake in reasoning', 'It is a fallacy that money always brings happiness.', 'Thinking', ['legacy', 'fallible']],
    ['intuitive', 'adj.', '/ɪnˈtjuːɪtɪv/', '直观的；凭直觉的', 'easy to understand without being taught; based on feeling', 'The app has an intuitive design that anyone can use.', 'Thinking', ['inductive', 'instinct']],
    ['meticulous', 'adj.', '/məˈtɪkjələs/', '一丝不苟的；极仔细的', 'very careful about every detail', 'She keeps meticulous records of every expense.', 'Thinking', ['ridiculous', 'miraculous']],
    ['plausible', 'adj.', '/ˈplɔːzəbl/', '似乎合理的；可信的', 'seeming reasonable or likely to be true', 'His excuse sounded plausible, but no one believed him.', 'Thinking', ['possible', 'feasible']],
    ['skeptical', 'adj.', '/ˈskeptɪkl/', '怀疑的', 'doubting that something is true or useful', 'Scientists remain skeptical of the miracle cure.', 'Thinking', ['cynical', 'septic']],
    ['tentative', 'adj.', '/ˈtentətɪv/', '试探性的；暂定的', 'not certain or fixed', 'They made tentative plans to meet next summer.', 'Thinking', ['attentive', 'tentacle']],
    ['verify', 'v.', '/ˈverɪfaɪ/', '核实；证实', 'to check that something is true or correct', 'Please verify your email address before logging in.', 'Thinking', ['vilify', 'versify']],

    // Change
    ['accelerate', 'v.', '/əkˈseləreɪt/', '加速；促进', 'to happen or make something happen faster', 'Climate change may accelerate the melting of glaciers.', 'Change', ['accentuate', 'celebrate']],
    ['catalyst', 'n.', '/ˈkætəlɪst/', '催化剂；促进因素', 'something that causes an important change', 'The invention of the printing press was a catalyst for social change.', 'Change', ['cataclysm', 'catalogue']],
    ['deteriorate', 'v.', '/dɪˈtɪəriəreɪt/', '恶化；变坏', 'to become worse', 'His health began to deteriorate in the winter.', 'Change', ['determinate', 'deter']],
    ['erode', 'v.', '/ɪˈrəʊd/', '侵蚀；逐渐削弱', 'to gradually destroy or weaken something', 'Repeated scandals can erode public trust in the government.', 'Change', ['corrode', 'erupt']],
    ['fluctuate', 'v.', '/ˈflʌktʃueɪt/', '波动；起伏', 'to change level often and irregularly', 'Vegetable prices fluctuate with the seasons.', 'Change', ['flutter', 'fluent']],
    ['inevitable', 'adj.', '/ɪnˈevɪtəbl/', '不可避免的', 'certain to happen and impossible to prevent', 'With so little preparation, failure was inevitable.', 'Change', ['inimitable', 'invaluable']],
    ['obsolete', 'adj.', '/ˈɒbsəliːt/', '过时的；淘汰的', 'no longer used because something newer exists', 'Smartphones have made many older gadgets obsolete.', 'Change', ['absolute', 'obstinate']],
    ['precipitate', 'v.', '/prɪˈsɪpɪteɪt/', '促成；使突然发生', 'to make something bad happen suddenly or sooner', "The bank's collapse could precipitate a wider crisis.", 'Change', ['participate', 'precipice']],
    ['revitalize', 'v.', '/ˌriːˈvaɪtəlaɪz/', '使恢复活力；振兴', 'to give new life or energy to something', 'The city plans to revitalize the old harbour district.', 'Change', ['revolutionize', 'realize']],
    ['stagnant', 'adj.', '/ˈstæɡnənt/', '停滞的；不流动的', 'not moving, growing or developing', 'The economy has been stagnant for nearly a decade.', 'Change', ['pregnant', 'stagger']],
    ['transient', 'adj.', '/ˈtrænziənt/', '短暂的；转瞬即逝的', 'lasting only a short time', 'Fame on social media is often transient.', 'Change', ['transit', 'transparent']],
    ['unprecedented', 'adj.', '/ʌnˈpresɪdentɪd/', '史无前例的', 'never having happened or existed before', 'The pandemic caused unprecedented disruption to daily life.', 'Change', ['precedent', 'unprepared']]
  ];

  const words = RAW.map(([word, pos, ipa, cn, en, example, theme, confusables]) => ({
    id: word, word, pos, ipa, cn, en, example, theme, confusables: confusables || []
  }));

  const byId = Object.fromEntries(words.map((w) => [w.id, w]));

  // Development check: every example must contain its headword.
  words.forEach((w) => {
    if (!new RegExp('\\b' + w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(w.example)) {
      console.warn('[WordQuest] Example sentence does not contain its word:', w.word);
    }
  });

  WQ.Words = {
    bankName: 'Advanced vocabulary starter pack',
    all: () => words,
    get: (id) => byId[id] || null,
    themes: () => Array.from(new Set(words.map((w) => w.theme)))
  };
})(window.WQ = window.WQ || {});
