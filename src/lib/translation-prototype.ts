import type { BlogPost } from "./posts";

interface PrototypeTranslation {
  title: string;
  bodyMarkdown: string;
}

export interface TranslationExpressionNote {
  source: string;
  current: string;
  alternatives: string[];
  explanation: string;
}

const englishTranslations = {
  "direction-of-life": {
    title: "A Direction for Life",
    bodyMarkdown: `Each day, I define the actions I believe are meaningful
and repeat the practice of carrying them out.

I do not define goals or dreams for my life.
I focus on moving forward each day, guided by only a faint sense of direction—or none at all.

I keep every desire at a low simmer.
I pursue things, but only to the point where not attaining them does not turn into suffering.`,
  },
  "mans-search-for-meaning": {
    title: "Man's Search for Meaning",
    bodyMarkdown: `Do not aim at success.
The more you make success your target and aim directly at it, the further away from it you move.
Success, like happiness, cannot be pursued; it must ensue.`,
  },
  "2026-07-16": {
    title: "July 16, 2026",
    bodyMarkdown: `Since yesterday, the entire city has suddenly smelled like something was burning,
and a pale haze has covered the skyline.

I went out for a run,
but the air felt heavy and suffocating,
like stepping into a greenhouse on a summer day.

The burnt smell and fine particles carried on the wind
seemed to seep into my nose,
like the air near a field where trash or plastic was being burned.

Cloudy weather could happen anywhere,
but the smell of burning was strange.

Still, I have not lived in Toronto for very long,
so I wondered, “Is this just something that happens here in summer?”

This morning, however, nothing had changed.

Was there a fire somewhere?
Even if there was, could it really affect the entire city?

Without thinking much of it, I casually asked GPT.

“Toronto has been cloudy lately, and the air smells a little burnt. What kind of weather is this?”

“This is not simply cloudy weather. Wildfire smoke has likely traveled down to Toronto. The haze and the smell of burning are both strong signs of wildfire smoke.”

“What are you talking about? Are there actual wildfires, or are you just guessing?”

“Yes, there are actual wildfires. I am not guessing. They are not near Toronto; the smoke has traveled on the wind from multiple fires in northern and northwestern Ontario, hundreds of kilometers away. Some northern communities are even under evacuation orders, although Toronto itself is not in direct danger from the flames.”

So there really was a fire!

<https://www.reuters.com/business/environment/wildfires-northern-ontario-bring-worlds-worst-air-quality-toronto-2026-07-15/>`,
  },
  writing: {
    title: "Writing",
    bodyMarkdown: `The act of writing is valuable to me in and of itself.

It allows me to observe Huseong Lee—from the vantage point of a self set apart from him—and see what he thinks and what he feels.

Even if what emerges from that observation and reflection is merely a dreadful string of words, riddled with repetition, a meager vocabulary, and impoverished expression,

the result does not matter.
The process alone is enough.`,
  },
  "mental-first-aid": {
    title: "Mental First Aid",
    bodyMarkdown: `When an unexpected event leaves my emotions and mind unstable,
I need to respond as soon as possible.

I go to the grocery store and buy ice cream and snacks.
I order something delicious.
After eating my fill, I put on a sleep mask and go to bed.

Sleep keeps negative feelings from endlessly amplifying in my head
and stops them from bursting out as impulsive words and actions
that could hurt me and the people around me.

It briefly breaks the chain reaction of emotion
that would otherwise keep feeding on itself.

When I wake up,
the outline of the event—once swollen by emotion—has settled,
and I can finally take it in as information
rather than as emotion.

Then
I can take another step forward from where I am.`,
  },
  "2026-07-14": {
    title: "July 14, 2026",
    bodyMarkdown: `I went to H Mart because I wanted sashimi.
I thought they might sell grocery-store sashimi like supermarkets in Korea do.
Perhaps because the store was small, they did not sell any at all.

I would have settled for bread or a sandwich,
but it was morning and the shelves had not been stocked yet. The few items available were not appealing.

So I went home and paid about $32 to order sushi,
but the quality was terrible.

Today I learned that a small H Mart may not carry sashimi.
I also learned that H Mart does not put out its bread until 9:40 in the morning.
And I discovered that delivery sushi in Toronto can be even worse than I expected.

A much larger H Mart is supposed to open soon at Cummer. They may sell sashimi there, so I plan to visit once it opens.`,
  },
  "sharpening-thought": {
    title: "To Sharpen My Thinking",
    bodyMarkdown: `If I expand my vocabulary
and give my thoughts more precise language,

I can draw those thoughts back out of language,
reflect on them, and hone them further.`,
  },
  "sufficient-sleep": {
    title: "Enough Sleep",
    bodyMarkdown: `When it comes to securing the ability to think clearly,

regular exercise,
a healthy diet,
enough sunlight,
and sufficient fiber
all make a meaningful difference.

But for me, nothing matters more than getting a full eight hours of sleep.`,
  },
  "every-other-day-running": {
    title: "Running Every Other Day",
    bodyMarkdown: `I ran 3.3 kilometers every day.

But the more I ran, the heavier my legs became.
The refreshment and small sense of achievement that running once gave me gradually disappeared as well.

I suspect that running every day, on top of long walks,
did not give my legs enough time to recover.

From now on, I plan to run one day and walk the next,
giving my body time to recover.`,
  },
  "language-controls-thought": {
    title: "Language Governs Thought",
    bodyMarkdown: `Language is merely an output that holds thought.

And yet, ironically,
the language in which I choose to hold a thought
determines the path that thought will take.`,
  },
} satisfies Record<string, PrototypeTranslation>;

