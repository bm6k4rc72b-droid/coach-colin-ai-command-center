import type { ConfidenceLevel } from '@/types'

/**
 * Determines confidence level based on score
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score < 30) return 'low'
  if (score <= 60) return 'medium'
  return 'high'
}

/**
 * Gets color class for confidence badge
 */
export function getConfidenceColorClass(level: ConfidenceLevel): string {
  switch (level) {
    case 'low':
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
    case 'medium':
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-600'
    case 'high':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-600'
  }
}

/**
 * Calculates initial confidence score based on report data
 */
export function calculateInitialConfidence(hasPhoto: boolean): number {
  let score = 50
  if (hasPhoto) {
    score += 20
  }
  return Math.min(100, score)
}

