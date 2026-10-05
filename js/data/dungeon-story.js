/*
 * WordQuest · story lines for Lexicon Dungeon
 *
 * Every word gets one sentence that happens inside the dungeon. The line
 * must contain the headword exactly (it becomes the fill-in-the-blank), and
 * it is tagged with the room it fits best, so a run reads like one story:
 * gate → battles → treasure chest → elite guard → dragon.
 *
 * Placeholders: {hero} = the player's display name, {foe} = the monster in
 * the room (lowercase). Lines never start with the headword, so the
 * completed sentence always reads naturally.
 */
(function (WQ) {
  'use strict';

  const LINES = {
    // Emotion
    ambivalent: ['gate', 'At the gate, {hero} felt ambivalent: eager to go in, yet afraid of what waited below.'],
    apprehensive: ['gate', '{hero} grew apprehensive as the torchlight revealed claw marks on the floor.'],
    complacent: ['battle', 'The {foe} had grown complacent after years without a visitor, and it never saw the first spell coming.'],
    elated: ['chest', '{hero} was elated to find the chest unlocked and still full.'],
    indignant: ['battle', 'The {foe} looked indignant, as if nobody had ever dared to fight back.'],
    melancholy: ['battle', 'A strange melancholy hung over the hall, as if the stones remembered better days.'],
    nostalgic: ['chest', 'An old coin in the chest made {hero} nostalgic for the village far above.'],
    resentful: ['elite', 'The {foe} was resentful of every adventurer who had walked past its post.'],
    sanguine: ['boss', 'Even facing the dragon, {hero} stayed sanguine, certain that the right word would come.'],
    wistful: ['chest', '{hero} gave the empty bottle a wistful look; one more potion would have helped.'],
    exasperated: ['battle', 'The {foe} was exasperated by a third wrong word and slammed its tail against the wall.'],
    jubilant: ['boss', 'A jubilant cheer from {hero} echoed down the corridor as the dragon finally fell.'],

    // Society
    affluent: ['chest', 'Whoever built this vault was affluent; even the hinges were made of gold.'],
    bureaucracy: ['elite', 'The {foe} guarded a mountain of forms, a bureaucracy of the dead that let no one pass without a stamp.'],
    consensus: ['battle', 'The bats above the door reached a consensus and dived at {hero} all at once.'],
    disparity: ['boss', 'The disparity in size was absurd: one hero against a dragon that filled the whole hall.'],
    integrate: ['elite', 'Each new spell had to integrate with the last, or the chain of magic would break.'],
    marginalize: ['battle', 'Nobody should marginalize a small monster; the {foe} proved that in seconds.'],
    mandate: ['gate', '{hero} entered with a clear mandate from the village: bring back the stolen dictionary.'],
    prosperity: ['chest', 'The chest spoke of old prosperity: coins, jewels, and a map to more.'],
    reciprocal: ['battle', 'The duel was reciprocal: for every spell {hero} cast, the {foe} answered with a bite.'],
    scrutiny: ['elite', 'Under the scrutiny of the {foe}, every letter had to be exactly right.'],
    solidarity: ['battle', 'The torches flared in solidarity as {hero} raised the sword again.'],
    alleviate: ['chest', 'A red potion in the chest could alleviate the pain of the last fight.'],

    // Thinking
    ambiguous: ['battle', 'The runes on the wall were ambiguous; they could be a warning or a welcome.'],
    arbitrary: ['elite', 'The rules of the {foe} seemed arbitrary, but breaking them cost a heart.'],
    coherent: ['boss', 'To beat the dragon, {hero} needed one coherent sentence, not a pile of words.'],
    conjecture: ['gate', 'That the dungeon had six rooms was only conjecture; nobody had come back to count.'],
    deduce: ['battle', 'From the scratches on the floor, {hero} could deduce that the {foe} was close.'],
    fallacy: ['battle', 'It was a fallacy to think the {foe} would stay asleep.'],
    intuitive: ['battle', 'The first spell felt intuitive, as if the sword already knew the word.'],
    meticulous: ['elite', 'The {foe} was meticulous and would notice a single misplaced letter.'],
    plausible: ['chest', 'A trap seemed plausible, so {hero} opened the chest with the tip of the sword.'],
    skeptical: ['boss', 'The dragon stayed skeptical until the third spell burned its scales.'],
    tentative: ['gate', '{hero} took a tentative step into the dark, listening for wings.'],
    verify: ['elite', 'Before the arch would open, the {foe} had to verify every spelling.'],

    // Change
    accelerate: ['battle', 'The fight began to accelerate; the {foe} struck twice for every spell.'],
    catalyst: ['boss', 'One word was the catalyst that turned the dragon\'s roar into a whimper.'],
    deteriorate: ['battle', 'The old torches had begun to deteriorate, and the hall grew darker with each step.'],
    erode: ['battle', 'Centuries of dripping water had managed to erode the steps into a slope.'],
    fluctuate: ['battle', 'The flames seemed to fluctuate whenever the {foe} breathed.'],
    inevitable: ['boss', 'The meeting with the dragon felt inevitable; every corridor led to its hall.'],
    obsolete: ['chest', 'The map in the chest was obsolete; half the rooms it showed no longer existed.'],
    precipitate: ['boss', 'A single wrong word could precipitate the dragon\'s attack.'],
    revitalize: ['chest', 'The potion seemed to revitalize {hero} at once, like a night of sleep in a single sip.'],
    stagnant: ['battle', 'The air in the hall was stagnant and smelled of old ink.'],
    transient: ['battle', 'The shadow of the {foe} was transient, there one moment and gone the next.'],
    unprecedented: ['boss', 'A dragon that spoke in riddles was unprecedented, even in the oldest tales.']
  };

  /** Narration shown when a room is entered (and the two endings) */
  const NARRATION = {
    gate: 'The gate groans open. {hero} steps into the torchlight.',
    battle: 'A {foe} blocks the corridor.',
    chest: 'A chest waits in the shadows, its lock humming with a riddle.',
    elite: 'The {foe} guards the next arch and demands every letter.',
    boss: 'The hall opens wide. The {foe} lifts its head.',
    win: 'The dragon falls and the stolen dictionary is safe. {hero} walks back toward the light.',
    lose: 'The torches go out one by one. The tale of {hero} pauses here, for now.'
  };

  /** Chapter flavour by the dominant theme of the words in a run */
  const CHAPTERS = {
    Emotion: { title: 'The Hall of Feelings', color: 0xc2457a, dust: 0xffb0d8 },
    Society: { title: 'The Court Below', color: 0xc9941c, dust: 0xffe0a0 },
    Thinking: { title: 'The Riddle Vault', color: 0x1f9a8f, dust: 0xa8fff0 },
    Change: { title: 'The Shifting Halls', color: 0xc9522a, dust: 0xffc49a }
  };

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
  }

  WQ.DungeonStory = {
    /** { stage, text } for a word; falls back to the dictionary example */
    lineFor(word) {
      const l = LINES[word.id];
      return l ? { stage: l[0], text: l[1] } : { stage: 'battle', text: word.example };
    },
    narration: (key, vars) => fill(NARRATION[key] || '', vars),
    fill,
    chapterFor(words) {
      const counts = {};
      words.forEach((w) => { counts[w.theme] = (counts[w.theme] || 0) + 1; });
      const theme = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'Thinking';
      return Object.assign({ theme }, CHAPTERS[theme] || CHAPTERS.Thinking);
    }
  };

  // Development check: every story line must contain its headword.
  Object.keys(LINES).forEach((id) => {
    const re = new RegExp('\\b' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (!re.test(LINES[id][1])) console.warn('[WordQuest] Dungeon line does not contain its word:', id);
  });
})(window.WQ = window.WQ || {});