export const englishExpressionNotes: Record<string, TranslationExpressionNote[]> = {
  "direction-of-life": [
    {
      source: "옅은 방향성",
      current: "a faint sense of direction",
      alternatives: ["a loose direction", "a gentle bearing"],
      explanation: "‘faint’는 방향이 선명하지 않다는 뜻을 살린다. ‘loose’는 덜 시적이고 더 실용적으로 들린다.",
    },
    {
      source: "미약한 갈망 상태",
      current: "keep every desire at a low simmer",
      alternatives: ["hold every desire lightly", "keep desire subdued"],
      explanation: "‘at a low simmer’는 갈망이 사라지지는 않지만 약하게 계속되는 모습을 비유적으로 표현한다.",
    },
  ],
  "mans-search-for-meaning": [
    {
      source: "찾아오는 것이다",
      current: "it must ensue",
      alternatives: ["it comes as a result", "it follows naturally"],
      explanation: "‘ensue’는 원문의 인용문에서 쓰인 격식 있는 표현이다. 다른 대안은 더 쉬우나 문장의 무게가 줄어든다.",
    },
  ],
  "2026-07-16": [
    {
      source: "별 생각 없이 GPT에게 툭 던졌다",
      current: "I casually asked GPT",
      alternatives: ["I tossed the question to GPT", "I asked GPT offhandedly"],
      explanation: "‘casually asked’가 가장 자연스럽다. ‘tossed the question’은 ‘툭 던졌다’의 동작감을 더 살린다.",
    },
  ],
  writing: [
    {
      source: "그 자체로",
      current: "in and of itself",
      alternatives: ["in its own right", "for its own sake"],
      explanation: "결과와 무관한 글쓰기 자체의 가치를 강하게 강조한다. ‘in its own right’는 조금 더 자연스럽고 덜 무겁다.",
    },
    {
      source: "관찰과 고민으로 빚어진 것",
      current: "what emerges from that observation and reflection",
      alternatives: ["what is shaped by that reflection", "what grows out of it"],
      explanation: "‘emerges’는 서서히 생겨난 느낌이고, ‘is shaped by’는 원문의 ‘빚다’라는 조형 이미지를 더 살린다.",
    },
    {
      source: "점철된",
      current: "riddled with",
      alternatives: ["marked by", "burdened by"],
      explanation: "‘riddled with’는 결함이 가득하다는 강한 자기비판이다. ‘marked by’는 더 차분하고 객관적이다.",
    },
  ],
  "mental-first-aid": [
    {
      source: "감정의 연쇄",
      current: "the chain reaction of emotion",
      alternatives: ["the emotional spiral", "the chain of emotions"],
      explanation: "‘chain reaction’은 감정이 다음 감정을 증폭시키는 인과를 강조한다. ‘emotional spiral’은 통제력을 잃는 느낌이 더 강하다.",
    },
  ],
  "2026-07-14": [
    {
      source: "딱히 끌리는 제품이 아니었다",
      current: "were not appealing",
      alternatives: ["did not tempt me", "did not look particularly good"],
      explanation: "‘not appealing’은 무난하고 자연스럽다. ‘did not tempt me’는 개인적인 식욕과 끌림을 더 직접적으로 표현한다.",
    },
  ],
  "sharpening-thought": [
    {
      source: "사고를 벼리다",
      current: "hone them further",
      alternatives: ["sharpen my thinking", "refine those thoughts"],
      explanation: "‘hone’은 칼날을 벼리는 원문의 비유를 자연스럽게 유지한다. ‘refine’은 비유가 약하지만 의미가 가장 명확하다.",
    },
  ],
  "sufficient-sleep": [
    {
      source: "고품질의 사고 능력",
      current: "the ability to think clearly",
      alternatives: ["high-quality thinking", "strong cognitive performance"],
      explanation: "직역보다 자연스러운 영어를 위해 ‘명료하게 생각하는 능력’으로 풀었다. ‘cognitive performance’는 더 기술적이다.",
    },
  ],
  "every-other-day-running": [
    {
      source: "기분 전환과 작은 성취감",
      current: "the refreshment and small sense of achievement",
      alternatives: ["the mental reset and modest accomplishment", "the lift and small win"],
      explanation: "‘refreshment’는 문어적이다. ‘mental reset’은 현대적이고 의미가 분명하며 ‘small win’은 더 가벼운 말투다.",
    },
  ],
  "language-controls-thought": [
    {
      source: "사고의 궤적",
      current: "the path that thought will take",
      alternatives: ["the trajectory of my thinking", "the course of thought"],
      explanation: "‘trajectory’가 궤적의 비유를 정확히 살리지만 다소 학술적이다. 현재 문장은 쉬운 영어로 의미를 풀었다.",
    },
  ],
};

export function translatePostsForAdmin(posts: readonly BlogPost[]): BlogPost[] {
  return posts.map((post) => {
    const translation = englishTranslations[post.id as keyof typeof englishTranslations];
    if (!translation) return post;
    return {
      ...post,
      data: { ...post.data, title: translation.title },
      bodyMarkdown: translation.bodyMarkdown,
    };
  });
}
