import type { StoryReference } from '@/lib/story-references'

export type WordSentence = {
  readonly sentenceText: string
  readonly sentenceCn: string | null
  readonly contextTopic: string | null
}

export type WordMeaning = {
  readonly id: string
  readonly partOfSpeech: string
  readonly definition: string
  readonly definitionCn: string | null
  readonly userWordMeanings: readonly {
    readonly id: string
    readonly mastery: number
    readonly easeFactor: number
    readonly interval: number
    readonly nextReviewAt: string
    readonly sentences: readonly WordSentence[]
  }[]
}

export type UserWordInfo = {
  readonly id: string
  readonly mastery: number
  readonly status: string
  readonly bookmarked: boolean
}

export type WordDetail = {
  readonly id: string
  readonly text: string
  readonly meanings: readonly WordMeaning[]
  readonly userWords: readonly UserWordInfo[]
  readonly groups: readonly {
    readonly wordGroup: { readonly id: string; readonly name: string }
  }[]
}

export type WordDetailResponse = {
  readonly word: WordDetail
  readonly storyReferences: readonly StoryReference[]
}
